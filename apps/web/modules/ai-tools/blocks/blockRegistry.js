/**
 * Block Registry — canonical source of truth for all LUNA content blocks.
 * Each block defines: category, label, description, icon, aiFields, formats.
 *
 * aiFields: { fieldName: { type, description, required, example } }
 * formats: [{ id, label, description }]
 */

export const BLOCKS = {
  // ── STRUCTURE ──────────────────────────────────────────────
  heading: {
    category: 'structure',
    label: 'Heading',
    description: 'Section heading (H1, H2 or H3)',
    icon: 'H',
    aiFields: {
      text:  { type: 'string',  description: 'The heading text', required: true,  example: 'Introduction to Osmosis' },
      level: { type: 'number',  description: 'Heading level: 1 (largest), 2, or 3', required: true, example: 1 },
    },
    formats: [
      { id: 'default', label: 'Default', description: 'Clean heading with subtle bottom border' },
    ],
    defaultFormat: 'default',
  },

  paragraph: {
    category: 'structure',
    label: 'Paragraph',
    description: 'Body text paragraph',
    icon: '¶',
    aiFields: {
      text: { type: 'string', description: 'The paragraph text', required: true, example: 'Osmosis is the movement of water molecules through a selectively permeable membrane...' },
    },
    formats: [
      { id: 'default', label: 'Default', description: 'Regular body text, comfortable line height' },
    ],
    defaultFormat: 'default',
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
    formats: [
      { id: 'default', label: 'Default', description: 'Standard bullet dots' },
    ],
    defaultFormat: 'default',
  },

  callout: {
    category: 'structure',
    label: 'Callout',
    description: 'Highlighted callout box for important info',
    icon: '!',
    aiFields: {
      text: { type: 'string', description: 'The callout text', required: true, example: 'Remember: osmosis only applies to water molecules, not solutes.' },
      type: { type: 'string', description: 'Callout type: info, tip, warning, or note', required: true, example: 'tip' },
    },
    formats: [
      { id: 'card', label: 'Card', description: 'Filled background card with icon' },
    ],
    defaultFormat: 'card',
  },

  divider: {
    category: 'structure',
    label: 'Divider',
    description: 'Visual section separator',
    icon: '—',
    aiFields: {},
    formats: [
      { id: 'line', label: 'Line', description: 'Thin horizontal rule' },
    ],
    defaultFormat: 'line',
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
    formats: [
      { id: 'card', label: 'Card', description: 'Question in a card, options as labelled buttons (A B C D)' },
    ],
    defaultFormat: 'card',
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
    formats: [
      { id: 'card',  label: 'Card',  description: 'Question in card with lined answer space below' },
      { id: 'lined', label: 'Lined', description: 'Simple lined page style' },
    ],
    defaultFormat: 'card',
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
    formats: [
      { id: 'card',   label: 'Card',   description: 'Statement in card with T / F buttons' },
      { id: 'inline', label: 'Inline', description: 'Compact single-line style with T/F checkbox' },
    ],
    defaultFormat: 'card',
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
    formats: [
      { id: 'card',   label: 'Card',   description: 'Sentence in a card with styled blank line' },
      { id: 'inline', label: 'Inline', description: 'Plain text with underline blank' },
    ],
    defaultFormat: 'card',
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
    formats: [
      { id: 'classic', label: 'Classic', description: 'White card, term on front, definition on back' },
      { id: 'split',   label: 'Split',   description: 'Both sides shown side-by-side in study mode' },
    ],
    defaultFormat: 'classic',
  },
};

export const BLOCK_CATEGORIES = [
  { id: 'structure', label: 'Document Structure', icon: '📄', blocks: ['heading','paragraph','bullet_list','callout','divider'] },
  { id: 'questions', label: 'Questions',          icon: '❓', blocks: ['question_mc','question_open','question_tf','question_fill'] },
  { id: 'games',     label: 'Games & Cards',       icon: '🎮', blocks: ['flashcard'] },
];

export const BLOCK_COLORS = [
  { id: 'default', label: 'Blue',   value: '#0071e3' },
  { id: 'purple',  label: 'Purple', value: '#6f42c1' },
  { id: 'green',   label: 'Green',  value: '#28a745' },
  { id: 'orange',  label: 'Orange', value: '#fd7e14' },
  { id: 'red',     label: 'Red',    value: '#dc3545' },
  { id: 'gray',    label: 'Gray',   value: '#6c757d' },
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
