import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(t.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
              <Button size="sm" onClick={() => saveEdit(t.id)}>
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <span className="translation-text">{t.translation}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingId(t.id);
                  setEditText(t.translation);
                }}
              >
                Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleDelete(t.id)}>
                Delete
              </Button>
            </>
          )}
        </div>
      ))}
      <div className="translation-add-row">
        <Select value={newLang} onValueChange={(v) => setNewLang(v as 'es' | 'en')}>
          <SelectTrigger className="min-w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="es">ES</SelectItem>
            <SelectItem value="en">EN</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={newText}
          placeholder="New translation…"
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        {newText.trim() && (
          <Button size="sm" onClick={handleAdd}>
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
