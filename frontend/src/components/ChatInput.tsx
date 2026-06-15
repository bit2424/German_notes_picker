import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';

interface Props {
  onSend: (text: string, files: File[], enrich: boolean) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [enrich, setEnrich] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && files.length === 0) return;
    onSend(text, files, enrich);
    setText('');
    setFiles([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      {files.length > 0 && (
        <div className="file-previews">
          {files.map((f, i) => (
            <div key={i} className="file-preview">
              {f.type.startsWith('image/') ? (
                <img src={URL.createObjectURL(f)} alt={f.name} className="file-thumb" />
              ) : (
                <span className="file-icon">📄</span>
              )}
              <span className="file-name">{f.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="input-row">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Attach files"
          aria-label="Attach files"
        >
          +
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.txt"
          onChange={handleFiles}
          hidden
        />
        <Toggle
          pressed={enrich}
          onPressedChange={setEnrich}
          disabled={disabled}
          size="sm"
          className="rounded-full px-3"
          title={
            enrich
              ? 'Full Enrichment: grammar details, tags, explanations (slower)'
              : 'Quick Save: basic word + translation (fast)'
          }
        >
          {enrich ? 'Enrich' : 'Quick'}
        </Toggle>
        <Textarea
          className="text-input max-h-36 min-h-9 resize-none"
          placeholder="Send a word, sentence, or attach a photo..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />
        <Button type="submit" variant="ghost" size="icon-sm" disabled={disabled} aria-label="Send">
          {disabled ? '...' : '→'}
        </Button>
      </div>
    </form>
  );
}
