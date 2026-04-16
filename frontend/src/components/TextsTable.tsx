import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type TextItem,
  deleteText,
  fetchTexts,
  updateText,
  createText,
} from "../api";
import TextDetail from "./TextDetail";

type SortKey = "content" | "source" | "date";
type SortDir = "asc" | "desc";

const collator = new Intl.Collator("de", { sensitivity: "base" });

function comparator(a: TextItem, b: TextItem, key: SortKey, dir: SortDir): number {
  let va: string;
  let vb: string;
  switch (key) {
    case "content":
      va = a.content;
      vb = b.content;
      break;
    case "source":
      va = a.source ?? "";
      vb = b.source ?? "";
      break;
    case "date":
      va = a.date ?? "";
      vb = b.date ?? "";
      break;
  }
  const cmp = collator.compare(va, vb);
  return dir === "asc" ? cmp : -cmp;
}

export default function TextsTable() {
  const [items, setItems] = useState<TextItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TextItem>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createContent, setCreateContent] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const doFetch = useCallback(() => {
    setLoading(true);
    setFetchError(false);
    fetchTexts()
      .then((data) => setItems(data.texts))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  const filtered = useMemo(() => {
    let result = items;
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((t) =>
        t.content.toLowerCase().includes(q) ||
        (t.translations ?? []).some((tr) => tr.translation.toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      const sk = sortKey;
      const sd = sortDir;
      result = [...result].sort((a, b) => comparator(a, b, sk, sd));
    }
    return result;
  }, [items, filter, sortKey, sortDir]);

  function primaryTranslation(t: TextItem): string {
    return t.translations?.[0]?.translation ?? "—";
  }

  function startEdit(item: TextItem) {
    setEditingId(item.id);
    setActiveId(null);
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
      if (activeId === id) setActiveId(null);
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

  const hasViewFilters = Boolean(filter.trim());
  const tableSummary = hasViewFilters
    ? `${filtered.length} texts shown`
    : `${items.length} texts`;
  const tableSummarySecondary = hasViewFilters ? `${items.length} total` : null;

  const activeText = activeId ? items.find((t) => t.id === activeId) : null;

  if (loading) {
    return (
      <div className="data-table-container">
        <div className="table-skeleton" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="table-skeleton-row">
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
          <p className="table-state-title">Failed to load texts</p>
          <p className="table-state-subtitle">Something went wrong while fetching your texts.</p>
          <button className="row-btn save-btn" onClick={doFetch}>Retry</button>
        </div>
      </div>
    );
  }

  if (items.length === 0 && !showCreate) {
    return (
      <div className="data-table-container">
        <div className="table-state-message">
          <p className="table-state-title">No texts stored yet</p>
          <p className="table-state-subtitle">Start building your collection by adding a text.</p>
          <button className="row-btn save-btn" onClick={() => setShowCreate(true)}>
            + Add text
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
              <label className="table-search-label" htmlFor="texts-search">
                Search texts
              </label>
              <input
                id="texts-search"
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

        {filter.trim() && (
          <div className="table-active-filters" aria-label="Active filters">
            <button
              className="table-filter-chip"
              onClick={() => setFilter("")}
              title={`Remove search: ${filter.trim()}`}
            >
              <span>Search: {filter.trim()}</span>
              <span className="table-filter-chip-close" aria-hidden="true">x</span>
            </button>
            <button className="table-filter-clear-all" onClick={() => setFilter("")}>
              Reset view
            </button>
          </div>
        )}

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
          <table className="data-table" role="grid">
            <thead>
              <tr>
                <th
                  className="th-sortable cell-text-column"
                  aria-sort={sortAriaSort("content")}
                >
                  <button type="button" className="th-sort-btn" onClick={() => cycleSort("content")}>
                    Text
                    <span className={`sort-indicator ${sortKey === "content" ? "active" : ""}`}>
                      {sortIndicator("content")}
                    </span>
                  </button>
                </th>
                <th className="cell-translation-column">Translation</th>
                <th
                  className="th-sortable"
                  aria-sort={sortAriaSort("source")}
                >
                  <button type="button" className="th-sort-btn" onClick={() => cycleSort("source")}>
                    Source
                    <span className={`sort-indicator ${sortKey === "source" ? "active" : ""}`}>
                      {sortIndicator("source")}
                    </span>
                  </button>
                </th>
                <th
                  className="th-sortable"
                  aria-sort={sortAriaSort("date")}
                >
                  <button type="button" className="th-sort-btn" onClick={() => cycleSort("date")}>
                    Date
                    <span className={`sort-indicator ${sortKey === "date" ? "active" : ""}`}>
                      {sortIndicator("date")}
                    </span>
                  </button>
                </th>
                <th className="actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-filtered-empty-cell">
                    <div className="table-state-message table-state-inline">
                      <p className="table-state-title">No texts match this view</p>
                      <p className="table-state-subtitle">Try adjusting your search.</p>
                      <button className="row-btn save-btn" onClick={() => setFilter("")}>
                        Clear search
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((t) => (
                <Fragment key={t.id}>
                  {editingId === t.id ? (
                    <tr className="editing-row" data-editing="true">
                      <td className="cell-text-column">
                        <input className="cell-input" value={editDraft.content ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, content: e.target.value }))} onKeyDown={(e) => handleEditKeyDown(e, t.id)} autoFocus />
                      </td>
                      <td className="cell-translation-column">
                        <div className="cell-translation-wrap">{primaryTranslation(t)}</div>
                      </td>
                      <td className="cell-source">
                        <input className="cell-input cell-input-meta" value={editDraft.source ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, source: e.target.value }))} onKeyDown={(e) => handleEditKeyDown(e, t.id)} placeholder="Source" />
                      </td>
                      <td className="cell-date">{t.date ?? "—"}</td>
                      <td className="actions-col">
                        <div className="row-actions row-actions-visible">
                          <button className="row-btn save-btn" onClick={() => saveEdit(t.id)}>Save</button>
                          <button className="row-btn cancel-btn" onClick={cancelEdit}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      data-active={activeId === t.id || undefined}
                    >
                      <td className="cell-text-column">
                        <button
                          className="cell-german-button"
                          onClick={(e) => openDetail(t.id, e.currentTarget)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openDetail(t.id, e.currentTarget);
                            }
                          }}
                        >
                          <span className="cell-german">{t.content}</span>
                        </button>
                      </td>
                      <td className="cell-translation-column">
                        <div className="cell-translation-wrap">{primaryTranslation(t)}</div>
                      </td>
                      <td className="cell-source">{t.source ?? "—"}</td>
                      <td className="cell-date">{t.date ?? "—"}</td>
                      <td className="actions-col">
                        <details className="row-menu" onClick={(e) => e.stopPropagation()}>
                          <summary className="row-menu-trigger" aria-label={`Actions for text`}>
                            ···
                          </summary>
                          <div className="row-menu-popover">
                            <button type="button" className="row-menu-item" onClick={() => startEdit(t)}>Edit</button>
                            <button type="button" className="row-menu-item row-menu-item-danger" onClick={() => handleDelete(t.id)}>Delete</button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeText && (
        <aside
          className="detail-drawer"
          aria-label={`Details for text`}
          onKeyDown={(e) => { if (e.key === "Escape") closePanel(); }}
        >
          <div className="detail-drawer-header">
            <div className="detail-drawer-title-row">
              <h3 className="detail-drawer-title">{activeText.content}</h3>
            </div>
            <div className="detail-meta-bar">
              <span className="detail-meta-chip">Source: {activeText.source ?? "—"}</span>
              <span className="detail-meta-chip">Date: {activeText.date ?? "—"}</span>
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
            <TextDetail key={activeText.id} textId={activeText.id} />
          </div>
        </aside>
      )}
    </div>
  );
}
