import { useEffect, useState, useCallback } from "react";
import {
  type WordDetails,
  type Translation,
  type VerbDetails,
  type NounDetails,
  type AdjDeclension,
  fetchWordDetail,
  addTranslation,
  updateTranslation,
  deleteTranslation,
  upsertVerbDetails,
  upsertNounDetails,
  createAdjDeclension,
  updateAdjDeclension,
  updateWord,
} from "../api";
import TagPills from "./TagPills";
import ExplanationsList from "./ExplanationsList";
import CorrectionsList from "./CorrectionsList";

const CASES = ["nominativ", "akkusativ", "dativ", "genitiv"] as const;
const GENDERS = ["maskulin", "feminin", "neutrum", "plural"] as const;

interface Props {
  wordId: string;
}

export default function WordDetail({ wordId }: Props) {
  const [data, setData] = useState<WordDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchWordDetail(wordId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wordId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="detail-loading">Loading…</div>;
  if (!data) return <div className="detail-loading">Failed to load</div>;

  return (
    <div className="detail-panel">
      <WordTypeSelector word={data} onChange={load} />
      <TranslationsSection wordId={wordId} translations={data.translations} onChange={load} />
      {data.word_type === "verb" && (
        <VerbSection wordId={wordId} details={data.verb_details ?? null} onChange={load} />
      )}
      {data.word_type === "noun" && (
        <NounSection wordId={wordId} details={data.noun_details ?? null} onChange={load} />
      )}
      {data.word_type === "adjective" && (
        <AdjSection wordId={wordId} declensions={data.adjective_declensions ?? []} onChange={load} />
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
        <span className="detail-type-label">Type: <strong>{word.word_type}</strong></span>
        <button className="row-btn edit-btn" onClick={() => setEditing(true)}>Change</button>
      </div>
    );
  }

  return (
    <div className="detail-section detail-section-inline">
      <span className="detail-type-label">Type:</span>
      <select className="cell-input cell-input-sm-select" value={type} onChange={(e) => setType(e.target.value as WordDetails["word_type"])}>
        <option value="verb">verb</option>
        <option value="noun">noun</option>
        <option value="adjective">adjective</option>
        <option value="other">other</option>
      </select>
      <button className="row-btn save-btn" onClick={save}>Save</button>
      <button className="row-btn cancel-btn" onClick={() => { setType(word.word_type); setEditing(false); }}>Cancel</button>
    </div>
  );
}

function TranslationsSection({ wordId, translations, onChange }: {
  wordId: string;
  translations: Translation[];
  onChange: () => void;
}) {
  const [newLang, setNewLang] = useState<"es" | "en">("es");
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function handleAdd() {
    if (!newText.trim()) return;
    await addTranslation(wordId, newLang, newText.trim());
    setNewText("");
    onChange();
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    await updateTranslation(id, { translation: editText.trim() });
    setEditingId(null);
    onChange();
  }

  async function handleDelete(id: string) {
    await deleteTranslation(id);
    onChange();
  }

  return (
    <div className="detail-section">
      <h4 className="detail-section-title">Translations</h4>
      {translations.map((t) => (
        <div key={t.id} className="translation-row">
          <span className="translation-lang">{t.language.toUpperCase()}</span>
          {editingId === t.id ? (
            <>
              <input className="cell-input" value={editText} onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(t.id); if (e.key === "Escape") setEditingId(null); }}
                autoFocus />
              <button className="row-btn save-btn" onClick={() => saveEdit(t.id)}>Save</button>
              <button className="row-btn cancel-btn" onClick={() => setEditingId(null)}>Cancel</button>
            </>
          ) : (
            <>
              <span className="translation-text">{t.translation}</span>
              <button className="row-btn edit-btn" onClick={() => { setEditingId(t.id); setEditText(t.translation); }}>Edit</button>
              <button className="row-btn delete-btn" onClick={() => handleDelete(t.id)}>Delete</button>
            </>
          )}
        </div>
      ))}
      <div className="translation-add-row">
        <select className="cell-input cell-input-sm-select" value={newLang} onChange={(e) => setNewLang(e.target.value as "es" | "en")}>
          <option value="es">ES</option>
          <option value="en">EN</option>
        </select>
        <input className="cell-input" value={newText} placeholder="New translation…" onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} />
        {newText.trim() && <button className="row-btn save-btn" onClick={handleAdd}>Add</button>}
      </div>
    </div>
  );
}

