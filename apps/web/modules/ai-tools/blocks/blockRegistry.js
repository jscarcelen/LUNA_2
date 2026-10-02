/**
 * Block Registry — canonical source of truth for all LUNA content blocks.
 * Each block defines: category, label, description, icon, aiFields — what the AI must produce.
 *
 * How a block LOOKS (its formats and colours) is not decided here: Template Studio is the only
 * catalog of components, formats and colours. `template-studio/output/outputDocument.ts` maps each
 * block type to its Template Studio component (COMPONENT_FOR_BLOCK).
 *
 * aiFields: { fieldName: { type, description, required, example } }
 */

export const BLOCKS = {
  // ── STRUCTURE ──────────────────────────────────────────────
  document_header: {
    category: 'structure',
    label: 'Document header',
    description: 'Title of the whole document (summaries, guides, notes). Use once, first.',
    icon: 'T',
    aiFields: {
      title: { type: 'string', description: 'A specific title for THIS document, written for its content (never the tool or agent name)', required: true, example: 'Osmosis and Diffusion: Study Guide' },
    },
  },

  exam_header: {
    category: 'structure',
    label: 'Exam header',
    description: 'Title block of an exam or worksheet, with Name and Date lines. Use once, first.',
    icon: 'EX',
    aiFields: {
      title:    { type: 'string', description: 'A specific title for THIS exam or worksheet, written for its content (never the tool or agent name)', required: true,  example: 'Cell Transport · Unit Test' },
      subtitle: { type: 'string', description: 'Course, class or subject', required: false, example: 'Biology · Grade 10' },
    },
  },

  section_header: {
    category: 'structure',
    label: 'Section header',
    description: 'Title of a section of the document, with an optional one-line intro',
    icon: '§',
    aiFields: {
      title: { type: 'string', description: 'The section title', required: true,  example: 'Part A: Multiple choice' },
      intro: { type: 'string', description: 'One-line instruction or introduction for the section', required: false, example: 'Choose the one correct answer.' },
    },
  },

  heading: {
    category: 'structure',
    label: 'Heading',
    description: 'Heading at level 1–4 (sections, sub-sections, …); a long document uses several levels',
    icon: 'H',
    aiFields: {
      text:  { type: 'string',  description: 'The heading text', required: true,  example: 'Introduction to Osmosis' },
      level: { type: 'number',  description: 'Heading level: 1 (main section), 2 (subsection), 3, or 4 (smallest). Use as many levels as the content needs.', required: true, example: 2 },
    },
  },

  paragraph: {
    category: 'structure',
    label: 'Paragraph',
    description: 'Body text paragraph',
    icon: '¶',
    aiFields: {
      text: { type: 'string', description: 'The paragraph text', required: true, example: 'Osmosis is the movement of water molecules through a selectively permeable membrane...' },
    },
  },

  bullet_list: {
    category: 'structure',
    label: 'Bullet List',
    description: 'Bullet-point list of items',
    icon: '•',
    aiFields: {
      title: { type: 'string',   description: 'Optional list title/label', required: false, example: 'Key points:' },
      items: { type: 'string[]', description: 'List items, 1–8 entries (use 1 when each bullet is a standalone point separated by dividers)',   required: true,  example: ['First point', 'Second point'] },
    },
  },

  callout: {
    category: 'structure',
    label: 'Callout',
    description: 'Highlighted callout box for important info',
    icon: '!',
    aiFields: {
      text: { type: 'string', description: 'The callout text', required: true, example: 'Remember: osmosis only applies to water molecules, not solutes.' },
      // Not called `type`: that name is the block discriminator in the flat block schema.
      callout_type: { type: 'string', description: 'Callout type: info, tip, warning, or note', required: true, example: 'tip' },
    },
  },

  vocabulary: {
    category: 'structure',
    label: 'Table',
    description: 'One row of a word · translation · example table (consecutive rows form one table)',
    icon: '▦',
    aiFields: {
      word:        { type: 'string', description: 'The word or term', required: true,  example: 'casa' },
      translation: { type: 'string', description: 'Its translation or definition', required: true, example: 'house' },
      example:     { type: 'string', description: 'A short example sentence', required: false, example: 'Mi casa es pequeña.' },
    },
  },

  divider: {
    category: 'structure',
    label: 'Divider',
    description: 'Visual section separator',
    icon: '—',
    aiFields: {},
  },

  // ── QUESTIONS ──────────────────────────────────────────────
  question_mc: {
    category: 'questions',
    label: 'Multiple Choice',
    description: 'Multiple-choice question with 4 options',
    icon: 'MC',
    aiFields: {
      number:       { type: 'number',   description: 'Question number',                     required: true,  example: 1 },
      question:     { type: 'string',   description: 'The question text',                   required: true,  example: 'What is osmosis?' },
      options:      { type: 'string[4]',description: 'Exactly 4 answer options',            required: true,  example: ['Movement of water','Movement of solutes','Cell division','Photosynthesis'] },
      answer_index: { type: 'number',   description: 'Index of correct option (0–3)',        required: true,  example: 0 },
      points:       { type: 'number',   description: 'Points awarded for correct answer',   required: true,  example: 2 },
      explanation:  { type: 'string',   description: 'Brief explanation of the answer',     required: false, example: 'Osmosis is specifically the movement of water through a semipermeable membrane.' },
    },
  },

  question_open: {
    category: 'questions',
    label: 'Open Answer',
    description: 'Free-response question with lined answer area',
    icon: 'OA',
    aiFields: {
      number:       { type: 'number', description: 'Question number',                        required: true,  example: 2 },
      question:     { type: 'string', description: 'The question text',                      required: true,  example: 'Explain the process of osmosis in your own words.' },
      answer_guide: { type: 'string', description: 'Model answer / marking guide',           required: true,  example: 'Should mention: semipermeable membrane, water movement, concentration gradient.' },
      points:       { type: 'number', description: 'Points for this question',               required: true,  example: 4 },
      lines:        { type: 'number', description: 'Number of answer lines to show (3–8)',   required: false, example: 4 },
    },
  },

  question_tf: {
    category: 'questions',
    label: 'True / False',
    description: 'Statement the student marks true or false',
    icon: 'T/F',
    aiFields: {
      number:      { type: 'number',  description: 'Question number',                         required: true,  example: 3 },
      statement:   { type: 'string',  description: 'The statement to evaluate',               required: true,  example: 'Osmosis requires energy from ATP.' },
      is_true:     { type: 'boolean', description: 'Whether the statement is true',           required: true,  example: false },
      explanation: { type: 'string',  description: 'Brief explanation',                       required: false, example: 'Osmosis is a passive process and does not require ATP.' },
      points:      { type: 'number',  description: 'Points for this question',                required: true,  example: 1 },
    },
  },

  question_fill: {
    category: 'questions',
    label: 'Fill in the Blank',
    description: 'Sentence with a missing word the student fills in',
    icon: '___',
    aiFields: {
      number:   { type: 'number', description: 'Question number',                              required: true,  example: 4 },
      sentence: { type: 'string', description: 'Sentence with ___ where the blank goes',       required: true,  example: 'Osmosis is the movement of ___ across a semipermeable membrane.' },
      answer:   { type: 'string', description: 'The correct word/phrase for the blank',        required: true,  example: 'water' },
      points:   { type: 'number', description: 'Points for this question',                     required: true,  example: 1 },
    },
  },

  question_match: {
    category: 'questions',
    label: 'Match the pairs',
    description: 'Two columns of items the student connects',
    icon: '⋯',
    aiFields: {
      title:       { type: 'string',   description: 'Short title of the matching activity', required: false, example: 'Match the organelle to its job' },
      instruction: { type: 'string',   description: 'One-line instruction', required: false, example: 'Draw a line to connect each pair.' },
      left_items:  { type: 'string[]', description: 'Left column, in order', required: true, example: ['Mitochondria', 'Chloroplast'] },
      right_items: { type: 'string[]', description: 'Right column: the match of each left item, SAME ORDER and same length as left_items', required: true, example: ['Makes ATP', 'Photosynthesis'] },
    },
  },

  question_math: {
    category: 'questions',
    label: 'Math practice',
    description: 'One operation or problem with a numeric answer (consecutive problems form one set)',
    icon: '±',
    aiFields: {
      title:   { type: 'string', description: 'Title of the practice set (only needed on the first problem)', required: false, example: 'Practice · Level 3' },
      problem: { type: 'string', description: 'The operation, e.g. "24 + 18 ="', required: true, example: '24 + 18 =' },
      answer:  { type: 'string', description: 'The result', required: true, example: '42' },
    },
  },

  // ── GAMES ──────────────────────────────────────────────────
  flashcard: {
    category: 'games',
    label: 'Flashcard',
    description: 'Two-sided card for spaced repetition practice',
    icon: '🃏',
    aiFields: {
      front: { type: 'string', description: 'Front of card — term or question', required: true,  example: 'Osmosis' },
      back:  { type: 'string', description: 'Back of card — definition or answer', required: true, example: 'The passive movement of water molecules from a region of higher water concentration to lower through a semipermeable membrane.' },
      hint:  { type: 'string', description: 'Optional hint shown before revealing back', required: false, example: 'Think about water and membranes...' },
    },
  },
};

