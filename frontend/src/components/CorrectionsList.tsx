import { useState } from "react";
import {
  type Correction,
  createCorrection,
  updateCorrection,
  deleteCorrection,
} from "../api";

interface Props {
  wordId?: string;
  textId?: string;
  corrections: Correction[];
  onChange: () => void;
}

export default function CorrectionsList({ wordId, textId, corrections, onChange }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ original: "", corrected: "", note: "" });

  async function handleAdd() {
    if (!draft.original.trim() || !draft.corrected.trim()) return;
    await createCorrection({
      word_id: wordId,
      text_id: textId,
      original_text: draft.original.trim(),
      corrected_text: draft.corrected.trim(),
      note: draft.note.trim() || undefined,
    });
    setDraft({ original: "", corrected: "", note: "" });
    setShowAdd(false);
    onChange();
  }

  async function handleStatus(id: string, status: "accepted" | "rejected") {
    await updateCorrection(id, { status });
    onChange();
  }

  async function handleDelete(id: string) {
    await deleteCorrection(id);
    onChange();
  }

  return (
    <div className="corrections-list">
      {corrections.map((c) => (
        <div key={c.id} className="correction-card">
          <div className="correction-diff">
            <span className="correction-original">{c.original_text}</span>
            <span className="correction-arrow">→</span>
            <span className="correction-corrected">{c.corrected_text}</span>
          </div>
          {c.note && <p className="correction-note">{c.note}</p>}
          <div className="correction-footer">
            <span className={`status-badge status-${c.status}`}>{c.status}</span>
            {c.status === "pending" && (
              <>
                <button className="row-btn save-btn" onClick={() => handleStatus(c.id, "accepted")}>Accept</button>
                <button className="row-btn delete-btn" onClick={() => handleStatus(c.id, "rejected")}>Reject</button>
              </>
            )}
            <button className="row-btn delete-btn" onClick={() => handleDelete(c.id)}>Delete</button>
          </div>
        </div>
      ))}
      {showAdd ? (
        <div className="correction-add-form">
          <input
            className="cell-input"
            placeholder="Original text"
            value={draft.original}
            onChange={(e) => setDraft((d) => ({ ...d, original: e.target.value }))}
            autoFocus
          />
          <input
            className="cell-input"
            placeholder="Corrected text"
            value={draft.corrected}
            onChange={(e) => setDraft((d) => ({ ...d, corrected: e.target.value }))}
          />
          <input
            className="cell-input"
            placeholder="Note (optional)"
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          />
          <div className="correction-add-actions">
            <button className="row-btn save-btn" onClick={handleAdd}>Add</button>
            <button className="row-btn cancel-btn" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="row-btn edit-btn" onClick={() => setShowAdd(true)}>+ Correction</button>
      )}
    </div>
  );
}
