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
  const [filterType, setFilterType] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterLang, setFilterLang] = useState("");
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
  const [enrichSelection, setEnrichSelection] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchWords()
      .then((data) => {
        setItems(data.words);
        setEnrichSelection(new Set(data.words.map((w) => w.id)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const typeOptions = useMemo(
    () => [...new Set(items.map((w) => w.word_type).filter(Boolean))].sort(),
    [items]
  );
  const sourceOptions = useMemo(
    () => [...new Set(items.map((w) => w.source).filter(Boolean))].sort() as string[],
    [items]
  );
  const langOptions = useMemo(
    () => [...new Set(items.flatMap((w) => w.translations.map((t) => t.language)).filter(Boolean))].sort(),
    [items]
  );

  const hasActiveFilters = filterType || filterSource || filterLang;

  const filtered = useMemo(() => {
    return items.filter((w) => {
      if (filter) {
        const q = filter.toLowerCase();
        const matchText =
          w.german.toLowerCase().includes(q) ||
          (w.translations[0]?.translation ?? "").toLowerCase().includes(q);
        if (!matchText) return false;
      }
      if (filterType && w.word_type !== filterType) return false;
      if (filterSource && w.source !== filterSource) return false;
      if (filterLang && !w.translations.some((t) => t.language === filterLang)) return false;
      return true;
    });
  }, [items, filter, filterType, filterSource, filterLang]);

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

  function toggleEnrichItem(id: string) {
    setEnrichSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEnrichAll() {
    const visibleIds = filtered.map((w) => w.id);
    const allVisible = visibleIds.every((id) => enrichSelection.has(id));
    setEnrichSelection((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allVisible) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function handleEnrich() {
    const ids = filtered
      .map((w) => w.id)
      .filter((id) => enrichSelection.has(id));
    if (ids.length === 0) return;

    setEnriching(true);
    try {
      const res = await proposeEnrichments(ids);
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
        .then((data) => {
          setItems(data.words);
          setEnrichSelection(new Set(data.words.map((w) => w.id)));
        })
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
          disabled={enriching || enrichSelection.size === 0}
        >
          {enriching
            ? "Enriching..."
            : `Enrich (${filtered.filter((w) => enrichSelection.has(w.id)).length})`}
        </button>
        <button className="row-btn save-btn" onClick={() => setShowCreate(!showCreate)}>
          + Add
        </button>
      </div>

      <div className="table-filter-row">
        <span className="table-filter-label">Filter:</span>
        <select
          className={`table-filter-select ${filterType ? "active" : ""}`}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">All types</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          className={`table-filter-select ${filterSource ? "active" : ""}`}
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
        >
          <option value="">All sources</option>
          {sourceOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className={`table-filter-select ${filterLang ? "active" : ""}`}
          value={filterLang}
          onChange={(e) => setFilterLang(e.target.value)}
        >
          <option value="">All languages</option>
          {langOptions.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            className="table-filter-clear"
            onClick={() => { setFilterType(""); setFilterSource(""); setFilterLang(""); }}
          >
            ✕ Clear
          </button>
        )}
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
              <th className="enrich-check-col">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((w) => enrichSelection.has(w.id))}
                  onChange={toggleEnrichAll}
                  title="Select all for enrichment"
                />
              </th>
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
                    <td className="enrich-check-col">
                      <input
                        type="checkbox"
                        checked={enrichSelection.has(w.id)}
                        onChange={() => toggleEnrichItem(w.id)}
                      />
                    </td>
                    <td className="expand-cell"></td>
                    <td>
                      <input className="cell-input" value={editDraft.german ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, german: e.target.value }))} onKeyDown={(e) => handleKeyDown(e, w.id)} autoFocus />
                    </td>
                    <td>
                      <input className="cell-input" value={editDraft.translation ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, translation: e.target.value }))} onKeyDown={(e) => handleKeyDown(e, w.id)} />
                    </td>
                    <td className="cell-lang">{primaryLang(w)}</td>
                    <td><span className={`word-type-badge ${w.word_type}`}>{w.word_type}</span></td>
                    <td>
                      <input className="cell-input" value={editDraft.source ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))} onKeyDown={(e) => handleKeyDown(e, w.id)} />
                    </td>
                    <td className="cell-date">{w.date ?? "—"}</td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <button className="row-btn save-btn" onClick={() => saveEdit(w.id)}>Save</button>
                        <button className="row-btn cancel-btn" onClick={cancelEdit}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={w.id} className={expandedId === w.id ? "expanded-row" : ""}>
                    <td className="enrich-check-col">
                      <input
                        type="checkbox"
                        checked={enrichSelection.has(w.id)}
                        onChange={() => toggleEnrichItem(w.id)}
                      />
                    </td>
                    <td className="expand-cell" onClick={() => toggleExpand(w.id)}>
                      <span className={`expand-arrow ${expandedId === w.id ? "open" : ""}`}>▶</span>
                    </td>
                    <td className="cell-german" onClick={() => toggleExpand(w.id)} style={{ cursor: "pointer" }}>{w.german}</td>
                    <td><div className="cell-translation-wrap">{primaryTranslation(w)}</div></td>
                    <td className="cell-lang">{primaryLang(w)}</td>
                    <td><span className={`word-type-badge ${w.word_type}`}>{w.word_type}</span></td>
                    <td className="cell-source">{w.source ?? "—"}</td>
                    <td className="cell-date">{w.date ?? "—"}</td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <button className="row-btn edit-btn" onClick={() => startEdit(w)}>Edit</button>
                        <button className="row-btn delete-btn" onClick={() => handleDelete(w.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )}
                {expandedId === w.id && editingId !== w.id && (
                  <tr key={`${w.id}-detail`} className="detail-row">
                    <td colSpan={9}>
                      <WordDetail wordId={w.id} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {proposals !== null && proposals.length === 0 && (
        <div className="modal-overlay" onClick={() => setProposals(null)}>
          <div className="modal-container enrichment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>No enrichments to propose</h3>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--muted)", textAlign: "center", margin: "1rem 0" }}>
                All words appear to have complete data, or the agent could not generate proposals.
              </p>
            </div>
            <div className="modal-footer">
              <button className="row-btn save-btn" onClick={() => setProposals(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {proposals !== null && proposals.length > 0 && (
        <EnrichmentReview proposals={proposals} onDone={handleEnrichDone} />
      )}
    </div>
  );
}
