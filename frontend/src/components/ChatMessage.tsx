import ReactMarkdown from 'react-markdown';
import { Badge } from '@/components/ui/badge';
import type { ChatMessage as ChatMessageType } from '../api';

interface Props {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-label">{isUser ? 'You' : 'Agent'}</div>
      <div className="message-bubble">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div className="md">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="attachments">
            {message.attachments.map((a, i) => (
              <Badge key={i} variant="outline">
                {a.filename}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
