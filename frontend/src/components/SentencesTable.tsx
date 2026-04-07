import { useEffect, useMemo, useState } from "react";
import {
  type SentenceItem,
  deleteSentence,
  fetchSentences,
  updateSentence,
} from "../api";

export default function SentencesTable() {
  const [items, setItems] = useState<SentenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<SentenceItem>>({});

  useEffect(() => {
    fetchSentences()
      .then((data) => setItems(data.sentences))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return items;
    const q = filter.toLowerCase();
    return items.filter((s) => s.sentence.toLowerCase().includes(q));
  }, [items, filter]);

  function startEdit(item: SentenceItem) {
    setEditingId(item.id);
    setEditDraft({ sentence: item.sentence, source: item.source });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft({});
  }

  async function saveEdit(id: string) {
    try {
      const updated = await updateSentence(id, {
        sentence: editDraft.sentence,
        source: editDraft.source ?? undefined,
      });
      setItems((prev) => prev.map((s) => (s.id === id ? updated : s)));
      cancelEdit();
    } catch {
      /* keep editing on failure */
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this sentence?")) return;
    try {
      await deleteSentence(id);
      setItems((prev) => prev.filter((s) => s.id !== id));
    } catch {
      /* swallow */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") saveEdit(id);
    if (e.key === "Escape") cancelEdit();
  }

  if (loading) {
    return <div className="table-loading">Loading sentences…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="table-empty">
        No sentences stored yet. Send some German sentences in the chat!
      </div>
    );
  }

  return (
    <div className="data-table-container">
      <div className="table-toolbar">
        <input
          type="text"
          className="table-filter"
          placeholder="Search sentences…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="table-count">
          {filtered.length} of {items.length}
        </span>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sentence</th>
              <th>Source</th>
              <th>Date</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) =>
              editingId === s.id ? (
                <tr key={s.id} className="editing-row">
                  <td>
                    <input
                      className="cell-input"
                      value={editDraft.sentence ?? ""}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, sentence: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, s.id)}
                      autoFocus
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={editDraft.source ?? ""}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, source: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, s.id)}
                    />
                  </td>
                  <td className="cell-date">{s.date ?? "—"}</td>
                  <td className="actions-col">
                    <button className="row-btn save-btn" onClick={() => saveEdit(s.id)}>
                      Save
                    </button>
                    <button className="row-btn cancel-btn" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={s.id}>
                  <td>{s.sentence}</td>
                  <td className="cell-source">{s.source ?? "—"}</td>
                  <td className="cell-date">{s.date ?? "—"}</td>
                  <td className="actions-col">
                    <button className="row-btn edit-btn" onClick={() => startEdit(s)}>
                      Edit
                    </button>
                    <button
                      className="row-btn delete-btn"
                      onClick={() => handleDelete(s.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
