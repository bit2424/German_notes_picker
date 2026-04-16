import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type WordItem,
  type WordPracticeStats,
  type EnrichmentProposal,
  deleteWord,
  fetchWords,
  fetchAllWordPracticeStats,
  updateWord,
  updateTranslation,
  createWord,
  proposeEnrichments,
} from "../api";
import EnrichmentReview from "./EnrichmentReview";
import WordDetail from "./WordDetail";

type SortKey = "german" | "type" | "lang" | "source" | "date" | "practice";
type SortDir = "asc" | "desc";

const collator = new Intl.Collator("de", { sensitivity: "base" });

function comparator(
  a: WordItem,
  b: WordItem,
  key: SortKey,
  dir: SortDir,
  practiceMap?: Record<string, WordPracticeStats>,
): number {
  if (key === "practice" && practiceMap) {
    const pa = practiceMap[a.id];
    const pb = practiceMap[b.id];
    const va = pa?.accuracy ?? -1;
    const vb = pb?.accuracy ?? -1;
    const cmp = va - vb;
    return dir === "asc" ? cmp : -cmp;
  }
  let va: string;
  let vb: string;
  switch (key) {
    case "german":
      va = a.german;
      vb = b.german;
      break;
    case "type":
      va = a.word_type ?? "";
      vb = b.word_type ?? "";
      break;
    case "lang":
      va = a.translations[0]?.language ?? "";
      vb = b.translations[0]?.language ?? "";
      break;
    case "source":
      va = a.source ?? "";
      vb = b.source ?? "";
      break;
    case "date":
      va = a.date ?? "";
      vb = b.date ?? "";
      break;
    default:
      va = "";
      vb = "";
  }
  const cmp = collator.compare(va, vb);
  return dir === "asc" ? cmp : -cmp;
}

