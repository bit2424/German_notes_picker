import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNew}
          title="New chat"
          aria-label="New chat"
        >
          +
        </Button>
      </div>
      <div className="chat-list-items">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-list-item ${chat.id === activeChatId ? 'active' : ''}`}
            onClick={() => onSelect(chat.id)}
          >
            {editingId === chat.id ? (
              <Input
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
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(chat);
                    }}
                    title="Rename"
                    aria-label="Rename chat"
                  >
                    ✎
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(chat.id);
                    }}
                    title="Delete"
                    aria-label="Delete chat"
                  >
                    ×
                  </Button>
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
