import { useEffect, useRef, useState } from "react";
import { type ChatMessage as ChatMessageType, fetchHistory, sendMessage } from "./api";
import ChatInput from "./components/ChatInput";
import ChatMessage from "./components/ChatMessage";
import "./App.css";

export default function App() {
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
      <header className="app-header">
        <h1>German Notes</h1>
        <p>Send vocab, photos, or WhatsApp exports</p>
      </header>
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
    </div>
  );
}
