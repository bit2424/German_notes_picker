import { useEffect, useMemo, useState } from "react";
import { type Tag, fetchTags, createTag, deleteTag } from "../api";

export default function TagsTable() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetchTags()
      .then((d) => setTags(d.tags))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return tags;
    const q = filter.toLowerCase();
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, filter]);

  async function handleCreate() {
    if (!newName.trim()) return;
    const tag = await createTag(newName.trim());
    setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tag?")) return;
    await deleteTag(id);
    setTags((prev) => prev.filter((t) => t.id !== id));
  }

  if (loading) return <div className="table-loading">Loading tags…</div>;

  return (
    <div className="data-table-container">
      <div className="table-toolbar">
        <input
          type="text"
          className="table-filter"
          placeholder="Search tags…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="table-count">{filtered.length} tags</span>
      </div>

      <div className="table-scroll">
        <div className="tag-create-row">
          <input
            className="cell-input"
            placeholder="New tag name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
          {newName.trim() && (
            <button className="row-btn save-btn" onClick={handleCreate}>Create</button>
          )}
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="actions-col">
                  <button className="row-btn delete-btn" onClick={() => handleDelete(t.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
