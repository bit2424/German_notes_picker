import { useEffect, useRef, useState } from "react";
import {
  type Chat,
  type ChatMessage as ChatMessageType,
  type SuggestionResponse,
  type ConfirmedWord,
  createChat,
  fetchChats,
  fetchHistory,
  sendMessage,
  suggestTranslations,
  batchStoreWords,
  updateChat,
  deleteChat,
} from "./api";
import ChatInput from "./components/ChatInput";
import ChatMessage from "./components/ChatMessage";
import ChatList from "./components/ChatList";
import TranslationSuggestionCard from "./components/TranslationSuggestionCard";
import LibraryView from "./components/LibraryView";
import "./App.css";

type View = "chat" | "library";

function detectWordList(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let segments: string[];

  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    segments = lines;
  } else {
    segments = trimmed.split(".").map((s) => s.trim()).filter(Boolean);
    if (segments.length < 2) return null;
  }

  const allShort = segments.every((s) => s.split(/\s+/).length <= 3);
  if (!allShort) return null;

  return segments;
}

export default function App() {
  const [activeView, setActiveView] = useState<View>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] =
    useState<SuggestionResponse | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChats().then((data) => {
      setChats(data.chats);
      if (data.chats.length > 0 && !activeChatId) {
        setActiveChatId(data.chats[0].id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    fetchHistory(activeChatId)
      .then((data) => setMessages(data.messages))
      .catch(() => {});
  }, [activeChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleNewChat() {
    try {
      const chat = await createChat("New Chat");
      setChats((prev) => [chat, ...prev]);
      setActiveChatId(chat.id);
      setActiveView("chat");
    } catch {
      /* swallow */
    }
  }

  async function handleRenameChat(id: string, name: string) {
    try {
      const updated = await updateChat(id, { name });
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    } catch {
      /* swallow */
    }
  }

  async function handleDeleteChat(id: string) {
    if (!confirm("Delete this chat?")) return;
    try {
      await deleteChat(id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeChatId === id) {
        const remaining = chats.filter((c) => c.id !== id);
        setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch {
      /* swallow */
    }
  }

  function handleSelectChat(id: string) {
    setActiveChatId(id);
    setActiveView("chat");
  }

  async function handleSend(text: string, files: File[]) {
    if (!activeChatId) return;

    const wordList = files.length === 0 ? detectWordList(text) : null;

    const userMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      attachments: files.map((f) => ({ filename: f.name, size: f.size })),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    if (wordList) {
      try {
        const response = await suggestTranslations(wordList);
        setPendingSuggestions(response);
      } catch {
        const errorMsg: ChatMessageType = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Failed to get translation suggestions. Please try again.",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { reply } = await sendMessage(activeChatId, text, files);
      const assistantMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Something went wrong. Please try again.",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSuggestionConfirm(words: ConfirmedWord[]) {
    setLoading(true);
    try {
      const result = await batchStoreWords(words);
      setPendingSuggestions(null);
      const summary = words
        .map((w) => `${w.german} (${w.translations.map((t) => t.translation).join(", ")})`)
        .join("\n");
      const confirmMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Stored ${result.stored} word${result.stored === 1 ? "" : "s"}:\n${summary}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } catch {
      const errorMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Failed to store words. Please try again.",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestionCancel() {
    setPendingSuggestions(null);
    const cancelMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Suggestions dismissed.",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, cancelMsg]);
  }

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
        <div className="sidebar-header">
          {sidebarOpen && <h1 className="sidebar-title">German Notes</h1>}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? "\u2039" : "\u203A"}
          </button>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`sidebar-link ${activeView === "chat" ? "active" : ""}`}
            onClick={() => setActiveView("chat")}
            title="Chat"
          >
            {sidebarOpen ? "Chat" : "C"}
          </button>
          <button
            className={`sidebar-link ${activeView === "library" ? "active" : ""}`}
            onClick={() => setActiveView("library")}
            title="Library"
          >
            {sidebarOpen ? "Library" : "L"}
          </button>
        </nav>

        {sidebarOpen && activeView === "chat" && (
          <ChatList
            chats={chats}
            activeChatId={activeChatId}
            onSelect={handleSelectChat}
            onNew={handleNewChat}
            onRename={handleRenameChat}
            onDelete={handleDeleteChat}
          />
        )}
      </aside>

      <div className="main-content">
        {activeView === "chat" ? (
          <>
            {activeChat && (
              <div className="chat-header">
                <h2 className="chat-header-title">{activeChat.name}</h2>
              </div>
            )}
            <main className="chat-area">
              {!activeChatId && (
                <div className="empty-state">
                  <p>Create a new chat to get started.</p>
                  <button className="new-chat-btn-large" onClick={handleNewChat}>
                    New Chat
                  </button>
                </div>
              )}
              {activeChatId && messages.length === 0 && !loading && (
                <div className="empty-state">
                  <p>No messages yet. Try sending a German word!</p>
                </div>
              )}
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} />
              ))}
              {pendingSuggestions && (
                <TranslationSuggestionCard
                  suggestions={pendingSuggestions}
                  onConfirm={handleSuggestionConfirm}
                  onCancel={handleSuggestionCancel}
                  disabled={loading}
                />
              )}
              {loading && (
                <div className="chat-message assistant">
                  <div className="message-label">Agent</div>
                  <div className="message-bubble typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </main>
            {activeChatId && <ChatInput onSend={handleSend} disabled={loading} />}
          </>
        ) : (
          <LibraryView />
        )}
      </div>
    </div>
  );
}
