import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type Correction, createCorrection, updateCorrection, deleteCorrection } from '../api';

interface Props {
  wordId?: string;
  textId?: string;
  corrections: Correction[];
  onChange: () => void;
}

export default function CorrectionsList({ wordId, textId, corrections, onChange }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ original: '', corrected: '', note: '' });

  async function handleAdd() {
    if (!draft.original.trim() || !draft.corrected.trim()) return;
    await createCorrection({
      word_id: wordId,
      text_id: textId,
      original_text: draft.original.trim(),
      corrected_text: draft.corrected.trim(),
      note: draft.note.trim() || undefined,
    });
    setDraft({ original: '', corrected: '', note: '' });
    setShowAdd(false);
    onChange();
  }

  async function handleStatus(id: string, status: 'accepted' | 'rejected') {
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
            {c.status === 'pending' && (
              <>
                <Button size="sm" onClick={() => handleStatus(c.id, 'accepted')}>
                  Accept
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleStatus(c.id, 'rejected')}
                >
                  Reject
                </Button>
              </>
            )}
            <Button variant="destructive" size="sm" onClick={() => handleDelete(c.id)}>
              Delete
            </Button>
          </div>
        </div>
      ))}
      {showAdd ? (
        <div className="correction-add-form">
          <Input
            placeholder="Original text"
            value={draft.original}
            onChange={(e) => setDraft((d) => ({ ...d, original: e.target.value }))}
            autoFocus
          />
          <Input
            placeholder="Corrected text"
            value={draft.corrected}
            onChange={(e) => setDraft((d) => ({ ...d, corrected: e.target.value }))}
          />
          <Input
            placeholder="Note (optional)"
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          />
          <div className="correction-add-actions">
            <Button size="sm" onClick={handleAdd}>
              Add
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
          + Correction
        </Button>
      )}
    </div>
  );
}
