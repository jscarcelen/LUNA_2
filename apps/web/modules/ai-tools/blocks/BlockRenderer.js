/**
 * BlockRenderer — renders a parsed array of LLM block objects.
 *
 * Props:
 *   blocks:         array of block objects from LLM (each has a `type` field)
 *   templateConfig: { selectedBlocks: [{blockId, formatId, color}] }
 *   showAnswers:    boolean (default true) — show correct answers / model answers
 *   exportMode:     'screen' | 'a4' | 'slides'
 */
'use client';
import { BLOCK_COLORS } from './blockRegistry.js';

function getConfig(templateConfig, blockId) {
  const entry = (templateConfig?.selectedBlocks || []).find((e) => e.blockId === blockId);
  const colorId = entry?.color || 'default';
  const colorObj = BLOCK_COLORS.find((c) => c.id === colorId) || BLOCK_COLORS[0];
  return {
    formatId: entry?.formatId || 'default',
    color: colorObj.value,
    colorId,
  };
}

/* ── CALLOUT ICONS ─────────────────────────────────────────── */
const CALLOUT_ICONS = { tip: '💡', info: 'ℹ️', warning: '⚠️', note: '📝' };
const CALLOUT_COLORS = { tip: '#fffbe6', info: '#e8f4fd', warning: '#fff3cd', note: '#f8f0ff' };
const CALLOUT_BORDER = { tip: '#f5c518', info: '#0071e3', warning: '#fd7e14', note: '#6f42c1' };

/* ── OPTION LABELS ─────────────────────────────────────────── */
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

/* ── SHARED STYLES ─────────────────────────────────────────── */
const baseBlock = { marginBottom: 16 };

/* ────────────────── RENDERERS ──────────────────────────────── */

function HeadingBlock({ block, config }) {
  const level = Number(block.level) || 1;
  const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
  const sizeMap = { 1: 24, 2: 20, 3: 16 };
  const style = {
    fontSize: sizeMap[level] || 20,
    fontWeight: 700,
    color: 'var(--ink,#1d1d1f)',
    margin: '0 0 8px 0',
    lineHeight: 1.25,
    ...(config.formatId === 'minimal' ? {} : {
      paddingBottom: config.formatId === 'bold' ? 6 : 4,
      borderBottom: `${config.formatId === 'bold' ? 3 : 1}px solid ${config.color}`,
    }),
  };
  return <Tag style={style}>{block.text}</Tag>;
}

function ParagraphBlock({ block, config }) {
  const lead = config.formatId === 'lead';
  return (
    <p style={{ lineHeight: 1.7, color: 'var(--ink,#1d1d1f)', margin: '0 0 8px 0', fontSize: lead ? 17 : 15 }}>
      {block.text}
    </p>
  );
}