export const BLOCK_CATEGORIES = [
  { id: 'structure', label: 'Structure',     icon: '📄', blocks: ['document_header','exam_header','section_header','heading','paragraph','bullet_list','callout','vocabulary'] },
  { id: 'questions', label: 'Questions',     icon: '❓', blocks: ['question_mc','question_open','question_tf','question_fill','question_match','question_math'] },
  { id: 'games',     label: 'Cards & Games', icon: '🎮', blocks: ['flashcard'] },
];

export function getBlock(id) { return BLOCKS[id]; }

/**
 * Build a JSON Schema for the AI output based on selected block IDs.
 *
 * OpenAI structured-output strict mode forbids `oneOf`/`anyOf` for discriminated unions and
 * requires every property to be listed in `required`. We therefore use a FLAT schema: all field
 * names across all selected block types are merged into a single item object; each non-`type`
 * field is nullable (`anyOf: [{…}, {type:"null"}]`) so the model can set irrelevant fields to
 * null. `type` is a plain string (not a `const`) — the prompt tells the model which values are
 * valid. This is the only schema shape that OpenAI strict mode reliably accepts for polymorphic
 * block arrays.
 */
export function buildJsonSchema(selectedBlockIds) {
  const ids = (selectedBlockIds || []).filter((id) => BLOCKS[id]);

  // Collect every unique field name across all selected block types.
  const fieldMap = {}; // fieldName → def (first seen wins for type info)
  for (const id of ids) {
    for (const [name, def] of Object.entries(BLOCKS[id].aiFields)) {
      // `type` is the discriminator; a block field with that name would duplicate it in `required`
      // (OpenAI rejects the whole schema) and overwrite its definition.
      if (name === 'type') continue;
      if (!fieldMap[name]) fieldMap[name] = def;
    }
  }

  // Build a flat item schema: `type` required string, every other field nullable.
  const properties = {
    type: {
      type: 'string',
      description: `Block type. Must be one of: ${ids.join(', ')}.`,
    },
  };
  const required = ['type'];

  for (const [name, def] of Object.entries(fieldMap)) {
    required.push(name);
    const base =
      def.type === 'string[]' || def.type === 'string[4]'
        ? { type: 'array', items: { type: 'string' } }
        : def.type === 'boolean'
        ? { type: 'boolean' }
        : def.type === 'number'
        ? { type: 'number' }
        : { type: 'string' };
    // Wrap as nullable so strict mode accepts it as optional for block types that lack this field.
    properties[name] = { description: def.description, anyOf: [base, { type: 'null' }] };
  }

  const itemSchema = { type: 'object', properties, required, additionalProperties: false };
  return { type: 'array', items: itemSchema };
}

/**
 * Returns 2-3 sample blocks for preview purposes.
 */
export function getSampleBlocks(selectedBlockIds) {
  const samples = [];
  for (const id of (selectedBlockIds || []).slice(0, 4)) {
    const block = BLOCKS[id];
    if (!block) continue;
    const sample = { type: id };
    for (const [field, def] of Object.entries(block.aiFields)) {
      if (def.example !== undefined) sample[field] = def.example;
      else if (def.type === 'string[]' || def.type === 'string[4]') sample[field] = ['Sample item'];
      else if (def.type === 'boolean') sample[field] = true;
      else if (def.type === 'number') sample[field] = 1;
      else sample[field] = 'Sample text';
    }
    samples.push(sample);
    if (samples.length >= 3) break;
  }
  return samples;
}
