import { useEffect, useState, useCallback, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type WordDetails,
  type WordPracticeStats,
  type VerbDetails,
  type NounDetails,
  type AdjDeclension,
  fetchWordDetail,
  fetchWordPracticeStats,
  addTranslation,
  upsertVerbDetails,
  upsertNounDetails,
  createAdjDeclension,
  updateAdjDeclension,
  updateWord,
} from '../api';
import TagPills from './TagPills';
import ExplanationsList from './ExplanationsList';
import CorrectionsList from './CorrectionsList';
import TranslationsSection from './TranslationsSection';

const CASES = ['nominativ', 'akkusativ', 'dativ', 'genitiv'] as const;
const GENDERS = ['maskulin', 'feminin', 'neutrum', 'plural'] as const;

interface Props {
  wordId: string;
}

export default function WordDetail({ wordId }: Props) {
  const [data, setData] = useState<WordDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [practiceStats, setPracticeStats] = useState<WordPracticeStats | null>(null);

  const load = useCallback(() => {
    fetchWordDetail(wordId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchWordPracticeStats(wordId)
      .then(setPracticeStats)
      .catch(() => {});
  }, [wordId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="detail-loading">Loading…</div>;
  if (!data) return <div className="detail-loading">Failed to load</div>;

  return (
    <div className="detail-panel">
      <WordTypeSelector word={data} onChange={load} />
      {practiceStats && practiceStats.total_attempts > 0 && (
        <div className="detail-section">
          <h4 className="detail-section-title">Practice</h4>
          <div className="practice-stats-row">
            <div className="practice-stat">
              <span className="practice-stat-value">{practiceStats.total_attempts}</span>
              <span className="practice-stat-label">Practiced</span>
            </div>
            <div className="practice-stat">
              <span className="practice-stat-value">{practiceStats.correct}</span>
              <span className="practice-stat-label">Correct</span>
            </div>
            <div className="practice-stat">
              <span className="practice-stat-value">
                {practiceStats.accuracy != null
                  ? `${Math.round(practiceStats.accuracy * 100)}%`
                  : '—'}
              </span>
              <span className="practice-stat-label">Accuracy</span>
            </div>
            {practiceStats.last_practiced && (
              <div className="practice-stat">
                <span className="practice-stat-value">
                  {new Date(practiceStats.last_practiced).toLocaleDateString()}
                </span>
                <span className="practice-stat-label">Last</span>
              </div>
            )}
          </div>
        </div>
      )}
      <TranslationsSection
        translations={data.translations}
        onAdd={(lang, text) => addTranslation(wordId, lang, text)}
        onChange={load}
      />
      {data.word_type === 'verb' && (
        <VerbSection wordId={wordId} details={data.verb_details ?? null} onChange={load} />
      )}
      {data.word_type === 'noun' && (
        <NounSection wordId={wordId} details={data.noun_details ?? null} onChange={load} />
      )}
      {data.word_type === 'adjective' && (
        <AdjSection
          wordId={wordId}
          declensions={data.adjective_declensions ?? []}
          onChange={load}
        />
      )}
      <div className="detail-section">
        <h4 className="detail-section-title">Explanations</h4>
        <ExplanationsList
          entityType="word"
          entityId={wordId}
          explanations={data.explanations}
          onChange={load}
        />
      </div>
      <div className="detail-section">
        <h4 className="detail-section-title">Tags</h4>
        <TagPills entityType="word" entityId={wordId} tags={data.tags} onChange={load} />
      </div>
      <div className="detail-section">
        <h4 className="detail-section-title">Corrections</h4>
        <CorrectionsList wordId={wordId} corrections={data.corrections} onChange={load} />
      </div>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function WordTypeSelector({ word, onChange }: { word: WordDetails; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(word.word_type);

  async function save() {
    if (type !== word.word_type) {
      await updateWord(word.id, { word_type: type });
      onChange();
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="detail-section detail-section-inline">
        <span className="detail-type-label">
          Type: <strong>{word.word_type}</strong>
        </span>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="detail-section detail-section-inline">
      <span className="detail-type-label">Type:</span>
      <Select value={type} onValueChange={(v) => setType(v as WordDetails['word_type'])}>
        <SelectTrigger className="min-w-30">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="verb">verb</SelectItem>
          <SelectItem value="noun">noun</SelectItem>
          <SelectItem value="adjective">adjective</SelectItem>
          <SelectItem value="other">other</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" onClick={save}>
        Save
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setType(word.word_type);
          setEditing(false);
        }}
      >
        Cancel
      </Button>
    </div>
  );
}

const PRONOUNS = [
  { key: 'present_ich', label: 'ich' },
  { key: 'present_du', label: 'du' },
  { key: 'present_er', label: 'er/sie/es' },
  { key: 'present_wir', label: 'wir' },
  { key: 'present_ihr', label: 'ihr' },
  { key: 'present_sie', label: 'sie/Sie' },
] as const;

type ConjugationKey = (typeof PRONOUNS)[number]['key'];

function VerbSection({
  wordId,
  details,
  onChange,
}: {
  wordId: string;
  details: VerbDetails | null;
  onChange: () => void;
}) {
  const reflexiveId = useId();
  const [draft, setDraft] = useState({
    infinitive: details?.infinitive ?? '',
    participle: details?.participle ?? '',
    present_ich: details?.present_ich ?? '',
    present_du: details?.present_du ?? '',
    present_er: details?.present_er ?? '',
    present_wir: details?.present_wir ?? '',
    present_ihr: details?.present_ihr ?? '',
    present_sie: details?.present_sie ?? '',
    case_rule: details?.case_rule ?? '',
    is_reflexive: details?.is_reflexive ?? false,
  });

  function setField(key: string, value: string | boolean) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    await upsertVerbDetails(wordId, {
      ...draft,
      case_rule: (draft.case_rule || null) as VerbDetails['case_rule'],
    });
    onChange();
  }

  return (
    <div className="detail-section">
      <h4 className="detail-section-title">Verb Details</h4>
      <div className="type-fields">
        <LabeledField label="Infinitive">
          <Input
            value={draft.infinitive}
            onChange={(e) => setField('infinitive', e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Participle">
          <Input
            value={draft.participle}
            onChange={(e) => setField('participle', e.target.value)}
          />
        </LabeledField>
        <LabeledField label="Case">
          <Select
            value={draft.case_rule || 'none'}
            onValueChange={(v) => setField('case_rule', v === 'none' ? '' : v)}
          >
            <SelectTrigger className="min-w-35">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="akkusativ">Akkusativ</SelectItem>
              <SelectItem value="dativ">Dativ</SelectItem>
              <SelectItem value="akkusativ+dativ">Akk + Dat</SelectItem>
            </SelectContent>
          </Select>
        </LabeledField>
      </div>
      <div className="verb-reflexive-toggle flex items-center gap-2">
        <Checkbox
          id={reflexiveId}
          checked={draft.is_reflexive}
          onCheckedChange={(checked) => setField('is_reflexive', checked === true)}
        />
        <Label htmlFor={reflexiveId}>Reflexiv (sich)</Label>
      </div>
      <div className="conjugation-section">
        <span className="conjugation-label">Präsens</span>
        <div className="conjugation-grid">
          {PRONOUNS.map(({ key, label }) => (
            <div className="conjugation-row" key={key}>
              <span className="conjugation-pronoun">{label}</span>
              <Input
                className="conjugation-input"
                value={draft[key as ConjugationKey]}
                placeholder="—"
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
      <Button size="sm" onClick={save}>
        Save verb details
      </Button>
    </div>
  );
}

function NounSection({
  wordId,
  details,
  onChange,
}: {
  wordId: string;
  details: NounDetails | null;
  onChange: () => void;
}) {
  const [draft, setDraft] = useState({
    article: details?.article ?? 'der',
    plural: details?.plural ?? '',
  });

  async function save() {
    await upsertNounDetails(wordId, draft);
    onChange();
  }

  return (
    <div className="detail-section">
      <h4 className="detail-section-title">Noun Details</h4>
      <div className="type-fields">
        <LabeledField label="Article">
          <Select
            value={draft.article}
            onValueChange={(v) => setDraft((d) => ({ ...d, article: v as 'der' | 'die' | 'das' }))}
          >
            <SelectTrigger className="min-w-25">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="der">der</SelectItem>
              <SelectItem value="die">die</SelectItem>
              <SelectItem value="das">das</SelectItem>
            </SelectContent>
          </Select>
        </LabeledField>
        <LabeledField label="Plural">
          <Input
            value={draft.plural}
            onChange={(e) => setDraft((d) => ({ ...d, plural: e.target.value }))}
          />
        </LabeledField>
      </div>
      <Button size="sm" onClick={save}>
        Save noun details
      </Button>
    </div>
  );
}

function AdjSection({
  wordId,
  declensions,
  onChange,
}: {
  wordId: string;
  declensions: AdjDeclension[];
  onChange: () => void;
}) {
  const grid: Record<string, Record<string, AdjDeclension | undefined>> = {};
  for (const c of CASES) {
    grid[c] = {};
    for (const g of GENDERS) {
      grid[c][g] = declensions.find((d) => d.case_type === c && d.gender === g);
    }
  }

  async function handleCellChange(caseType: string, gender: string, value: string) {
    const existing = grid[caseType]?.[gender];
    if (existing) {
      await updateAdjDeclension(existing.id, { form: value });
    } else if (value.trim()) {
      await createAdjDeclension(wordId, { case_type: caseType, gender, form: value.trim() });
    }
    onChange();
  }

  return (
    <div className="detail-section">
      <h4 className="detail-section-title">Adjective Declensions</h4>
      <table className="declension-grid">
        <thead>
          <tr>
            <th></th>
            {GENDERS.map((g) => (
              <th key={g}>{g}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CASES.map((c) => (
            <tr key={c}>
              <td className="declension-case">{c}</td>
              {GENDERS.map((g) => (
                <td key={g}>
                  <DeclensionCell
                    value={grid[c][g]?.form ?? ''}
                    onSave={(v) => handleCellChange(c, g, v)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeclensionCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  if (!editing) {
    return (
      <span className="declension-cell" onClick={() => setEditing(true)}>
        {value || <span className="declension-placeholder">—</span>}
      </span>
    );
  }

  return (
    <Input
      className="declension-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onSave(text);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (text !== value) onSave(text);
          setEditing(false);
        }
        if (e.key === 'Escape') {
          setText(value);
          setEditing(false);
        }
      }}
      autoFocus
    />
  );
}
