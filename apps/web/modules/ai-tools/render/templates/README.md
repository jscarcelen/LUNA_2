# AI Tool Templates

Templates are presentation machines.

The generator returns content JSON.
The template decides how that content looks in HTML, PDF, Word, or any future format.

## Contract rule

The JSON must describe content fields only.

Examples:
- `title`
- `instructions`
- `questions[]`
- `answer`
- `explanation`
- `sourceRefs[]`

The JSON should not decide typography, spacing, borders, colors, page layout, or export formatting.

That belongs to the template.

## Current template

- `quiz-generator-v1.js`

It renders the same quiz JSON into:
- website HTML preview
- DOCX content structure
- PDF layout

## Why this scales

When a new template is needed, the same content JSON can feed:
- student version
- teacher answer-key version
- printable exam version
- branded institution version

The generator does not need to change for those format variations.
