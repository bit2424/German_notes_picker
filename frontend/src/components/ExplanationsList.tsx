import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
              <Textarea
                value={editContent}
                onChange={(ev) => setEditContent(ev.target.value)}
                autoFocus
                rows={2}
              />
              <div className="explanation-edit-actions">
                <Button size="sm" onClick={() => saveEdit(e.id)}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="explanation-content-row">
              <p className="explanation-text">{e.content}</p>
              <div className="explanation-actions">
                <Button variant="ghost" size="sm" onClick={() => startEdit(e)}>
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(e.id)}>
                  Delete
                </Button>
              </div>
            </div>
          )}
          <TagPills entityType="explanation" entityId={e.id} tags={e.tags} onChange={onChange} />
        </div>
      ))}
      <div className="add-row">
        <Textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add an explanation…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        {newContent.trim() && (
          <Button size="sm" onClick={handleAdd}>
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