export default function WordsTable() {
  const [items, setItems] = useState<WordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [filter, setFilter] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [practiceMap, setPracticeMap] = useState<Record<string, WordPracticeStats>>({});

  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const doFetch = useCallback(() => {
    setLoading(true);
    setFetchError(false);
    fetchWords()
      .then((data) => {
        setItems(data.words);
        setEnrichSelection(new Set(data.words.map((w) => w.id)));
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    doFetch();
    fetchAllWordPracticeStats()
      .then(setPracticeMap)
      .catch(() => {});
  }, [doFetch]);

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
    let result = items.filter((w) => {
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
    if (sortKey) {
      const sk = sortKey;
      const sd = sortDir;
      result = [...result].sort((a, b) => comparator(a, b, sk, sd, practiceMap));
    }
    return result;
  }, [items, filter, filterType, filterSource, filterLang, sortKey, sortDir, practiceMap]);

  function primaryTranslation(w: WordItem): string {
    return w.translations[0]?.translation ?? "—";
  }

  function primaryLang(w: WordItem): string {
    return w.translations[0]?.language ?? "—";
  }

  function clearAllViewFilters() {
    setFilter("");
    setFilterType("");
    setFilterSource("");
    setFilterLang("");
  }

  function startEdit(item: WordItem) {
    setEditingId(item.id);
    setActiveId(null);
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
      if (activeId === id) setActiveId(null);
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

  function clearVisibleSelection() {
    const visibleIds = new Set(filtered.map((w) => w.id));
    setEnrichSelection((prev) => new Set([...prev].filter((id) => !visibleIds.has(id))));
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

  function handleEditKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") saveEdit(id);
    if (e.key === "Escape") cancelEdit();
  }

  function openDetail(id: string, triggerEl?: HTMLButtonElement | null) {
    setActiveId((prev) => (prev === id ? null : id));
    if (triggerEl) activeTriggerRef.current = triggerEl;
  }

  function closePanel() {
    setActiveId(null);
    activeTriggerRef.current?.focus();
    activeTriggerRef.current = null;
  }

  function cycleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortAriaSort(key: SortKey): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "▸";
    return sortDir === "asc" ? "▲" : "▼";
  }

  const visibleSelectedCount = filtered.filter((w) => enrichSelection.has(w.id)).length;
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((w) => enrichSelection.has(w.id));
  const hasViewFilters = Boolean(filter.trim()) || Boolean(hasActiveFilters);
  const tableSummary = hasViewFilters
    ? `${filtered.length} words shown`
    : `${items.length} words`;
  const tableSummarySecondary = hasViewFilters ? `${items.length} total` : null;
  const activeFilters = [
    filter.trim()
      ? { key: "search", label: `Search: ${filter.trim()}`, onRemove: () => setFilter("") }
      : null,
    filterType
      ? { key: "type", label: `Type: ${filterType}`, onRemove: () => setFilterType("") }
      : null,
    filterSource
      ? { key: "source", label: `Source: ${filterSource}`, onRemove: () => setFilterSource("") }
      : null,
    filterLang
      ? { key: "language", label: `Language: ${filterLang}`, onRemove: () => setFilterLang("") }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  const activeWord = activeId ? items.find((w) => w.id === activeId) : null;

  if (loading) {
    return (
      <div className="data-table-container">
        <div className="table-skeleton" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="table-skeleton-row">
              <div className="table-skeleton-cell table-skeleton-check" />
              <div className="table-skeleton-cell table-skeleton-german" />
              <div className="table-skeleton-cell table-skeleton-translation" />
              <div className="table-skeleton-cell table-skeleton-meta" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="data-table-container">
        <div className="table-state-message">
          <p className="table-state-title">Failed to load words</p>
          <p className="table-state-subtitle">Something went wrong while fetching your vocabulary.</p>
          <button className="row-btn save-btn" onClick={doFetch}>Retry</button>
        </div>
      </div>
    );
  }

  if (items.length === 0 && !showCreate) {
    return (
      <div className="data-table-container">
        <div className="table-state-message">
          <p className="table-state-title">No words stored yet</p>
          <p className="table-state-subtitle">Start building your vocabulary by adding a word.</p>
          <button className="row-btn save-btn" onClick={() => setShowCreate(true)}>
            + Add word
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`data-table-container ${activeId ? "panel-open" : ""}`}>
      <div className="table-body-area">
        <div className="table-toolbar">
          <div className="table-toolbar-main">
            <div className="table-search-group">
              <label className="table-search-label" htmlFor="words-search">
                Search words
              </label>
              <input
                id="words-search"
                type="text"
                className="table-filter table-filter-primary"
                placeholder="Search German or translation…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="table-toolbar-actions">
              <div className="table-toolbar-summary">
                <span className="table-count">{tableSummary}</span>
                {tableSummarySecondary && (
                  <span className="table-count-secondary">{tableSummarySecondary}</span>
                )}
              </div>
              <button className="row-btn save-btn" onClick={() => setShowCreate(!showCreate)}>
                {showCreate ? "Close" : "+ Add"}
              </button>
            </div>
          </div>
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
              Clear filters
            </button>
          )}
        </div>

        {activeFilters.length > 0 && (
          <div className="table-active-filters" aria-label="Active filters">
            {activeFilters.map((af) => (
              <button
                key={af.key}
                className="table-filter-chip"
                onClick={af.onRemove}
                title={`Remove ${af.label}`}
              >
                <span>{af.label}</span>
                <span className="table-filter-chip-close" aria-hidden="true">x</span>
              </button>
            ))}
            <button className="table-filter-clear-all" onClick={clearAllViewFilters}>
              Reset view
            </button>
          </div>
        )}

        {visibleSelectedCount > 0 && (
          <div className="table-bulk-bar" role="status" aria-live="polite">
            <div className="table-bulk-copy">
              <span className="table-bulk-count">{visibleSelectedCount} selected</span>
              <span className="table-bulk-label">for enrichment</span>
            </div>
            <div className="table-bulk-actions">
              <button
                className="row-btn enrich-btn"
                onClick={handleEnrich}
                disabled={enriching}
              >
                {enriching ? "Enriching..." : "Enrich selected"}
              </button>
              <button className="row-btn cancel-btn" onClick={clearVisibleSelection}>
                Deselect all
              </button>
            </div>
          </div>
        )}

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
          <table className="data-table" role="grid">
            <thead>
              <tr>
                <th
                  className="th-sortable cell-german-column"
                  aria-sort={sortAriaSort("german")}
                >
                  <button
                    type="button"
                    className="th-sort-btn"
                    onClick={() => cycleSort("german")}
                  >
                    German
                    <span className={`sort-indicator ${sortKey === "german" ? "active" : ""}`}>
                      {sortIndicator("german")}
                    </span>
                  </button>
                </th>
                <th className="cell-translation-column">Translation</th>
                <th
                  className="th-sortable cell-lang-col"
                  aria-sort={sortAriaSort("lang")}
                >
                  <button type="button" className="th-sort-btn" onClick={() => cycleSort("lang")}>
                    Lang
                    <span className={`sort-indicator ${sortKey === "lang" ? "active" : ""}`}>
                      {sortIndicator("lang")}
                    </span>
                  </button>
                </th>
                <th
                  className="th-sortable cell-type-col"
                  aria-sort={sortAriaSort("type")}
                >
                  <button type="button" className="th-sort-btn" onClick={() => cycleSort("type")}>
                    Type
                    <span className={`sort-indicator ${sortKey === "type" ? "active" : ""}`}>
                      {sortIndicator("type")}
                    </span>
                  </button>
                </th>
                <th
                  className="th-sortable cell-practice-col"
                  aria-sort={sortAriaSort("practice")}
                >
                  <button type="button" className="th-sort-btn" onClick={() => cycleSort("practice")}>
                    Practice
                    <span className={`sort-indicator ${sortKey === "practice" ? "active" : ""}`}>
                      {sortIndicator("practice")}
                    </span>
                  </button>
                </th>
                <th className="actions-col"></th>
                <th className="enrich-check-col">
                  <div className="enrich-col-header">
                    <span className="enrich-col-label">Enrich</span>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleEnrichAll}
                      title="Select all visible rows for enrichment"
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-filtered-empty-cell">
                    <div className="table-state-message table-state-inline">
                      <p className="table-state-title">No words match this view</p>
                      <p className="table-state-subtitle">Try adjusting your search or filters.</p>
                      <button className="row-btn save-btn" onClick={clearAllViewFilters}>
                        Clear all filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((w) => (
                <Fragment key={w.id}>
                  {editingId === w.id ? (
                    <tr
                      className="editing-row"
                      data-editing="true"
                    >
                      <td className="cell-german-column">
                        <div className="cell-german-stack">
                          <input className="cell-input" value={editDraft.german ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, german: e.target.value }))} onKeyDown={(e) => handleEditKeyDown(e, w.id)} autoFocus />
                          <input className="cell-input cell-input-meta" value={editDraft.source ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))} onKeyDown={(e) => handleEditKeyDown(e, w.id)} placeholder="Source" />
                        </div>
                      </td>
                      <td className="cell-translation-column">
                        <input className="cell-input" value={editDraft.translation ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, translation: e.target.value }))} onKeyDown={(e) => handleEditKeyDown(e, w.id)} />
                      </td>
                      <td className="cell-lang-col cell-lang">{primaryLang(w)}</td>
                      <td className="cell-type-col"><span className={`word-type-badge ${w.word_type}`}>{w.word_type}</span></td>
                      <td className="cell-practice-col"><PracticeCell stats={practiceMap[w.id]} /></td>
                      <td className="actions-col">
                        <div className="row-actions row-actions-visible">
                          <button className="row-btn save-btn" onClick={() => saveEdit(w.id)}>Save</button>
                          <button className="row-btn cancel-btn" onClick={cancelEdit}>Cancel</button>
                        </div>
                      </td>
                      <td className="enrich-check-col">
                        <input
                          type="checkbox"
                          checked={enrichSelection.has(w.id)}
                          onChange={() => toggleEnrichItem(w.id)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr
                      data-active={activeId === w.id || undefined}
                      data-selected={enrichSelection.has(w.id) || undefined}
                    >
                      <td className="cell-german-column">
                        <button
                          className="cell-german-button"
                          onClick={(e) => openDetail(w.id, e.currentTarget)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openDetail(w.id, e.currentTarget);
                            }
                          }}
                        >
                          <span className="cell-german">{w.german}</span>
                          {(w.source || w.date) && (
                            <span className="cell-german-meta">
                              {w.source ?? "manual"}
                              {w.date ? ` · ${w.date}` : ""}
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="cell-translation-column">
                        <div className="cell-translation-wrap">{primaryTranslation(w)}</div>
                      </td>
                      <td className="cell-lang-col cell-lang">{primaryLang(w)}</td>
                      <td className="cell-type-col"><span className={`word-type-badge ${w.word_type}`}>{w.word_type}</span></td>
                      <td className="cell-practice-col"><PracticeCell stats={practiceMap[w.id]} /></td>
                      <td className="actions-col">
                        <details className="row-menu" onClick={(e) => e.stopPropagation()}>
                          <summary className="row-menu-trigger" aria-label={`Actions for ${w.german}`}>
                            ···
                          </summary>
                          <div className="row-menu-popover">
                            <button type="button" className="row-menu-item" onClick={() => startEdit(w)}>Edit</button>
                            <button type="button" className="row-menu-item row-menu-item-danger" onClick={() => handleDelete(w.id)}>Delete</button>
                          </div>
                        </details>
                      </td>
                      <td className="enrich-check-col">
                        <input
                          type="checkbox"
                          checked={enrichSelection.has(w.id)}
                          onChange={() => toggleEnrichItem(w.id)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeWord && (
        <aside
          className="detail-drawer"
          aria-label={`Details for ${activeWord.german}`}
          onKeyDown={(e) => { if (e.key === "Escape") closePanel(); }}
        >
          <div className="detail-drawer-header">
            <div className="detail-drawer-title-row">
              <h3 className="detail-drawer-title">{activeWord.german}</h3>
              <span className={`word-type-badge ${activeWord.word_type}`}>{activeWord.word_type}</span>
            </div>
            <div className="detail-meta-bar">
              <span className="detail-meta-chip">Source: {activeWord.source ?? "—"}</span>
              <span className="detail-meta-chip">Date: {activeWord.date ?? "—"}</span>
            </div>
            <button
              type="button"
              className="detail-drawer-close"
              onClick={closePanel}
              aria-label="Close detail panel"
            >
              ✕
            </button>
          </div>
          <div className="detail-drawer-body">
            <WordDetail key={activeWord.id} wordId={activeWord.id} />
          </div>
        </aside>
      )}

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

function PracticeCell({ stats }: { stats?: WordPracticeStats }) {
  if (!stats || stats.total_attempts === 0) {
    return <span className="practice-cell practice-cell-empty">—</span>;
  }
  const pct = stats.accuracy != null ? `${Math.round(stats.accuracy * 100)}%` : "—";
  return (
    <span className="practice-cell">
      <span className="practice-cell-pct">{pct}</span>
      <span className="practice-cell-count">({stats.total_attempts})</span>
    </span>
  );
}
