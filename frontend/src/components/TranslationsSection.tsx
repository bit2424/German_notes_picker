import { useState } from "react";
import {
  type Translation,
  updateTranslation,
  deleteTranslation,
} from "../api";

interface Props {
  translations: Translation[];
  onAdd: (language: "es" | "en", text: string) => Promise<unknown>;
  onChange: () => void;
}

export default function TranslationsSection({ translations, onAdd, onChange }: Props) {
  const [newLang, setNewLang] = useState<"es" | "en">("es");
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  async function handleAdd() {
    if (!newText.trim()) return;
    await onAdd(newLang, newText.trim());
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
