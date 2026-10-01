/**
 * BlockRenderer — renders a parsed array of LLM block objects.
 *
 * Props:
 *   blocks:         array of block objects from LLM (each has a `type` field)
 *   templateConfig: { selectedBlocks: [{blockId, formatId, color}] }
 *   showAnswers:    boolean (default true) — show correct answers / model answers
 *   exportMode:     'screen' | 'a4' | 'slides'
 *   interactive:    boolean (default false) — student-clickable quiz mode;
 *                   when true, each question tracks its own answer state and
 *                   showAnswers is ignored in favour of per-block feedback.
 */
'use client';
import { useState } from 'react';
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

/* ────────────────── STATIC RENDERERS ─────────────────────────── */

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

/* ────────────────── INTERACTIVE QUESTION RENDERERS ───────────── */

function QuestionMcBlock({ block, config, showAnswers, interactive, userAnswer, onAnswer }) {
  const options = Array.isArray(block.options) ? block.options : [];
  const answerIndex = Number(block.answer_index ?? -1);
  const compact = config.formatId === 'compact';
  const answered = interactive && userAnswer !== null && userAnswer !== undefined;

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
          const isCorrect = i === answerIndex;
          const isSelected = interactive ? userAnswer === i : false;
          // Static mode: showAnswers highlights correct/wrong
          // Interactive mode: after answering, show correct (green) and selected-wrong (red)
          const showGreen = interactive ? (answered && isCorrect) : (showAnswers && isCorrect);
          const showRed = interactive ? (answered && isSelected && !isCorrect) : false;
          const showFaded = interactive
            ? (answered && !isCorrect && !isSelected)
            : (showAnswers && !isCorrect);
          const canClick = interactive && !answered;

          return (
            <div
              key={i}
              onClick={() => canClick && onAnswer(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '5px 8px' : '8px 10px',
                borderRadius: 8,
                border: `1.5px solid ${showGreen ? '#28a745' : showRed ? '#dc3545' : isSelected ? config.color : 'rgba(29,29,31,0.12)'}`,
                background: showGreen ? '#f0fff4' : showRed ? '#fff5f5' : isSelected ? `${config.color}10` : 'transparent',
                cursor: canClick ? 'pointer' : 'default',
                transition: 'all 140ms',
                opacity: showFaded ? 0.4 : 1,
                userSelect: 'none',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: showGreen ? '#28a745' : showRed ? '#dc3545' : isSelected ? config.color : config.color,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  opacity: showFaded ? 0.35 : 1,
                }}
              >
                {OPTION_LABELS[i] || i + 1}
              </span>
              <span style={{ fontSize: 13, color: showFaded ? 'rgba(29,29,31,0.4)' : 'var(--ink,#1d1d1f)', lineHeight: 1.4, flex: 1 }}>
                {opt}
              </span>
              {showGreen && <span style={{ fontSize: 14, color: '#28a745' }}>✓</span>}
              {showRed && <span style={{ fontSize: 14, color: '#dc3545' }}>✗</span>}
            </div>
          );
        })}
      </div>
      {/* Explanation — show in static showAnswers mode or after interactive answer */}
      {((showAnswers && !interactive) || (interactive && answered)) && block.explanation ? (
        <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0,113,227,0.06)', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(29,29,31,0.7)', lineHeight: 1.5 }}>
            <strong>Explanation:</strong> {block.explanation}
          </p>
        </div>
      ) : null}
      {/* Retry nudge */}
      {interactive && answered && userAnswer !== answerIndex ? (
        <button
          type="button"
          onClick={() => onAnswer(null)}
          style={{ marginTop: 8, fontSize: 11, color: config.color, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontWeight: 600 }}
        >
          ↩ Try again
        </button>
      ) : null}
    </div>
  );
}

