import { useState } from 'react';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { type IntakeApplyResult, type IntakeProposal, applyIntake } from '../api';

interface Props {
  proposals: IntakeProposal[];
  onDone: (applied: boolean) => void;
}

export default function IntakeReview({ proposals, onDone }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(proposals.map((_, i) => i)));
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<IntakeApplyResult | null>(null);

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

  const handleClose = () => {
    if (applying) return;
    onDone(false);
  };

  return (
    <Dialog open onClose={handleClose} maxWidth="md" fullWidth>
      {result ? (
        <>
          <DialogTitle>Words Saved</DialogTitle>
          <DialogContent dividers>
            <div className="enrichment-result">
              <p className="enrichment-result-summary">
                Saved {result.applied} of {result.total} words
              </p>
              <ul className="enrichment-result-list">
                {result.details.map((d, i) => (
                  <li key={i} className={d.ok ? 'ok' : 'fail'}>
                    <strong>{d.german}</strong>
                    {d.ok ? ` (${d.word_type})` : ' — failed'}
                  </li>
                ))}
              </ul>
            </div>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={() => onDone(true)}>
              Done
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
          >
            <span>Review Proposed Words ({proposals.length})</span>
            <Button size="small" onClick={toggleAll}>
              {selected.size === proposals.length ? 'Deselect All' : 'Select All'}
            </Button>
          </DialogTitle>
          <DialogContent dividers>
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
          </DialogContent>
          <DialogActions>
            <Button onClick={() => onDone(false)} disabled={applying}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleApply}
              disabled={applying || selected.size === 0}
            >
              {applying ? 'Saving...' : `Save ${selected.size} Selected`}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
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
    <div className={`enrichment-card ${checked ? 'selected' : ''}`}>
      <label className="enrichment-card-header">
        <Checkbox checked={checked} onChange={onToggle} size="small" sx={{ p: 0.5 }} />
        <span className="enrichment-word">{p.german}</span>
        {p.word_type && (
          <span className="enrichment-value enrichment-add" style={{ marginLeft: 'auto' }}>
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
