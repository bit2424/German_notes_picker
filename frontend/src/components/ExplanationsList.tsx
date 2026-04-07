import { useState } from "react";
import {
  type Explanation,
  createExplanation,
  updateExplanation,
  deleteExplanation,
} from "../api";
import TagPills from "./TagPills";

interface Props {
  entityType: string;
  entityId: string;
  explanations: Explanation[];
  onChange: () => void;
}

export default function ExplanationsList({ entityType, entityId, explanations, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newContent, setNewContent] = useState("");

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
    setNewContent("");
    onChange();
  }

  return (
    <div className="explanations-list">
      {explanations.map((e) => (
        <div key={e.id} className="explanation-card">
          {editingId === e.id ? (
            <div className="explanation-edit-row">
              <textarea
                className="explanation-textarea"
                value={editContent}
                onChange={(ev) => setEditContent(ev.target.value)}
                autoFocus
              />
              <div className="explanation-edit-actions">
                <button className="row-btn save-btn" onClick={() => saveEdit(e.id)}>Save</button>
                <button className="row-btn cancel-btn" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="explanation-content-row">
              <p className="explanation-text">{e.content}</p>
              <div className="explanation-actions">
                <button className="row-btn edit-btn" onClick={() => startEdit(e)}>Edit</button>
                <button className="row-btn delete-btn" onClick={() => handleDelete(e.id)}>Delete</button>
              </div>
            </div>
          )}
          <TagPills entityType="explanation" entityId={e.id} tags={e.tags} onChange={onChange} />
        </div>
      ))}
      <div className="add-row">
        <textarea
          className="explanation-textarea"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add an explanation…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        {newContent.trim() && (
          <button className="row-btn save-btn" onClick={handleAdd}>Add</button>
        )}
      </div>
    </div>
  );
}
