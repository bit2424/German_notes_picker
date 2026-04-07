import { useEffect, useRef, useState } from "react";
import { type ChatMessage as ChatMessageType, fetchHistory, sendMessage } from "./api";
import ChatInput from "./components/ChatInput";
import ChatMessage from "./components/ChatMessage";
import LibraryView from "./components/LibraryView";
import "./App.css";

type View = "chat" | "library";

export default function App() {
  const [activeView, setActiveView] = useState<View>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHistory()
      .then((data) => setMessages(data.messages))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(text: string, files: File[]) {
    const userMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      attachments: files.map((f) => ({ filename: f.name, size: f.size })),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const { reply } = await sendMessage(text, files);
      const assistantMsg: ChatMessageType = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
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
      </aside>

      <div className="main-content">
        {activeView === "chat" ? (
          <>
            <main className="chat-area">
              {messages.length === 0 && !loading && (
                <div className="empty-state">
                  <p>No messages yet. Try sending a German word!</p>
                </div>
              )}
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} />
              ))}
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
            <ChatInput onSend={handleSend} disabled={loading} />
          </>
        ) : (
          <LibraryView />
        )}
      </div>
    </div>
  );
}
