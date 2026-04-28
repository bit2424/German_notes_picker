import { useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { type Explanation, createExplanation, updateExplanation, deleteExplanation } from '../api';
import TagPills from './TagPills';

interface Props {
  entityType: string;
  entityId: string;
  explanations: Explanation[];
  onChange: () => void;
}

export default function ExplanationsList({ entityType, entityId, explanations, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newContent, setNewContent] = useState('');

  function startEdit(e: Explanation) {
    setEditingId(e.id);
    setEditContent(e.content);
  }

  async function saveEdit(id: string) {
    if (!editContent.trim()) return;
    await updateExplanation(id, editContent.trim());
    setEditingId(null);
    onChange();
  }

  async function handleDelete(id: string) {
    await deleteExplanation(id);
    onChange();
  }

  async function handleAdd() {
    if (!newContent.trim()) return;
    await createExplanation(entityType, entityId, newContent.trim());
    setNewContent('');
    onChange();
  }

  return (
    <div className="explanations-list">
      {explanations.map((e) => (
        <div key={e.id} className="explanation-card">
          {editingId === e.id ? (
            <div className="explanation-edit-row">
              <TextField
                value={editContent}
                onChange={(ev) => setEditContent(ev.target.value)}
                autoFocus
                multiline
                minRows={2}
                fullWidth
                size="small"
                variant="outlined"
              />
              <div className="explanation-edit-actions">
                <Button size="small" variant="contained" onClick={() => saveEdit(e.id)}>
                  Save
                </Button>
                <Button size="small" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="explanation-content-row">
              <p className="explanation-text">{e.content}</p>
              <div className="explanation-actions">
                <Button size="small" onClick={() => startEdit(e)}>
                  Edit
                </Button>
                <Button size="small" color="error" onClick={() => handleDelete(e.id)}>
                  Delete
                </Button>
              </div>
            </div>
          )}
          <TagPills entityType="explanation" entityId={e.id} tags={e.tags} onChange={onChange} />
        </div>
      ))}
      <div className="add-row">
        <TextField
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add an explanation…"
          multiline
          minRows={2}
          fullWidth
          size="small"
          variant="outlined"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        {newContent.trim() && (
          <Button size="small" variant="contained" onClick={handleAdd}>
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
