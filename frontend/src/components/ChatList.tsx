import { useState } from "react";
import type { Chat } from "../api";

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function ChatList({
  chats,
  activeChatId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function startRename(chat: Chat) {
    setEditingId(chat.id);
    setEditName(chat.name);
  }

  function commitRename() {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") {
      setEditingId(null);
      setEditName("");
    }
  }

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <span className="chat-list-label">Chats</span>
        <button className="chat-list-new" onClick={onNew} title="New chat">
          +
        </button>
      </div>
      <div className="chat-list-items">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-list-item ${chat.id === activeChatId ? "active" : ""}`}
            onClick={() => onSelect(chat.id)}
          >
            {editingId === chat.id ? (
              <input
                className="chat-list-rename"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitRename}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="chat-list-name">{chat.name}</span>
                <span className="chat-list-actions">
                  <button
                    className="chat-list-action"
                    onClick={(e) => { e.stopPropagation(); startRename(chat); }}
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button
                    className="chat-list-action chat-list-delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(chat.id); }}
                    title="Delete"
                  >
                    ×
                  </button>
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
