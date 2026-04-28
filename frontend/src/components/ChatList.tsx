import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import type { Chat } from '../api';

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
  const [editName, setEditName] = useState('');

  function startRename(chat: Chat) {
    setEditingId(chat.id);
    setEditName(chat.name);
  }

  function commitRename() {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') {
      setEditingId(null);
      setEditName('');
    }
  }

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <span className="chat-list-label">Chats</span>
        <IconButton size="small" onClick={onNew} title="New chat" aria-label="New chat">
          +
        </IconButton>
      </div>
      <div className="chat-list-items">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-list-item ${chat.id === activeChatId ? 'active' : ''}`}
            onClick={() => onSelect(chat.id)}
          >
            {editingId === chat.id ? (
              <TextField
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commitRename}
                autoFocus
                size="small"
                variant="outlined"
                fullWidth
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="chat-list-name">{chat.name}</span>
                <span className="chat-list-actions">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(chat);
                    }}
                    title="Rename"
                    aria-label="Rename chat"
                  >
                    ✎
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(chat.id);
                    }}
                    title="Delete"
                    aria-label="Delete chat"
                  >
                    ×
                  </IconButton>
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
