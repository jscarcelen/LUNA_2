"use client";

import { useState } from "react";
import { ghostBtn, primaryBtn } from "../ui";

/** Name + description for a block saved from the current selection. */
export function BlockDialog({ onClose, onSave }: { onClose: () => void; onSave: (meta: { name: string; description: string }) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const input = "w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-[var(--accent)]";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">Save as block</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">The selected elements and the fields they use become a reusable block in “My blocks”. You can sell it in the Marketplace afterwards.</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Name<input className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Exam question with hint" autoFocus /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Description<textarea className={`${input} min-h-[64px]`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is it for? What does it show?" /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryBtn} disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), description: description.trim() })}>Save block</button>
        </div>
      </div>
    </div>
  );
}
