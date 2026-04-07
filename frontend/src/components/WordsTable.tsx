import { useEffect, useMemo, useState } from "react";
import {
  type WordItem,
  type EnrichmentProposal,
  deleteWord,
  fetchWords,
  updateWord,
  updateTranslation,
  createWord,
  proposeEnrichments,
} from "../api";
import EnrichmentReview from "./EnrichmentReview";
import WordDetail from "./WordDetail";

export default function WordsTable() {
  const [items, setItems] = useState<WordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    german?: string;
    translation?: string;
    translationId?: string;
    source?: string | null;
  }>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState({ german: "", word_type: "other" });
  const [enriching, setEnriching] = useState(false);
  const [proposals, setProposals] = useState<EnrichmentProposal[] | null>(null);

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
      if (expandedId === id) setExpandedId(null);
    } catch {
      /* swallow */
    }
  }

  async function handleCreate() {
    if (!createDraft.german.trim()) return;
    try {
      await createWord(createDraft.german.trim(), createDraft.word_type);
      const refreshed = await fetchWords();
      setItems(refreshed.words);
      setCreateDraft({ german: "", word_type: "other" });
      setShowCreate(false);
    } catch {
      /* swallow */
    }
  }

  async function handleEnrich() {
    setEnriching(true);
    try {
      const res = await proposeEnrichments(10, "all");
      setProposals(res.proposals);
    } catch {
      /* swallow */
    } finally {
      setEnriching(false);
    }
  }

  function handleEnrichDone(applied: boolean) {
    setProposals(null);
    if (applied) {
      fetchWords()
        .then((data) => setItems(data.words))
        .catch(() => {});
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") saveEdit(id);
    if (e.key === "Escape") cancelEdit();
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (proposals && proposals.length > 0) {
    return <EnrichmentReview proposals={proposals} onDone={handleEnrichDone} />;
  }

  if (loading) {
    return <div className="table-loading">Loading words…</div>;
  }

  if (items.length === 0 && !showCreate) {
    return (
      <div className="table-empty">
        No words stored yet.{" "}
        <button className="row-btn edit-btn" onClick={() => setShowCreate(true)}>
          + Add word
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
          placeholder="Search words…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="table-count">
          {filtered.length} of {items.length}
        </span>
        <button
          className="row-btn enrich-btn"
          onClick={handleEnrich}
          disabled={enriching}
        >
          {enriching ? "Enriching..." : "Enrich"}
        </button>
        <button className="row-btn save-btn" onClick={() => setShowCreate(!showCreate)}>
          + Add
        </button>
      </div>

      {showCreate && (
        <div className="create-row">
          <input
            className="cell-input"
            placeholder="German word…"
            value={createDraft.german}
            onChange={(e) => setCreateDraft((d) => ({ ...d, german: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
            autoFocus
          />
          <select className="cell-input cell-input-sm-select" value={createDraft.word_type}
            onChange={(e) => setCreateDraft((d) => ({ ...d, word_type: e.target.value }))}>
            <option value="other">other</option>
            <option value="verb">verb</option>
            <option value="noun">noun</option>
            <option value="adjective">adjective</option>
          </select>
          <button className="row-btn save-btn" onClick={handleCreate}>Create</button>
          <button className="row-btn cancel-btn" onClick={() => setShowCreate(false)}>Cancel</button>
        </div>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
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
            {filtered.map((w) => (
              <>
                {editingId === w.id ? (
                  <tr key={w.id} className="editing-row">
                    <td></td>
                    <td>
                      <input className="cell-input" value={editDraft.german ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, german: e.target.value }))} onKeyDown={(e) => handleKeyDown(e, w.id)} autoFocus />
                    </td>
                    <td>
                      <input className="cell-input" value={editDraft.translation ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, translation: e.target.value }))} onKeyDown={(e) => handleKeyDown(e, w.id)} />
                    </td>
                    <td className="cell-lang">{primaryLang(w)}</td>
                    <td className="cell-source">{w.word_type}</td>
                    <td>
                      <input className="cell-input" value={editDraft.source ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))} onKeyDown={(e) => handleKeyDown(e, w.id)} />
                    </td>
                    <td className="cell-date">{w.date ?? "—"}</td>
                    <td className="actions-col">
                      <button className="row-btn save-btn" onClick={() => saveEdit(w.id)}>Save</button>
                      <button className="row-btn cancel-btn" onClick={cancelEdit}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={w.id} className={expandedId === w.id ? "expanded-row" : ""}>
                    <td className="expand-cell" onClick={() => toggleExpand(w.id)}>
                      <span className={`expand-arrow ${expandedId === w.id ? "open" : ""}`}>▶</span>
                    </td>
                    <td className="cell-german" onClick={() => toggleExpand(w.id)} style={{ cursor: "pointer" }}>{w.german}</td>
                    <td>{primaryTranslation(w)}</td>
                    <td className="cell-lang">{primaryLang(w)}</td>
                    <td className="cell-source">{w.word_type}</td>
                    <td className="cell-source">{w.source ?? "—"}</td>
                    <td className="cell-date">{w.date ?? "—"}</td>
                    <td className="actions-col">
                      <button className="row-btn edit-btn" onClick={() => startEdit(w)}>Edit</button>
                      <button className="row-btn delete-btn" onClick={() => handleDelete(w.id)}>Delete</button>
                    </td>
                  </tr>
                )}
                {expandedId === w.id && editingId !== w.id && (
                  <tr key={`${w.id}-detail`} className="detail-row">
                    <td colSpan={8}>
                      <WordDetail wordId={w.id} />
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
