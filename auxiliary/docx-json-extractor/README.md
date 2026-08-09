# DOCX JSON Extractor Lab

This is an isolated DOCX to JSON extraction laboratory for building a high-fidelity
document tree from `Statistics.docx`.

It does not import the website document-processing pipeline.

## Input

The extractor uses the repository root benchmark file:

- `../../Statistics.docx`

The `input/` folder exists only as a logical anchor for the lab.

## Commands

```bash
cd auxiliary/docx-json-extractor
npm run extract
npm run render
npm run validate
```

## Output

- `output/statistics.json`
- `output/statistics.summary.json`
- `output/statistics.html`
- `output/statistics.md`
- `output/assets/*`

## Notes

- The full JSON tree is the authoritative output.
- The summary JSON is only for easier inspection.
- Unsupported OOXML is preserved as `unsupported` nodes and diagnostics.