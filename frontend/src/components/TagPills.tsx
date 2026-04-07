import { useEffect, useState } from "react";
import {
  type Tag,
  fetchTags,
  createTag,
  addWordTag,
  removeWordTag,
  addTextTag,
  removeTextTag,
  addExplanationTag,
  removeExplanationTag,
} from "../api";

interface Props {
  entityType: "word" | "text" | "explanation";
  entityId: string;
  tags: Tag[];
  onChange: () => void;
}

const addFns = { word: addWordTag, text: addTextTag, explanation: addExplanationTag };
const removeFns = { word: removeWordTag, text: removeTextTag, explanation: removeExplanationTag };

export default function TagPills({ entityType, entityId, tags, onChange }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (showInput) fetchTags().then((d) => setAllTags(d.tags));
  }, [showInput]);

  const assignedIds = new Set(tags.map((t) => t.id));
  const suggestions = allTags.filter(
    (t) => !assignedIds.has(t.id) && t.name.toLowerCase().includes(query.toLowerCase())
  );
  const exactMatch = allTags.some((t) => t.name.toLowerCase() === query.toLowerCase());

  async function handleAdd(tagId: string) {
    await addFns[entityType](entityId, tagId);
    setQuery("");
    setShowInput(false);
    onChange();
  }

  async function handleRemove(tagId: string) {
    await removeFns[entityType](entityId, tagId);
    onChange();
  }

  async function handleCreateAndAdd() {
    if (!query.trim()) return;
    const tag = await createTag(query.trim());
    await addFns[entityType](entityId, tag.id);
    setQuery("");
    setShowInput(false);
    onChange();
  }

  return (
    <div className="tag-pills-row">
      {tags.map((t) => (
        <span key={t.id} className="tag-pill">
          {t.name}
          <button className="tag-pill-remove" onClick={() => handleRemove(t.id)}>
            ×
          </button>
        </span>
      ))}
      {showInput ? (
        <span className="tag-input-wrapper">
          <input
            className="tag-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tag name…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowInput(false);
                setQuery("");
              }
              if (e.key === "Enter" && query.trim()) {
                if (suggestions.length > 0) handleAdd(suggestions[0].id);
                else handleCreateAndAdd();
              }
            }}
          />
          {query && (
            <div className="tag-dropdown">
              {suggestions.slice(0, 8).map((t) => (
                <button key={t.id} className="tag-dropdown-item" onClick={() => handleAdd(t.id)}>
                  {t.name}
                </button>
              ))}
              {!exactMatch && query.trim() && (
                <button className="tag-dropdown-item tag-dropdown-create" onClick={handleCreateAndAdd}>
                  Create "{query.trim()}"
                </button>
              )}
            </div>
          )}
        </span>
      ) : (
        <button className="tag-pill tag-pill-add" onClick={() => setShowInput(true)}>
          + tag
        </button>
      )}
    </div>
  );
}
