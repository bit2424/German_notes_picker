import { useEffect, useMemo, useState } from "react";
import {
  type TextItem,
  deleteText,
  fetchTexts,
  updateText,
  createText,
} from "../api";
import TextDetail from "./TextDetail";

export default function TextsTable() {
  const [items, setItems] = useState<TextItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TextItem>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createContent, setCreateContent] = useState("");

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
      if (expandedId === id) setExpandedId(null);
    } catch {
      /* swallow */
    }
  }

  async function handleCreate() {
    if (!createContent.trim()) return;
    try {
      const created = await createText(createContent.trim());
      setItems((prev) => [created, ...prev]);
      setCreateContent("");
      setShowCreate(false);
    } catch {
      /* swallow */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") saveEdit(id);
    if (e.key === "Escape") cancelEdit();
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (loading) {
    return <div className="table-loading">Loading texts…</div>;
  }

  if (items.length === 0 && !showCreate) {
    return (
      <div className="table-empty">
        No texts stored yet.{" "}
        <button className="row-btn edit-btn" onClick={() => setShowCreate(true)}>
          + Add text
        </button>
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
        <button className="row-btn save-btn" onClick={() => setShowCreate(!showCreate)}>
          + Add
        </button>
      </div>

      {showCreate && (
        <div className="create-row">
          <input
            className="cell-input"
            placeholder="German text…"
            value={createContent}
            onChange={(e) => setCreateContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
            autoFocus
          />
          <button className="row-btn save-btn" onClick={handleCreate}>Create</button>
          <button className="row-btn cancel-btn" onClick={() => setShowCreate(false)}>Cancel</button>
        </div>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Text</th>
              <th>Source</th>
              <th>Date</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <>
                {editingId === t.id ? (
                  <tr key={t.id} className="editing-row">
                    <td></td>
                    <td>
                      <input className="cell-input" value={editDraft.content ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, content: e.target.value }))} onKeyDown={(e) => handleKeyDown(e, t.id)} autoFocus />
                    </td>
                    <td>
                      <input className="cell-input" value={editDraft.source ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))} onKeyDown={(e) => handleKeyDown(e, t.id)} />
                    </td>
                    <td className="cell-date">{t.date ?? "—"}</td>
                    <td className="actions-col">
                      <button className="row-btn save-btn" onClick={() => saveEdit(t.id)}>Save</button>
                      <button className="row-btn cancel-btn" onClick={cancelEdit}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className={expandedId === t.id ? "expanded-row" : ""}>
                    <td className="expand-cell" onClick={() => toggleExpand(t.id)}>
                      <span className={`expand-arrow ${expandedId === t.id ? "open" : ""}`}>▶</span>
                    </td>
                    <td onClick={() => toggleExpand(t.id)} style={{ cursor: "pointer" }}>{t.content}</td>
                    <td className="cell-source">{t.source ?? "—"}</td>
                    <td className="cell-date">{t.date ?? "—"}</td>
                    <td className="actions-col">
                      <button className="row-btn edit-btn" onClick={() => startEdit(t)}>Edit</button>
                      <button className="row-btn delete-btn" onClick={() => handleDelete(t.id)}>Delete</button>
                    </td>
                  </tr>
                )}
                {expandedId === t.id && editingId !== t.id && (
                  <tr key={`${t.id}-detail`} className="detail-row">
                    <td colSpan={5}>
                      <TextDetail textId={t.id} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