function QuestionOpenBlock({ block, config, showAnswers, interactive, userAnswer, onAnswer }) {
  const lines = Math.min(8, Math.max(3, Number(block.lines) || 4));
  const revealed = interactive ? Boolean(userAnswer) : showAnswers;

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
      {interactive ? (
        <div>
          <textarea
            placeholder="Write your answer here…"
            style={{
              width: '100%',
              minHeight: lines * 32,
              border: '1px solid rgba(29,29,31,0.15)',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--ink,#1d1d1f)',
              background: 'var(--paper,#fff)',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              outline: 'none',
            }}
            rows={lines}
          />
          {!revealed ? (
            <button
              type="button"
              onClick={() => onAnswer(true)}
              style={{ marginTop: 8, fontSize: 12, color: '#fff', background: config.color, border: 'none', borderRadius: 999, padding: '5px 14px', cursor: 'pointer', fontWeight: 600 }}
            >
              Show model answer
            </button>
          ) : null}
          {revealed && block.answer_guide ? (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#f0fff4', border: '1px solid #28a745', borderRadius: 8 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#155724', lineHeight: 1.6 }}>
                <strong>Model answer:</strong> {block.answer_guide}
              </p>
            </div>
          ) : null}
        </div>
      ) : revealed && block.answer_guide ? (
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

function QuestionTfBlock({ block, config, showAnswers, interactive, userAnswer, onAnswer }) {
  const isTrue = Boolean(block.is_true);
  const inline = config.formatId === 'inline';
  const answered = interactive && userAnswer !== null && userAnswer !== undefined;

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
        <div style={{ display: 'flex', gap: 6 }}>
          {['True', 'False'].map((label) => {
            const correctLabel = isTrue ? 'True' : 'False';
            const isThisCorrect = label === correctLabel;
            const isSelected = interactive ? userAnswer === label : false;
            // Static show
            const active = !interactive && showAnswers && isThisCorrect;
            // Interactive: highlight selected, reveal correct after answering
            const showGreen = interactive ? (answered && isThisCorrect) : active;
            const showRed = interactive ? (answered && isSelected && !isThisCorrect) : false;
            const canClick = interactive && !answered;

            return (
              <span
                key={label}
                onClick={() => canClick && onAnswer(label)}
                style={{
                  padding: '5px 16px',
                  borderRadius: 999,
                  border: `1.5px solid ${showGreen ? '#28a745' : showRed ? '#dc3545' : isSelected ? config.color : 'rgba(29,29,31,0.15)'}`,
                  background: showGreen ? '#f0fff4' : showRed ? '#fff5f5' : isSelected ? `${config.color}15` : 'transparent',
                  color: showGreen ? '#155724' : showRed ? '#721c24' : isSelected ? config.color : 'rgba(29,29,31,0.5)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: canClick ? 'pointer' : 'default',
                  transition: 'all 140ms',
                  userSelect: 'none',
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
      {((showAnswers && !interactive) || (interactive && answered)) && block.explanation ? (
        <p style={{ margin: '8px 0 0 28px', fontSize: 12, color: 'rgba(29,29,31,0.6)', lineHeight: 1.5, fontStyle: 'italic' }}>
          {block.explanation}
        </p>
      ) : null}
    </div>
  );
}

function QuestionFillBlock({ block, config, showAnswers, interactive, userAnswer, onAnswer }) {
  const sentence = String(block.sentence || '');
  const parts = sentence.split('___');
  const inline = config.formatId === 'inline';
  // Interactive: userAnswer = { typed: string, submitted: boolean }
  const submitted = interactive ? Boolean(userAnswer?.submitted) : false;
  const typedValue = interactive ? (userAnswer?.typed || '') : '';
  const correctAnswer = String(block.answer || '');
  const isCorrect = submitted && typedValue.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

  return (
    <div style={{ border: '1px solid rgba(29,29,31,0.1)', borderRadius: inline ? 8 : 12, padding: inline ? '8px 12px' : '14px 16px', background: 'var(--paper,#fff)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: config.color, minWidth: 20, flexShrink: 0 }}>
          {block.number}.
        </span>
        <div style={{ flex: 1, fontSize: 14, color: 'var(--ink,#1d1d1f)', lineHeight: 1.7 }}>
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 ? (
                interactive ? (
                  submitted ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '0 4px' }}>
                      <span style={{
                        borderBottom: `2px solid ${isCorrect ? '#28a745' : '#dc3545'}`,
                        color: isCorrect ? '#28a745' : '#dc3545',
                        fontWeight: 700,
                        padding: '0 6px',
                      }}>
                        {typedValue || '___'}
                      </span>
                      {!isCorrect && (
                        <span style={{ color: '#28a745', fontWeight: 700, fontSize: 12 }}>→ {correctAnswer}</span>
                      )}
                      <span style={{ fontSize: 13 }}>{isCorrect ? '✓' : '✗'}</span>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '0 4px' }}>
                      <input
                        type="text"
                        value={typedValue}
                        onChange={(e) => onAnswer({ typed: e.target.value, submitted: false })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && typedValue.trim()) onAnswer({ typed: typedValue, submitted: true });
                        }}
                        placeholder="type here"
                        style={{
                          border: 'none',
                          borderBottom: `2px solid ${config.color}`,
                          outline: 'none',
                          fontSize: 14,
                          fontWeight: 600,
                          color: config.color,
                          background: 'transparent',
                          minWidth: 80,
                          padding: '0 4px',
                          fontFamily: 'inherit',
                        }}
                      />
                    </span>
                  )
                ) : (showAnswers ? (
                  <span style={{ borderBottom: `2px solid ${config.color}`, color: config.color, fontWeight: 700, padding: '0 6px' }}>
                    {correctAnswer}
                  </span>
                ) : (
                  <span style={{ display: 'inline-block', minWidth: 80, borderBottom: '2px solid rgba(29,29,31,0.3)', margin: '0 4px' }} />
                ))
              ) : null}
            </span>
          ))}
          {block.points ? (
            <span style={{ fontSize: 10, color: 'rgba(29,29,31,0.4)', marginLeft: 8 }}>[{block.points}pt]</span>
          ) : null}
        </div>
      </div>
      {interactive && !submitted && typedValue.trim() ? (
        <div style={{ marginTop: 8, marginLeft: 28 }}>
          <button
            type="button"
            onClick={() => onAnswer({ typed: typedValue, submitted: true })}
            style={{ fontSize: 12, color: '#fff', background: config.color, border: 'none', borderRadius: 999, padding: '4px 14px', cursor: 'pointer', fontWeight: 600 }}
          >
            Check
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FlashcardBlock({ block, config, showAnswers, interactive, userAnswer, onAnswer }) {
  const split = config.formatId === 'split';
  // Interactive: userAnswer = boolean (flipped/revealed)
  const revealed = interactive ? Boolean(userAnswer) : showAnswers;

  if (split) {
    return (
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, border: '1px solid rgba(29,29,31,0.1)', borderRadius: 12, overflow: 'hidden', cursor: interactive ? 'pointer' : 'default' }}
        onClick={() => interactive && onAnswer(!userAnswer)}
        title={interactive ? (revealed ? 'Click to hide' : 'Click to reveal') : undefined}
      >
        <div style={{ padding: '14px 16px', background: config.color, color: '#fff' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 4 }}>Term</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{block.front}</div>
          {block.hint && !revealed ? (
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.8, fontStyle: 'italic' }}>{block.hint}</div>
          ) : null}
        </div>
        <div style={{ padding: '14px 16px', background: 'var(--paper,#fff)', position: 'relative' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(29,29,31,0.4)', marginBottom: 4 }}>Definition</div>
          {revealed ? (
            <div style={{ fontSize: 14, color: 'var(--ink,#1d1d1f)', lineHeight: 1.5 }}>{block.back}</div>
          ) : (
            <div style={{ fontSize: 12, color: 'rgba(29,29,31,0.3)', fontStyle: 'italic' }}>{interactive ? 'Click to reveal' : '—'}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: `1.5px solid ${config.color}`,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--paper,#fff)',
        cursor: interactive ? 'pointer' : 'default',
        userSelect: 'none',
      }}
      onClick={() => interactive && onAnswer(!userAnswer)}
      title={interactive ? (revealed ? 'Click to hide' : 'Click to reveal') : undefined}
    >
      <div style={{ background: config.color, padding: '12px 16px', color: '#fff' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 2 }}>Term</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{block.front}</div>
      </div>
      {revealed ? (
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
            <div style={{ fontSize: 12, color: 'rgba(29,29,31,0.3)', fontStyle: 'italic' }}>{interactive ? '👆 Click to reveal' : 'Tap to reveal'}</div>
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

export function BlockRenderer({ blocks, templateConfig, showAnswers = true, exportMode = 'screen', interactive = false }) {
  // Per-block answer state used in interactive mode.
  // Keyed by block index; value depends on block type.
  const [answers, setAnswers] = useState({});

  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  const gap = exportMode === 'a4' ? 12 : 14;

  const handleAnswer = (index, value) => {
    setAnswers((prev) => ({ ...prev, [index]: value }));
  };

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
        const userAnswer = interactive ? answers[i] : undefined;
        return (
          <div key={i} style={baseBlock}>
            <Renderer
              block={block}
              config={config}
              showAnswers={showAnswers}
              interactive={interactive}
              userAnswer={userAnswer}
              onAnswer={(v) => handleAnswer(i, v)}
            />
          </div>
        );
      })}
    </div>
  );
}

export default BlockRenderer;
