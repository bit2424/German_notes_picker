import { useState } from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { type Translation, updateTranslation, deleteTranslation } from '../api';

interface Props {
  translations: Translation[];
  onAdd: (language: 'es' | 'en', text: string) => Promise<unknown>;
  onChange: () => void;
}

export default function TranslationsSection({ translations, onAdd, onChange }: Props) {
  const [newLang, setNewLang] = useState<'es' | 'en'>('es');
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  async function handleAdd() {
    if (!newText.trim()) return;
    await onAdd(newLang, newText.trim());
    setNewText('');
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
              <TextField
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(t.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
                size="small"
                variant="outlined"
                fullWidth
              />
              <Button size="small" variant="contained" onClick={() => saveEdit(t.id)}>
                Save
              </Button>
              <Button size="small" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <span className="translation-text">{t.translation}</span>
              <Button
                size="small"
                onClick={() => {
                  setEditingId(t.id);
                  setEditText(t.translation);
                }}
              >
                Edit
              </Button>
              <Button size="small" color="error" onClick={() => handleDelete(t.id)}>
                Delete
              </Button>
            </>
          )}
        </div>
      ))}
      <div className="translation-add-row">
        <TextField
          select
          value={newLang}
          onChange={(e) => setNewLang(e.target.value as 'es' | 'en')}
          size="small"
          variant="outlined"
          sx={{ minWidth: 80 }}
        >
          <MenuItem value="es">ES</MenuItem>
          <MenuItem value="en">EN</MenuItem>
        </TextField>
        <TextField
          value={newText}
          placeholder="New translation…"
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          size="small"
          variant="outlined"
          fullWidth
        />
        {newText.trim() && (
          <Button size="small" variant="contained" onClick={handleAdd}>
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