const PRONOUNS = [
  { key: "present_ich", label: "ich" },
  { key: "present_du", label: "du" },
  { key: "present_er", label: "er/sie/es" },
  { key: "present_wir", label: "wir" },
  { key: "present_ihr", label: "ihr" },
  { key: "present_sie", label: "sie/Sie" },
] as const;

type ConjugationKey = typeof PRONOUNS[number]["key"];

function VerbSection({ wordId, details, onChange }: {
  wordId: string;
  details: VerbDetails | null;
  onChange: () => void;
}) {
  const [draft, setDraft] = useState({
    infinitive: details?.infinitive ?? "",
    participle: details?.participle ?? "",
    present_ich: details?.present_ich ?? "",
    present_du: details?.present_du ?? "",
    present_er: details?.present_er ?? "",
    present_wir: details?.present_wir ?? "",
    present_ihr: details?.present_ihr ?? "",
    present_sie: details?.present_sie ?? "",
  });

  function setField(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    await upsertVerbDetails(wordId, draft);
    onChange();
  }

  return (
    <div className="detail-section">
      <h4 className="detail-section-title">Verb Details</h4>
      <div className="type-fields">
        <label>Infinitive
          <input className="cell-input" value={draft.infinitive} onChange={(e) => setField("infinitive", e.target.value)} />
        </label>
        <label>Participle
          <input className="cell-input" value={draft.participle} onChange={(e) => setField("participle", e.target.value)} />
        </label>
      </div>
      <div className="conjugation-section">
        <span className="conjugation-label">Präsens</span>
        <div className="conjugation-grid">
          {PRONOUNS.map(({ key, label }) => (
            <div className="conjugation-row" key={key}>
              <span className="conjugation-pronoun">{label}</span>
              <input
                className="cell-input conjugation-input"
                value={draft[key as ConjugationKey]}
                placeholder="—"
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="detail-save-row">
        <button className="row-btn save-btn" onClick={save}>Save verb details</button>
      </div>
    </div>
  );
}

function NounSection({ wordId, details, onChange }: {
  wordId: string;
  details: NounDetails | null;
  onChange: () => void;
}) {
  const [draft, setDraft] = useState({
    article: details?.article ?? "der",
    plural: details?.plural ?? "",
  });

  async function save() {
    await upsertNounDetails(wordId, draft);
    onChange();
  }

  return (
    <div className="detail-section">
      <h4 className="detail-section-title">Noun Details</h4>
      <div className="type-fields">
        <label>Article
          <select className="cell-input cell-input-sm-select" value={draft.article} onChange={(e) => setDraft((d) => ({ ...d, article: e.target.value }))}>
            <option value="der">der</option>
            <option value="die">die</option>
            <option value="das">das</option>
          </select>
        </label>
        <label>Plural
          <input className="cell-input" value={draft.plural} onChange={(e) => setDraft((d) => ({ ...d, plural: e.target.value }))} />
        </label>
      </div>
      <div className="detail-save-row">
        <button className="row-btn save-btn" onClick={save}>Save noun details</button>
      </div>
    </div>
  );
}

function AdjSection({ wordId, declensions, onChange }: {
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
            {GENDERS.map((g) => <th key={g}>{g}</th>)}
          </tr>
        </thead>
        <tbody>
          {CASES.map((c) => (
            <tr key={c}>
              <td className="declension-case">{c}</td>
              {GENDERS.map((g) => (
                <td key={g}>
                  <DeclensionCell value={grid[c][g]?.form ?? ""} onSave={(v) => handleCellChange(c, g, v)} />
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

  useEffect(() => { setText(value); }, [value]);

  if (!editing) {
    return (
      <span className="declension-cell" onClick={() => setEditing(true)}>
        {value || <span className="declension-placeholder">—</span>}
      </span>
    );
  }

  return (
    <input
      className="cell-input declension-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onSave(text); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === "Enter") { if (text !== value) onSave(text); setEditing(false); } if (e.key === "Escape") { setText(value); setEditing(false); } }}
      autoFocus
    />
  );
}
