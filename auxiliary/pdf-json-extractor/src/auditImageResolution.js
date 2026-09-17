import path from "node:path";
import { pathToFileURL } from "node:url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadPdfForRawModel } from "./rawPageModel.js";
import { ensureDir, parseArgs, readBinaryFile, resolveProjectPath, writeJson } from "./utils.js";

const outputDir = path.join(process.cwd(), "output");
const reportFile = path.join(outputDir, "image-resolution-report.json");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

const imageOpCodes = new Set([
  pdfjsLib.OPS.paintImageXObject,
  pdfjsLib.OPS.paintInlineImageXObject,
  pdfjsLib.OPS.paintImageMaskXObject,
  pdfjsLib.OPS.paintImageXObjectRepeat
]);

const opNameByCode = new Map(Object.entries(pdfjsLib.OPS || {}).map(([name, code]) => [code, name]));

function summarize(images = []) {
  const bytesAvailable = images.filter((image) => image?.resolution?.bytesAvailable).length;
  const viaPageObjs = images.filter((image) => image?.resolution?.source === "page.objs").length;
  const viaCommonObjs = images.filter((image) => image?.resolution?.source === "page.commonObjs").length;

  return {
    imageCount: images.length,
    bytesAvailable,
    viaPageObjs,
    viaCommonObjs
  };
}

function extractBytesMeta(candidate = null) {
  if (!candidate || typeof candidate !== "object") {
    return { bytesAvailable: false, reason: "object_unavailable", width: null, height: null, bytesLength: null, mimeType: null };
  }

  const width = Number(candidate?.width || candidate?.w || 0) || null;
  const height = Number(candidate?.height || candidate?.h || 0) || null;

  let bytesLength = null;
  if (candidate?.data?.length) bytesLength = Number(candidate.data.length);
  else if (candidate?.imgData?.data?.length) bytesLength = Number(candidate.imgData.data.length);
  else if (candidate?.bitmap?.data?.length) bytesLength = Number(candidate.bitmap.data.length);

  const mimeType = candidate?.mimeType || candidate?.kind || null;

  return {
    bytesAvailable: Boolean(bytesLength),
    reason: bytesLength ? "decoded_image_data_present" : "no_binary_buffer_exposed",
    width,
    height,
    bytesLength,
    mimeType
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = args.input ? path.resolve(process.cwd(), args.input) : DEFAULT_INPUT;

  await ensureDir(outputDir);

  const sourceBuffer = await readBinaryFile(sourceFile);
  const pdf = await loadPdfForRawModel(sourceBuffer);

  const images = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const operatorList = await page.getOperatorList();
    const fnArray = Array.isArray(operatorList?.fnArray) ? operatorList.fnArray : [];
    const argsArray = Array.isArray(operatorList?.argsArray) ? operatorList.argsArray : [];

    for (let index = 0; index < fnArray.length; index += 1) {
      const opCode = Number(fnArray[index]);
      const opName = opNameByCode.get(opCode) || `OP_${opCode}`;
      const argsEntry = argsArray[index] || [];
      const isImageOp = imageOpCodes.has(opCode);
      if (!isImageOp) continue;

      const objectId = typeof argsEntry?.[0] === "string" ? argsEntry[0] : null;

      let pageObjValue = null;
      let commonObjValue = null;
      let pageObjReason = "no-object-id";
      let commonObjReason = "no-object-id";

      if (objectId) {
        try {
          if (page?.objs?.has?.(objectId)) {
            pageObjValue = page.objs.get(objectId);
            pageObjReason = "hit";
          } else {
            pageObjReason = "miss";
          }
        } catch {
          pageObjReason = "exception";
        }

        try {
          if (page?.commonObjs?.has?.(objectId)) {
            commonObjValue = page.commonObjs.get(objectId);
            commonObjReason = "hit";
          } else {
            commonObjReason = "miss";
          }
        } catch {
          commonObjReason = "exception";
        }
      }

      const pageObjMeta = extractBytesMeta(pageObjValue);
      const commonObjMeta = extractBytesMeta(commonObjValue);

      const resolution = pageObjMeta.bytesAvailable
        ? { ...pageObjMeta, source: "page.objs" }
        : commonObjMeta.bytesAvailable
          ? { ...commonObjMeta, source: "page.commonObjs" }
          : {
              bytesAvailable: false,
              source: null,
              reason: "bytes_not_exposed_in_current_api_path",
              width: pageObjMeta.width || commonObjMeta.width || null,
              height: pageObjMeta.height || commonObjMeta.height || null,
              bytesLength: null,
              mimeType: null
            };

      images.push({
        page: pageNumber,
        operatorIndex: index,
        operatorCode: opCode,
        operatorName: opName,
        objectId,
        argsPreview: Array.isArray(argsEntry) ? argsEntry.slice(0, 4) : argsEntry,
        probes: {
          pageObjs: pageObjReason,
          commonObjs: commonObjReason
        },
        resolution
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile,
    summary: summarize(images),
    limitations: [
      "Image binary streams are often decoded and consumed internally by PDF.js rendering paths before being exposed as stable byte arrays.",
      "Inline images and masks may not have persistent object IDs in objs/commonObjs caches.",
      "Current extraction path can preserve geometry and operator provenance even when byte payload remains unavailable."
    ],
    images
  };

  await writeJson(reportFile, report);
  console.log(JSON.stringify({ reportFile, summary: report.summary }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
