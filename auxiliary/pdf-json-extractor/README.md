# Document Canonical Model Lab

This isolated lab builds a source-agnostic canonical JSON document tree and renders from that tree.
It does not modify or import the web runtime pipeline.

## Canonical architecture

Input Adapter -> Evidence Layer -> Canonical Document Model (CDM v3) -> multiple renderers

Current reference implementation:

PDF Adapter -> Raw PDF Page Model -> PDF State Replayer -> Text Paint Objects -> Evidence Layer -> CDM v3 -> Fidelity/Semantic renderers

Future adapters feed the same CDM:

- OCR Adapter (printed OCR)
- Handwriting Adapter
- Image Adapter
- DOCX Adapter

Scope guardrails for this package:

- Canonical JSON is the source of truth.
- HTML and Markdown are derived artifacts from canonical JSON.
- Visual fidelity outputs are diagnostic and are not release blockers for semantic ingestion quality.

The JSON tree is the source of truth for:

- semantic structure (heading, paragraph, equation, list, table, image, header/footer/pageNumber)
- geometry (bbox, page, reading order, region)
- style (font family/size/weight, italic, vertical align, spacing)
- source-neutral provenance (`sourceRefs[]` with `sourceId/sourceType/kind`)
- confidence model (`overall/text/geometry/classification/style/math`)
- observed vs inferred attribution (`evidenceStatus` fields)

## Input

Default input file (if no --input is provided):

- `../../Statistics.pdf`

Custom input:

```bash
npm run extract -- --input /absolute/path/to/file.pdf
```

## Commands

```bash
cd auxiliary/pdf-json-extractor
npm install

# optional fixtures
npm run sample
npm run sample:adversarial
npm run fixtures:mock-sources

# raw source diagnostics
npm run inspect:source -- --input ../../Statistics.pdf
npm run inspect:source -- --input ../../Statistics.pdf --page 1

# pipeline
npm run pipeline:run -- --input ../../Statistics.pdf
npm run extract -- --input ../../Statistics.pdf
npm run render
npm run validate
npm run validate:invariants
npm run fidelity
npm run compare -- --input ../../Statistics.pdf
npm run audit:coverage
npm run audit:equations
npm run audit:equation-source-trace
npm run audit:text-state
npm run audit:text-loss -- --input ../../Statistics.pdf
npm run audit:operator-loss
npm run audit:fonts
npm run audit:font-resolution -- --input ../../Statistics.pdf
npm run audit:images
npm run audit:image-resolution -- --input ../../Statistics.pdf
npm run audit:vectors
npm run benchmark:extractors
npm test
```

Constrained benchmark workflow (no production architecture changes):

```bash
cd auxiliary/pdf-json-extractor

# 1) Produce current PDF.js canonical outputs for Statistics.pdf
npm run benchmark:extractors

# 2) Re-run with Adobe artifacts when available
node src/benchmarkExtractors.js \
  --input ../../Statistics.pdf \
  --adobe-json ./output/bench-input/adobe.json \
  --adobe-md ./output/bench-input/adobe.md
```

Benchmark outputs:

- `output/benchmark/pdfjs.json`
- `output/benchmark/adobe.json`
- `output/benchmark/vision-repair.json`
- `output/benchmark/comparison.json`
- `output/benchmark/decision.json`
- `output/benchmark/gold-standard.json`

## Outputs

- `debug/source/page-001.json` (raw PDF.js page dump)
- `debug/source/page-002.json`
- `debug/source/page-...json`
- `output/document.json` (canonical tree, v2)
- `output/document.json` (canonical tree, CDM v3)
- `output/document.summary.json`
- `output/raw-pages.json` (loss-minimizing raw page model)
- `output/text-paints.json` (state-replayed text paint objects)
- `output/loss-accounting.json` (terminal status for each source object)
- `output/document.semantic.html`
- `output/document.fidelity.html`
- `output/document.debug.html` (clickable JSON node inspector)
- `output/document.md`
- `output/document.comparison.json`
- `output/preservation-report.json`
- `output/equation-report.json`
- `output/equation-report.html`
- `output/equation-source-trace.json`
- `output/text-state-report.json`
- `output/text-state-debug.html`
- `output/text-loss.json`
- `output/text-loss.html`
- `output/operator-loss.json`
- `output/font-audit.json`
- `output/font-resolution-report.json`
- `output/image-report.json`
- `output/image-resolution-report.json`
- `output/vector-report.json`
- `output/mock-fixtures/*.json`

## First-principles module layout

The lab now includes explicit layered modules that preserve source evidence first and add interpretation second:

- `src/ingestion/`
	- `pdfIngestor.js`
	- `imageIngestor.js`
- `src/source/`
	- `pdfSourceModel.js`
	- `imageSourceModel.js`
- `src/canonical/`
	- `canonicalPageModel.js`
	- `normalize.js`
	- `provenance.js`
- `src/interpretation/`
	- `text.js`
	- `math.js`
	- `tables.js`
	- `regions.js`
	- `ocr.js`
- `src/rendering/fidelity/`
	- `htmlRenderer.js`
	- `svgRenderer.js`
	- `textRenderer.js`
	- `imageRenderer.js`
- `src/rendering/semantic/`
	- `htmlRenderer.js`
- `src/fidelity/`
	- `pdfRasterizer.js`
	- `compare.js`
- `src/validation/`
	- `schema.js`
	- `invariants.js`
- `src/pipeline/index.js`
	- orchestrates ingestion -> evidence -> canonical -> interpretation -> rendering -> validation

## Comparison model

`compare` produces two score groups:

- contentFidelity: text similarity, heading/equation/image/table/list recall
- visualFidelity: page-level layout similarity via per-node geometry alignment and issue list

Current visual fidelity implementation is geometry-based (node IoU/displacement) and is designed as an incremental step toward full pixel-level raster comparison.

## Provenance and coordinate system

- Canonical nodes include source-neutral `sourceRefs`:
	- `{ sourceId, sourceType, kind }`
	- for example `{ sourceId: "p1-text-00037", sourceType: "pdf-text", kind: "textObject" }`
- Text paint objects preserve `sourceRefs` for both operator-level provenance and mapped text object provenance.
- Text state replay captures CTM, text matrices, font, spacing, text rise, rendering mode, and color state at each text paint operation.
- Coordinate conversion is explicit and tested:
	- PDF origin: bottom-left
	- HTML origin: top-left
	- transform: `htmlY = pageHeight - pdfY - elementHeight`

## Loss accounting statuses

Every raw source object receives one terminal status:

- `preserved+interpreted`
- `preserved+uninterpreted`
- `intentionally_ignored`
- `unavailable_from_parser`
- `error`

## CDM v3 migration notes

- `schemaVersion` changed from `pdf-canonical-tree-v2` to `cdm-v3`.
- Pages now include source-agnostic fields:
	- `sourceType`
	- `source`
	- `evidence[]`
- Canonical elements now include:
	- `sourceRefs[]` as sourceRef objects
	- `sourceRefIds[]` (legacy-friendly source IDs)
	- `confidence`
	- `evidenceStatus`
- Provenance supports both:
	- multiple evidence objects per canonical node
	- one evidence object mapped to multiple canonical nodes
