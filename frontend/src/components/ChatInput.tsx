import { useRef, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
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
              <IconButton
                type="button"
                size="small"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
              >
                ×
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <div className="input-row">
        <IconButton
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Attach files"
          aria-label="Attach files"
          size="small"
        >
          +
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.txt"
          onChange={handleFiles}
          hidden
        />
        <ToggleButton
          value="enrich"
          selected={enrich}
          onChange={() => setEnrich((v) => !v)}
          disabled={disabled}
          size="small"
          title={
            enrich
              ? 'Full Enrichment: grammar details, tags, explanations (slower)'
              : 'Quick Save: basic word + translation (fast)'
          }
          sx={{ textTransform: 'none', borderRadius: 999, px: 1.5 }}
        >
          {enrich ? 'Enrich' : 'Quick'}
        </ToggleButton>
        <TextField
          className="text-input"
          placeholder="Send a word, sentence, or attach a photo..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          multiline
          maxRows={6}
          fullWidth
          size="small"
          variant="outlined"
        />
        <IconButton
          type="submit"
          color="primary"
          disabled={disabled}
          aria-label="Send"
          size="small"
        >
          {disabled ? '...' : '→'}
        </IconButton>
      </div>
    </form>
  );
}
