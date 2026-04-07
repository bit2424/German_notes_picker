import { useEffect, useMemo, useState } from "react";
import {
  type WordItem,
  deleteWord,
  fetchWords,
  updateWord,
  updateTranslation,
} from "../api";

export default function WordsTable() {
  const [items, setItems] = useState<WordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    german?: string;
    translation?: string;
    translationId?: string;
    source?: string | null;
  }>({});

  useEffect(() => {
    fetchWords()
      .then((data) => setItems(data.words))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return items;
    const q = filter.toLowerCase();
    return items.filter(
      (w) =>
        w.german.toLowerCase().includes(q) ||
        (w.translations[0]?.translation ?? "").toLowerCase().includes(q)
    );
  }, [items, filter]);

  function primaryTranslation(w: WordItem): string {
    return w.translations[0]?.translation ?? "—";
  }

  function primaryLang(w: WordItem): string {
    return w.translations[0]?.language ?? "—";
  }

  function startEdit(item: WordItem) {
    setEditingId(item.id);
    setEditDraft({
      german: item.german,
      translation: item.translations[0]?.translation ?? "",
      translationId: item.translations[0]?.id,
      source: item.source,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft({});
  }

  async function saveEdit(id: string) {
    try {
      await updateWord(id, {
        german: editDraft.german,
        source: editDraft.source ?? undefined,
      });

      if (editDraft.translationId && editDraft.translation) {
        await updateTranslation(editDraft.translationId, {
          translation: editDraft.translation,
        });
      }

      const refreshed = await fetchWords();
      setItems(refreshed.words);
      cancelEdit();
    } catch {
      /* keep editing on failure */
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this word?")) return;
    try {
      await deleteWord(id);
      setItems((prev) => prev.filter((w) => w.id !== id));
    } catch {
      /* swallow */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") saveEdit(id);
    if (e.key === "Escape") cancelEdit();
  }

  if (loading) {
    return <div className="table-loading">Loading words…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="table-empty">
        No words stored yet. Send some German words in the chat!
      </div>
    );
  }

  return (
    <div className="data-table-container">
      <div className="table-toolbar">
        <input
          type="text"
          className="table-filter"
          placeholder="Search words…"
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
              <th>Type</th>
              <th>Source</th>
              <th>Date</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) =>
              editingId === w.id ? (
                <tr key={w.id} className="editing-row">
                  <td>
                    <input
                      className="cell-input"
                      value={editDraft.german ?? ""}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, german: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, w.id)}
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
                      onKeyDown={(e) => handleKeyDown(e, w.id)}
                    />
                  </td>
                  <td className="cell-lang">{primaryLang(w)}</td>
                  <td className="cell-source">{w.word_type}</td>
                  <td>
                    <input
                      className="cell-input"
                      value={editDraft.source ?? ""}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, source: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDown(e, w.id)}
                    />
                  </td>
                  <td className="cell-date">{w.date ?? "—"}</td>
                  <td className="actions-col">
                    <button className="row-btn save-btn" onClick={() => saveEdit(w.id)}>
                      Save
                    </button>
                    <button className="row-btn cancel-btn" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={w.id}>
                  <td className="cell-german">{w.german}</td>
                  <td>{primaryTranslation(w)}</td>
                  <td className="cell-lang">{primaryLang(w)}</td>
                  <td className="cell-source">{w.word_type}</td>
                  <td className="cell-source">{w.source ?? "—"}</td>
                  <td className="cell-date">{w.date ?? "—"}</td>
                  <td className="actions-col">
                    <button className="row-btn edit-btn" onClick={() => startEdit(w)}>
                      Edit
                    </button>
                    <button
                      className="row-btn delete-btn"
                      onClick={() => handleDelete(w.id)}
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
