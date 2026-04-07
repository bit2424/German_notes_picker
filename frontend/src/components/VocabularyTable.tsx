import { useEffect, useMemo, useState } from "react";
import {
  type VocabularyItem,
  deleteVocabulary,
  fetchVocabulary,
  updateVocabulary,
} from "../api";

export default function VocabularyTable() {
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<VocabularyItem>>({});

  useEffect(() => {
    fetchVocabulary()
      .then((data) => setItems(data.vocabulary))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return items;
    const q = filter.toLowerCase();
    return items.filter(
      (v) =>
        v.german.toLowerCase().includes(q) ||
        v.translation.toLowerCase().includes(q)
    );
  }, [items, filter]);

  function startEdit(item: VocabularyItem) {
    setEditingId(item.id);
    setEditDraft({
      german: item.german,
      translation: item.translation,
      translation_lang: item.translation_lang,
      source: item.source,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft({});
  }

  async function saveEdit(id: string) {
    try {
      const updated = await updateVocabulary(id, {
        german: editDraft.german,
        translation: editDraft.translation,
        translation_lang: editDraft.translation_lang,
        source: editDraft.source ?? undefined,
      });
      setItems((prev) => prev.map((v) => (v.id === id ? updated : v)));
      cancelEdit();
    } catch {
      /* keep editing on failure */
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this vocabulary entry?")) return;
    try {
      await deleteVocabulary(id);
      setItems((prev) => prev.filter((v) => v.id !== id));
    } catch {
      /* swallow */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") saveEdit(id);
    if (e.key === "Escape") cancelEdit();
  }

  if (loading) {
    return <div className="table-loading">Loading vocabulary…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="table-empty">
        No vocabulary stored yet. Send some German words in the chat!
      </div>
    );
  }

  return (
    <div className="data-table-container">
      <div className="table-toolbar">
        <input
          type="text"
          className="table-filter"
          placeholder="Search vocabulary…"
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
              <th>German</th>
              <th>Translation</th>
              <th>Lang</th>
              <th>Source</th>
              <th>Date</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) =>
              editingId === v.id ? (
                <tr key={v.id} className="editing-row">
                  <td>
                    <input
                      className="cell-input"
                      value={editDraft.german ?? ""}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, german: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, v.id)}
                      autoFocus
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={editDraft.translation ?? ""}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, translation: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, v.id)}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input cell-input-sm"
                      value={editDraft.translation_lang ?? ""}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, translation_lang: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, v.id)}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={editDraft.source ?? ""}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, source: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, v.id)}
                    />
                  </td>
                  <td className="cell-date">{v.date ?? "—"}</td>
                  <td className="actions-col">
                    <button className="row-btn save-btn" onClick={() => saveEdit(v.id)}>
                      Save
                    </button>
                    <button className="row-btn cancel-btn" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={v.id}>
                  <td className="cell-german">{v.german}</td>
                  <td>{v.translation}</td>
                  <td className="cell-lang">{v.translation_lang}</td>
                  <td className="cell-source">{v.source ?? "—"}</td>
                  <td className="cell-date">{v.date ?? "—"}</td>
                  <td className="actions-col">
                    <button className="row-btn edit-btn" onClick={() => startEdit(v)}>
                      Edit
                    </button>
                    <button
                      className="row-btn delete-btn"
                      onClick={() => handleDelete(v.id)}
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
