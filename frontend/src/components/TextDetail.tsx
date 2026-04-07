import { useEffect, useState, useCallback } from "react";
import {
  type TextDetails,
  type WordItem,
  fetchTextDetail,
  fetchWords,
  linkTextWord,
  unlinkTextWord,
} from "../api";
import TagPills from "./TagPills";
import ExplanationsList from "./ExplanationsList";
import CorrectionsList from "./CorrectionsList";

interface Props {
  textId: string;
}

export default function TextDetail({ textId }: Props) {
  const [data, setData] = useState<TextDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchTextDetail(textId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [textId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="detail-loading">Loading…</div>;
  if (!data) return <div className="detail-loading">Failed to load</div>;

  return (
    <div className="detail-panel">
      <div className="detail-section">
        <h4 className="detail-section-title">Explanations</h4>
        <ExplanationsList
          entityType="text"
          entityId={textId}
          explanations={data.explanations}
          onChange={load}
        />
      </div>
      <div className="detail-section">
        <h4 className="detail-section-title">Tags</h4>
        <TagPills entityType="text" entityId={textId} tags={data.tags} onChange={load} />
      </div>
      <div className="detail-section">
        <h4 className="detail-section-title">Corrections</h4>
        <CorrectionsList textId={textId} corrections={data.corrections} onChange={load} />
      </div>
      <div className="detail-section">
        <h4 className="detail-section-title">Linked Words</h4>
        <LinkedWords textId={textId} links={data.text_words} onChange={load} />
      </div>
    </div>
  );
}

function LinkedWords({ textId, links, onChange }: {
  textId: string;
  links: TextDetails["text_words"];
  onChange: () => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [allWords, setAllWords] = useState<WordItem[]>([]);

  useEffect(() => {
    if (showSearch) fetchWords().then((d) => setAllWords(d.words));
  }, [showSearch]);

  const linkedIds = new Set(links.map((l) => l.word_id));
  const suggestions = allWords.filter(
    (w) => !linkedIds.has(w.id) && w.german.toLowerCase().includes(query.toLowerCase())
  );

  async function handleLink(wordId: string) {
    await linkTextWord(textId, wordId, links.length);
    setQuery("");
    setShowSearch(false);
    onChange();
  }

  async function handleUnlink(linkId: string) {
    await unlinkTextWord(linkId);
    onChange();
  }

  return (
    <div className="linked-words">
      {links.map((l) => (
        <div key={l.id} className="linked-word-row">
          <span className="linked-word-german">{l.words?.german ?? "?"}</span>
          <button className="row-btn delete-btn" onClick={() => handleUnlink(l.id)}>Unlink</button>
        </div>
      ))}
      {showSearch ? (
        <div className="linked-word-search">
          <input
            className="cell-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search word to link…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") { setShowSearch(false); setQuery(""); }
              if (e.key === "Enter" && suggestions.length > 0) handleLink(suggestions[0].id);
            }}
          />
          {query && (
            <div className="tag-dropdown">
              {suggestions.slice(0, 8).map((w) => (
                <button key={w.id} className="tag-dropdown-item" onClick={() => handleLink(w.id)}>
                  {w.german}
                </button>
              ))}
              {suggestions.length === 0 && <div className="tag-dropdown-item">No matches</div>}
            </div>
          )}
        </div>
      ) : (
        <button className="row-btn edit-btn" onClick={() => setShowSearch(true)}>+ Link word</button>
      )}
    </div>
  );
}
