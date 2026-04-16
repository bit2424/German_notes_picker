import { useEffect, useState } from "react";
import {
  type IntakeApplyResult,
  type IntakeProposal,
  applyIntake,
} from "../api";

interface Props {
  proposals: IntakeProposal[];
  onDone: (applied: boolean) => void;
}

export default function IntakeReview({ proposals, onDone }: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(proposals.map((_, i) => i))
  );
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<IntakeApplyResult | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function toggleWord(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === proposals.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(proposals.map((_, i) => i)));
    }
  }

  async function handleApply() {
    const approved = proposals.filter((_, i) => selected.has(i));
    if (approved.length === 0) return;

    setApplying(true);
    try {
      const res = await applyIntake(approved);
      setResult(res);
    } catch {
      /* keep panel open on error */
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !applying && onDone(false)}>
      <div className="modal-container enrichment-modal" onClick={(e) => e.stopPropagation()}>
        {result ? (
          <>
            <div className="modal-header">
              <h3>Words Saved</h3>
            </div>
            <div className="modal-body">
              <div className="enrichment-result">
                <p className="enrichment-result-summary">
                  Saved {result.applied} of {result.total} words
                </p>
                <ul className="enrichment-result-list">
                  {result.details.map((d, i) => (
                    <li key={i} className={d.ok ? "ok" : "fail"}>
                      <strong>{d.german}</strong>
                      {d.ok ? ` (${d.word_type})` : " — failed"}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button className="row-btn save-btn" onClick={() => onDone(true)}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-header">
              <h3>Review Proposed Words ({proposals.length})</h3>
              <div className="enrichment-header-actions">
                <button className="row-btn edit-btn" onClick={toggleAll}>
                  {selected.size === proposals.length ? "Deselect All" : "Select All"}
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div className="enrichment-cards">
                {proposals.map((p, i) => (
                  <IntakeProposalCard
                    key={i}
                    proposal={p}
                    checked={selected.has(i)}
                    onToggle={() => toggleWord(i)}
                  />
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="row-btn save-btn"
                onClick={handleApply}
                disabled={applying || selected.size === 0}
              >
                {applying ? "Saving..." : `Save ${selected.size} Selected`}
              </button>
              <button
                className="row-btn cancel-btn"
                onClick={() => onDone(false)}
                disabled={applying}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IntakeProposalCard({
  proposal,
  checked,
  onToggle,
}: {
  proposal: IntakeProposal;
  checked: boolean;
  onToggle: () => void;
}) {
  const p = proposal;

  return (
    <div className={`enrichment-card ${checked ? "selected" : ""}`}>
      <label className="enrichment-card-header">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="enrichment-word">{p.german}</span>
        {p.word_type && (
          <span className="enrichment-value enrichment-add" style={{ marginLeft: "auto" }}>
            {p.word_type}
          </span>
        )}
      </label>

      <div className="enrichment-card-body">
        {p.translations && p.translations.length > 0 && (
          <div className="enrichment-field">
            <span className="enrichment-label">Translations</span>
            <div className="enrichment-translations">
              {p.translations.map((t, i) => (
                <span key={i} className="enrichment-value enrichment-add">
                  {t.language.toUpperCase()}: {t.translation}
                </span>
              ))}
            </div>
          </div>
        )}

        {p.noun_details && (
          <div className="enrichment-field">
            <span className="enrichment-label">Noun</span>
            <span className="enrichment-value enrichment-add">
              {p.noun_details.article && `${p.noun_details.article} `}
              {p.german}
              {p.noun_details.plural && ` (pl. ${p.noun_details.plural})`}
            </span>
          </div>
        )}

        {p.verb_details && (
          <div className="enrichment-field">
            <span className="enrichment-label">Verb</span>
            <div className="enrichment-verb-grid">
              {p.verb_details.infinitive && (
                <span className="enrichment-value enrichment-add">
                  inf: {p.verb_details.infinitive}
                </span>
              )}
              {p.verb_details.participle && (
                <span className="enrichment-value enrichment-add">
                  part: {p.verb_details.participle}
                </span>
              )}
              {p.verb_details.present_ich && (
                <span className="enrichment-value enrichment-add">
                  ich {p.verb_details.present_ich}
                </span>
              )}
              {p.verb_details.present_du && (
                <span className="enrichment-value enrichment-add">
                  du {p.verb_details.present_du}
                </span>
              )}
              {p.verb_details.present_er && (
                <span className="enrichment-value enrichment-add">
                  er {p.verb_details.present_er}
                </span>
              )}
              {p.verb_details.present_wir && (
                <span className="enrichment-value enrichment-add">
                  wir {p.verb_details.present_wir}
                </span>
              )}
              {p.verb_details.present_ihr && (
                <span className="enrichment-value enrichment-add">
                  ihr {p.verb_details.present_ihr}
                </span>
              )}
              {p.verb_details.present_sie && (
                <span className="enrichment-value enrichment-add">
                  sie {p.verb_details.present_sie}
                </span>
              )}
            </div>
          </div>
        )}

        {p.tags && p.tags.length > 0 && (
          <div className="enrichment-field">
            <span className="enrichment-label">Tags</span>
            <div className="enrichment-tags">
              {p.tags.map((t) => (
                <span key={t} className="tag-pill enrichment-add">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {p.explanation && (
          <div className="enrichment-field">
            <span className="enrichment-label">Explanation</span>
            <span className="enrichment-value enrichment-add enrichment-explanation">
              {p.explanation}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
