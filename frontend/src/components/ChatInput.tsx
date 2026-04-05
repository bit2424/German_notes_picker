import { useRef, useState } from "react";

interface Props {
  onSend: (text: string, files: File[]) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && files.length === 0) return;
    onSend(text, files);
    setText("");
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      {files.length > 0 && (
        <div className="file-previews">
          {files.map((f, i) => (
            <div key={i} className="file-preview">
              {f.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  className="file-thumb"
                />
              ) : (
                <span className="file-icon">📄</span>
              )}
              <span className="file-name">{f.name}</span>
              <button
                type="button"
                className="file-remove"
                onClick={() => removeFile(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="input-row">
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Attach files"
        >
          +
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.txt"
          onChange={handleFiles}
          hidden
        />
        <input
          type="text"
          className="text-input"
          placeholder="Send a word, sentence, or attach a photo..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
        />
        <button type="submit" className="send-btn" disabled={disabled}>
          {disabled ? "..." : "→"}
        </button>
      </div>
    </form>
  );
}