function BulletListBlock({ block, config }) {
  const items = Array.isArray(block.items) ? block.items : [];
  const numbered = config.formatId === 'numbered';
  const checkmark = config.formatId === 'checkmark';
  return (
    <div>
      {block.title ? (
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink,#1d1d1f)', margin: '0 0 6px 0' }}>
          {block.title}
        </h4>
      ) : null}
      <ul style={{ margin: 0, padding: '0 0 0 20px', listStyle: numbered ? 'decimal' : 'none' }}>
        {items.map((item, i) => (
          <li key={i} style={{ margin: '0 0 4px 0', fontSize: 14, color: 'var(--ink,#1d1d1f)', lineHeight: 1.5, listStyle: numbered ? 'decimal' : 'none' }}>
            {checkmark ? (
              <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: config.color, fontWeight: 700, flexShrink: 0 }}>{'✓'}</span>
                {item}
              </span>
            ) : numbered ? item : (
              <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: config.color, fontWeight: 700, flexShrink: 0, marginLeft: -20 }}>{'•'}</span>
                {item}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalloutBlock({ block, config }) {
  const type = String(block.type || 'info').toLowerCase();
  const icon = CALLOUT_ICONS[type] || 'ℹ️';
  const bg = CALLOUT_COLORS[type] || '#f5f5f7';
  const border = CALLOUT_BORDER[type] || config.color;
  if (config.formatId === 'border') {
    return (
      <div style={{ borderLeft: `4px solid ${border}`, background: bg, padding: '10px 14px', borderRadius: '0 8px 8px 0', marginBottom: 2 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink,#1d1d1f)' }}>{block.text}</p>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink,#1d1d1f)' }}>{block.text}</p>
      </div>
    </div>
  );
}

function DividerBlock({ block: _block, config }) {
  if (config.formatId === 'space') return <div style={{ height: 24 }} />;
  return <hr style={{ border: 'none', borderTop: '1px solid rgba(29,29,31,0.1)', margin: '8px 0' }} />;
}

function QuestionMcBlock({ block, config, showAnswers }) {
  const options = Array.isArray(block.options) ? block.options : [];
  const answerIndex = Number(block.answer_index ?? -1);
  const compact = config.formatId === 'compact';
  return (
    <div style={{ border: `1px solid rgba(29,29,31,0.1)`, borderRadius: compact ? 8 : 12, padding: compact ? '8px 12px' : '14px 16px', background: 'var(--paper,#fff)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: config.color, minWidth: 20, flexShrink: 0 }}>
          {block.number}.
        </span>
        <p style={{ margin: 0, fontSize: compact ? 13 : 14, fontWeight: 600, color: 'var(--ink,#1d1d1f)', lineHeight: 1.5, flex: 1 }}>
          {block.question}
        </p>
        {block.points ? (
          <span style={{ fontSize: 10, color: 'rgba(29,29,31,0.4)', flexShrink: 0 }}>{block.points}pt</span>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {options.map((opt, i) => {
          const isCorrect = showAnswers && i === answerIndex;
          const isWrong = showAnswers && i !== answerIndex;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '5px 8px' : '8px 10px',
                borderRadius: 8,
                border: `1px solid ${isCorrect ? '#28a745' : isWrong ? 'rgba(29,29,31,0.08)' : 'rgba(29,29,31,0.12)'}`,
                background: isCorrect ? '#f0fff4' : 'transparent',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: isCorrect ? '#28a745' : config.color,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  opacity: isWrong ? 0.35 : 1,
                }}
              >
                {OPTION_LABELS[i] || i + 1}
              </span>
              <span style={{ fontSize: 13, color: isWrong ? 'rgba(29,29,31,0.4)' : 'var(--ink,#1d1d1f)', lineHeight: 1.4 }}>
                {opt}
              </span>
              {isCorrect && <span style={{ marginLeft: 'auto', fontSize: 13, color: '#28a745' }}>{'✓'}</span>}
            </div>
          );
        })}
      </div>
      {showAnswers && block.explanation ? (
        <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0,113,227,0.06)', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(29,29,31,0.7)', lineHeight: 1.5 }}>
            <strong>Explanation:</strong> {block.explanation}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function QuestionOpenBlock({ block, config, showAnswers }) {
  const lines = Math.min(8, Math.max(3, Number(block.lines) || 4));
  return (
    <div style={{ border: '1px solid rgba(29,29,31,0.1)', borderRadius: 12, padding: '14px 16px', background: 'var(--paper,#fff)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: config.color, minWidth: 20, flexShrink: 0 }}>
          {block.number}.
        </span>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink,#1d1d1f)', lineHeight: 1.5, flex: 1 }}>
          {block.question}
        </p>
        {block.points ? (
          <span style={{ fontSize: 10, color: 'rgba(29,29,31,0.4)', flexShrink: 0 }}>{block.points}pt</span>
        ) : null}
      </div>
      {showAnswers && block.answer_guide ? (
        <div style={{ padding: '10px 12px', background: '#f0fff4', border: '1px solid #28a745', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: '#155724', lineHeight: 1.6 }}>
            <strong>Model answer:</strong> {block.answer_guide}
          </p>
        </div>
      ) : (
        <div>
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} style={{ borderBottom: '1px solid rgba(29,29,31,0.15)', height: 32, marginBottom: 2 }} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionTfBlock({ block, config, showAnswers }) {
  const isTrue = Boolean(block.is_true);
  const inline = config.formatId === 'inline';
  return (
    <div style={{ border: '1px solid rgba(29,29,31,0.1)', borderRadius: inline ? 8 : 12, padding: inline ? '8px 12px' : '14px 16px', background: 'var(--paper,#fff)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: config.color, flexShrink: 0 }}>
          {block.number}.
        </span>
        <p style={{ margin: 0, fontSize: inline ? 13 : 14, fontWeight: 600, color: 'var(--ink,#1d1d1f)', lineHeight: 1.5, flex: 1 }}>
          {block.statement}
        </p>
        {block.points ? (
          <span style={{ fontSize: 10, color: 'rgba(29,29,31,0.4)', flexShrink: 0 }}>{block.points}pt</span>
        ) : null}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {['True', 'False'].map((label) => {
            const active = showAnswers && ((label === 'True' && isTrue) || (label === 'False' && !isTrue));
            return (
              <span
                key={label}
                style={{
                  padding: '3px 12px',
                  borderRadius: 999,
                  border: `1.5px solid ${active ? (label === 'True' ? '#28a745' : '#dc3545') : 'rgba(29,29,31,0.15)'}`,
                  background: active ? (label === 'True' ? '#f0fff4' : '#fff5f5') : 'transparent',
                  color: active ? (label === 'True' ? '#155724' : '#721c24') : 'rgba(29,29,31,0.5)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
      {showAnswers && block.explanation ? (
        <p style={{ margin: '8px 0 0 28px', fontSize: 12, color: 'rgba(29,29,31,0.6)', lineHeight: 1.5, fontStyle: 'italic' }}>
          {block.explanation}
        </p>
      ) : null}
    </div>
  );
}

function QuestionFillBlock({ block, config, showAnswers }) {
  const sentence = String(block.sentence || '');
  const parts = sentence.split('___');
  const inline = config.formatId === 'inline';
  return (
    <div style={{ border: '1px solid rgba(29,29,31,0.1)', borderRadius: inline ? 8 : 12, padding: inline ? '8px 12px' : '14px 16px', background: 'var(--paper,#fff)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: config.color, minWidth: 20, flexShrink: 0 }}>
          {block.number}.
        </span>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink,#1d1d1f)', lineHeight: 1.7, flex: 1 }}>
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 ? (
                showAnswers ? (
                  <span style={{ borderBottom: `2px solid ${config.color}`, color: config.color, fontWeight: 700, padding: '0 6px' }}>
                    {block.answer}
                  </span>
                ) : (
                  <span style={{ display: 'inline-block', minWidth: 80, borderBottom: '2px solid rgba(29,29,31,0.3)', margin: '0 4px' }} />
                )
              ) : null}
            </span>
          ))}
          {block.points ? (
            <span style={{ fontSize: 10, color: 'rgba(29,29,31,0.4)', marginLeft: 8 }}>[{block.points}pt]</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function FlashcardBlock({ block, config, showAnswers }) {
  const split = config.formatId === 'split';
  if (split) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, border: '1px solid rgba(29,29,31,0.1)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', background: config.color, color: '#fff' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 4 }}>Term</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{block.front}</div>
          {block.hint && !showAnswers ? (
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.8, fontStyle: 'italic' }}>{block.hint}</div>
          ) : null}
        </div>
        <div style={{ padding: '14px 16px', background: 'var(--paper,#fff)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(29,29,31,0.4)', marginBottom: 4 }}>Definition</div>
          <div style={{ fontSize: 14, color: 'var(--ink,#1d1d1f)', lineHeight: 1.5 }}>{showAnswers ? block.back : '—'}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ border: `1.5px solid ${config.color}`, borderRadius: 14, overflow: 'hidden', background: 'var(--paper,#fff)' }}>
      <div style={{ background: config.color, padding: '12px 16px', color: '#fff' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 2 }}>Term</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{block.front}</div>
      </div>
      {showAnswers ? (
        <div style={{ padding: '12px 16px' }}>
          {block.hint ? (
            <div style={{ fontSize: 11, color: 'rgba(29,29,31,0.5)', fontStyle: 'italic', marginBottom: 4 }}>Hint: {block.hint}</div>
          ) : null}
          <div style={{ fontSize: 14, color: 'var(--ink,#1d1d1f)', lineHeight: 1.6 }}>{block.back}</div>
        </div>
      ) : (
        <div style={{ padding: '12px 16px' }}>
          {block.hint ? (
            <div style={{ fontSize: 12, color: 'rgba(29,29,31,0.5)', fontStyle: 'italic' }}>Hint: {block.hint}</div>
          ) : (
            <div style={{ fontSize: 12, color: 'rgba(29,29,31,0.3)', fontStyle: 'italic' }}>Tap to reveal</div>
          )}
        </div>
      )}
    </div>
  );
}

const BLOCK_RENDERERS = {
  heading:       HeadingBlock,
  paragraph:     ParagraphBlock,
  bullet_list:   BulletListBlock,
  callout:       CalloutBlock,
  divider:       DividerBlock,
  question_mc:   QuestionMcBlock,
  question_open: QuestionOpenBlock,
  question_tf:   QuestionTfBlock,
  question_fill: QuestionFillBlock,
  flashcard:     FlashcardBlock,
};

export function BlockRenderer({ blocks, templateConfig, showAnswers = true, exportMode = 'screen' }) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  const gap = exportMode === 'a4' ? 12 : 14;

  return (
    <div className="luna-block-renderer" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {blocks.map((block, i) => {
        const type = String(block?.type || '');
        const Renderer = BLOCK_RENDERERS[type];
        if (!Renderer) {
          return (
            <div key={i} style={{ ...baseBlock, color: 'rgba(29,29,31,0.4)', fontSize: 12 }}>
              [Unknown block type: {type}]
            </div>
          );
        }
        const config = getConfig(templateConfig, type);
        return (
          <div key={i} style={baseBlock}>
            <Renderer block={block} config={config} showAnswers={showAnswers} />
          </div>
        );
      })}
    </div>
  );
}

export default BlockRenderer;
