import { useEffect, useMemo, useState } from "react";
import { type Tag, type TagPracticeStats, fetchTags, fetchTagPracticeStats, createTag, deleteTag } from "../api";

export default function TagsTable() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [tagStats, setTagStats] = useState<Record<string, TagPracticeStats>>({});

  useEffect(() => {
    fetchTags()
      .then((d) => setTags(d.tags))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchTagPracticeStats()
      .then((d) => {
        const map: Record<string, TagPracticeStats> = {};
        for (const s of d.tags) map[s.tag_id] = s;
        setTagStats(map);
      })
      .catch(() => {});
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
              <th>Practice</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const stats = tagStats[t.id];
              return (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    {stats ? (
                      <div className="tag-stats-cols">
                        <span>{stats.total_attempts} practiced</span>
                        <span>{stats.correct} correct</span>
                        {stats.accuracy != null && (
                          <span>{Math.round(stats.accuracy * 100)}%</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>—</span>
                    )}
                  </td>
                  <td className="actions-col">
                    <button className="row-btn delete-btn" onClick={() => handleDelete(t.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
