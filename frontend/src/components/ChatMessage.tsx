import type { ChatMessage as ChatMessageType } from "../api";

interface Props {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`chat-message ${isUser ? "user" : "assistant"}`}>
      <div className="message-label">{isUser ? "You" : "Agent"}</div>
      <div className="message-bubble">
        <p>{message.content}</p>
        {message.attachments && message.attachments.length > 0 && (
          <div className="attachments">
            {message.attachments.map((a, i) => (
              <span key={i} className="attachment-chip">
                {a.filename}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
