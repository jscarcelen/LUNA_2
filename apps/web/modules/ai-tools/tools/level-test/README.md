# level-test

The Level Test built-in agent: a diagnostic pre-test of the FOUNDATIONS a document builds on (for a language: words, sentences, negatives, questions, tenses; for history: the background that leads to an event; for maths or economics: the prerequisite concepts and skills), grouped into components. `topic` carries the component name so the answers group by it.

- `levelAgent.js` — the config object (prompt, guided questions, output fields).
- `index.js` — the tool manifest (registered in `ai-tools/registry.js`, offered in Create → Make and in the document menu).
- The report is `performance/levelTest.js` + `performance/dashboard/LevelReport.js` ("Where you start").
