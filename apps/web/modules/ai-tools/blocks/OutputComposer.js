/**
 * OutputComposer — Step 4 of the Agent Builder.
 * Lets the agent creator select which block types the AI may use,
 * and choose a visual format + color for each.
 *
 * Props:
 *   value:    { selectedBlocks: [{blockId, formatId, color}] }
 *   onChange: (newValue) => void
 */
'use client';
import { useState } from 'react';
import { BLOCKS, BLOCK_CATEGORIES, BLOCK_COLORS } from './blockRegistry.js';

const pillBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  border: '1px solid rgba(29,29,31,0.15)',
  background: 'var(--paper,#fff)',
  color: 'var(--ink,#1d1d1f)',
  padding: '4px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 120ms, color 120ms',
  lineHeight: '1.5',
};

const pillBtnActive = {
  ...pillBtn,
  background: 'var(--accent,#0071e3)',
  color: '#fff',
  border: '1px solid var(--accent,#0071e3)',
};

function ColorDot({ color, active, onClick }) {
  return (
    <button
      type="button"
      title={color.label}
      onClick={onClick}
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: color.value,
        border: 'none',
        cursor: 'pointer',
        outline: active ? '2px solid var(--ink,#1d1d1f)' : '2px solid transparent',
        outlineOffset: 2,
        transition: 'outline 120ms',
        flexShrink: 0,
      }}
    />
  );
}

function BlockCard({ blockId, block, selected, entry, onToggle, onFormatChange, onColorChange }) {
  return (
    <div
      style={{
        border: selected
          ? '1.5px solid var(--accent,#0071e3)'
          : '1.5px solid rgba(29,29,31,0.1)',
        borderRadius: 14,
        background: selected ? 'rgba(0,113,227,0.04)' : 'var(--paper,#fff)',
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'border 120ms, background 120ms',
        userSelect: 'none',
      }}
    >
      {/* Header row */}
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
        onClick={() => onToggle(blockId)}
      >
        {/* Checkbox */}
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            border: selected
              ? '1.5px solid var(--accent,#0071e3)'
              : '1.5px solid rgba(29,29,31,0.25)',
            background: selected ? 'var(--accent,#0071e3)' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 2,
            transition: 'background 120ms, border 120ms',
          }}
        >
          {selected && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>

        {/* Icon */}
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: selected ? 'rgba(0,113,227,0.1)' : 'rgba(29,29,31,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: selected ? 'var(--accent,#0071e3)' : 'rgba(29,29,31,0.5)',
            flexShrink: 0,
          }}
        >
          {block.icon}
        </span>

        {/* Label + desc */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink,#1d1d1f)', lineHeight: 1.3 }}>
            {block.label}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(29,29,31,0.5)', marginTop: 2, lineHeight: 1.4 }}>
            {block.description}
          </div>
        </div>
      </div>

      {/* Expanded controls when selected */}
      {selected && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(29,29,31,0.08)' }}>
          {/* Format selector */}
          {block.formats.length > 1 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(29,29,31,0.4)', marginBottom: 5 }}>
                Format
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {block.formats.map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    title={fmt.description}
                    onClick={() => onFormatChange(blockId, fmt.id)}
                    style={entry.formatId === fmt.id ? pillBtnActive : pillBtn}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color selector */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(29,29,31,0.4)', marginBottom: 5 }}>
              Color
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BLOCK_COLORS.map((color) => (
                <ColorDot
                  key={color.id}
                  color={color}
                  active={entry.color === color.id}
                  onClick={() => onColorChange(blockId, color.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function OutputComposer({ value, onChange }) {
  const selectedBlocks = Array.isArray(value?.selectedBlocks) ? value.selectedBlocks : [];
  const [activeCategory, setActiveCategory] = useState(BLOCK_CATEGORIES[0].id);

  const selectedMap = new Map(selectedBlocks.map((entry) => [entry.blockId, entry]));

  function toggle(blockId) {
    const block = BLOCKS[blockId];
    if (!block) return;
    if (selectedMap.has(blockId)) {
      onChange({ ...value, selectedBlocks: selectedBlocks.filter((e) => e.blockId !== blockId) });
    } else {
      onChange({
        ...value,
        selectedBlocks: [
          ...selectedBlocks,
          { blockId, formatId: block.defaultFormat || block.formats[0]?.id || 'default', color: 'default' },
        ],
      });
    }
  }

  function setFormat(blockId, formatId) {
    onChange({
      ...value,
      selectedBlocks: selectedBlocks.map((e) => e.blockId === blockId ? { ...e, formatId } : e),
    });
  }

  function setColor(blockId, color) {
    onChange({
      ...value,
      selectedBlocks: selectedBlocks.map((e) => e.blockId === blockId ? { ...e, color } : e),
    });
  }

  const category = BLOCK_CATEGORIES.find((c) => c.id === activeCategory) || BLOCK_CATEGORIES[0];

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* Main panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Category tabs */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            background: 'rgba(29,29,31,0.05)',
            borderRadius: 12,
            padding: 3,
            marginBottom: 14,
          }}
        >
          {BLOCK_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              style={{
                flex: 1,
                borderRadius: 9,
                border: 'none',
                background: activeCategory === cat.id ? 'var(--paper,#fff)' : 'transparent',
                color: activeCategory === cat.id ? 'var(--ink,#1d1d1f)' : 'rgba(29,29,31,0.5)',
                fontWeight: activeCategory === cat.id ? 700 : 500,
                fontSize: 12,
                padding: '6px 10px',
                cursor: 'pointer',
                boxShadow: activeCategory === cat.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 120ms',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Block grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 8,
          }}
        >
          {category.blocks.map((blockId) => {
            const block = BLOCKS[blockId];
            if (!block) return null;
            const selected = selectedMap.has(blockId);
            const entry = selectedMap.get(blockId) || { blockId, formatId: block.defaultFormat || 'default', color: 'default' };
            return (
              <BlockCard
                key={blockId}
                blockId={blockId}
                block={block}
                selected={selected}
                entry={entry}
                onToggle={toggle}
                onFormatChange={setFormat}
                onColorChange={setColor}
              />
            );
          })}
        </div>
      </div>

      {/* Summary sidebar */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          borderRadius: 14,
          border: '1.5px solid rgba(29,29,31,0.1)',
          background: 'var(--paper,#fff)',
          padding: '14px',
          alignSelf: 'flex-start',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(29,29,31,0.4)',
            marginBottom: 10,
          }}
        >
          Selected ({selectedBlocks.length})
        </div>

        {selectedBlocks.length === 0 ? (
          <p style={{ fontSize: 12, color: 'rgba(29,29,31,0.4)', margin: 0 }}>
            No blocks selected yet. Pick at least one block.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedBlocks.map((entry) => {
              const block = BLOCKS[entry.blockId];
              if (!block) return null;
              const colorObj = BLOCK_COLORS.find((c) => c.id === entry.color) || BLOCK_COLORS[0];
              return (
                <div
                  key={entry.blockId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: 'rgba(29,29,31,0.04)',
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: colorObj.value,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink,#1d1d1f)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {block.label}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(29,29,31,0.4)', flexShrink: 0 }}>
                    {entry.formatId}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default OutputComposer;
