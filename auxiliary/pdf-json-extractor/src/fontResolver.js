function safeGetKeys(value) {
  if (!value || typeof value !== "object") return [];
  try {
    return Object.keys(value);
  } catch {
    return [];
  }
}

function inferEncoding(fontObj = null) {
  if (!fontObj || typeof fontObj !== "object") {
    return { encoding: null, reason: "font_object_unavailable" };
  }

  if (fontObj.encoding && typeof fontObj.encoding === "string") {
    return { encoding: fontObj.encoding, reason: "font.encoding" };
  }

  if (fontObj.toUnicode) {
    return { encoding: "ToUnicode", reason: "toUnicode_available" };
  }

  if (fontObj.differences) {
    return { encoding: "Differences", reason: "differences_table_available" };
  }

  return { encoding: null, reason: "encoding_not_exposed" };
}

function probeFontObject(fontObj = null) {
  if (!fontObj || typeof fontObj !== "object") {
    return {
      available: false,
      reason: "font_not_in_commonObjs",
      details: {}
    };
  }

  const encodingInfo = inferEncoding(fontObj);
  const metrics = {
    ascent: Number.isFinite(Number(fontObj.ascent)) ? Number(fontObj.ascent) : null,
    descent: Number.isFinite(Number(fontObj.descent)) ? Number(fontObj.descent) : null,
    capHeight: Number.isFinite(Number(fontObj.capHeight)) ? Number(fontObj.capHeight) : null,
    defaultWidth: Number.isFinite(Number(fontObj.defaultWidth)) ? Number(fontObj.defaultWidth) : null
  };

  return {
    available: true,
    reason: "font_in_commonObjs",
    details: {
      subtype: fontObj.subtype || fontObj.type || null,
      loadedName: fontObj.loadedName || null,
      fallbackName: fontObj.fallbackName || null,
      isType3Font: Boolean(fontObj.isType3Font),
      isEmbeddedFont: fontObj.isEmbeddedFont ?? null,
      unicodeMapping: Boolean(fontObj.toUnicode),
      encoding: encodingInfo.encoding,
      encodingReason: encodingInfo.reason,
      metrics,
      fontDataAvailable: Boolean(fontObj.data),
      fontDataLength: Number(fontObj?.data?.length || 0) || null,
      keys: safeGetKeys(fontObj)
    }
  };
}

export function resolveFontResourcesForPage(page, textContent = {}, pageNumber = 1) {
  const styles = textContent?.styles || {};
  const entries = [];

  for (const [fontName, style] of Object.entries(styles)) {
    let fontObj = null;
    let commonObjLookupReason = "commonObjs_lookup_failed";

    try {
      if (page?.commonObjs?.has?.(fontName)) {
        fontObj = page.commonObjs.get(fontName);
        commonObjLookupReason = "commonObjs_hit";
      } else {
        commonObjLookupReason = "commonObjs_miss";
      }
    } catch {
      commonObjLookupReason = "commonObjs_exception";
      fontObj = null;
    }

    const probe = probeFontObject(fontObj);

    entries.push({
      page: pageNumber,
      fontName,
      textStyle: {
        fontFamily: style?.fontFamily || null,
        fontSubstitution: style?.fontSubstitution || null,
        ascent: Number.isFinite(Number(style?.ascent)) ? Number(style.ascent) : null,
        descent: Number.isFinite(Number(style?.descent)) ? Number(style.descent) : null,
        vertical: Boolean(style?.vertical)
      },
      commonObjsLookup: commonObjLookupReason,
      resolver: probe
    });
  }

  return entries;
}
