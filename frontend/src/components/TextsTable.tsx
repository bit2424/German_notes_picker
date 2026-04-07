import { useEffect, useMemo, useState } from "react";
import {
  type TextItem,
  deleteText,
  fetchTexts,
  updateText,
} from "../api";

export default function TextsTable() {
  const [items, setItems] = useState<TextItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TextItem>>({});

  useEffect(() => {
    fetchTexts()
      .then((data) => setItems(data.texts))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return items;
    const q = filter.toLowerCase();
    return items.filter((t) => t.content.toLowerCase().includes(q));
  }, [items, filter]);

  function startEdit(item: TextItem) {
    setEditingId(item.id);
    setEditDraft({ content: item.content, source: item.source });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft({});
  }

  async function saveEdit(id: string) {
    try {
      const updated = await updateText(id, {
        content: editDraft.content,
        source: editDraft.source ?? undefined,
      });
      setItems((prev) => prev.map((t) => (t.id === id ? updated : t)));
      cancelEdit();
    } catch {
      /* keep editing on failure */
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this text?")) return;
    try {
      await deleteText(id);
      setItems((prev) => prev.filter((t) => t.id !== id));
    } catch {
      /* swallow */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") saveEdit(id);
    if (e.key === "Escape") cancelEdit();
  }

  if (loading) {
    return <div className="table-loading">Loading texts…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="table-empty">
        No texts stored yet. Send some German sentences in the chat!
      </div>
    );
  }

  return (
    <div className="data-table-container">
      <div className="table-toolbar">
        <input
          type="text"
          className="table-filter"
          placeholder="Search texts…"
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
              <th>Text</th>
              <th>Source</th>
              <th>Date</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) =>
              editingId === t.id ? (
                <tr key={t.id} className="editing-row">
                  <td>
                    <input
                      className="cell-input"
                      value={editDraft.content ?? ""}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, content: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, t.id)}
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
                      onKeyDown={(e) => handleKeyDown(e, t.id)}
                    />
                  </td>
                  <td className="cell-date">{t.date ?? "—"}</td>
                  <td className="actions-col">
                    <button className="row-btn save-btn" onClick={() => saveEdit(t.id)}>
                      Save
                    </button>
                    <button className="row-btn cancel-btn" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td>{t.content}</td>
                  <td className="cell-source">{t.source ?? "—"}</td>
                  <td className="cell-date">{t.date ?? "—"}</td>
                  <td className="actions-col">
                    <button className="row-btn edit-btn" onClick={() => startEdit(t)}>
                      Edit
                    </button>
                    <button
                      className="row-btn delete-btn"
                      onClick={() => handleDelete(t.id)}
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
