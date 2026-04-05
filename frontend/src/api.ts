const API_BASE = "/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: { filename: string; size: number }[] | null;
  created_at: string;
}

export async function sendMessage(
  text: string,
  files: File[]
): Promise<{ reply: string }> {
  const form = new FormData();
  form.append("message", text);
  for (const f of files) {
    form.append("files", f);
  }

  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
  return res.json();
}

export async function fetchHistory(
  limit = 50
): Promise<{ messages: ChatMessage[] }> {
  const res = await fetch(`${API_BASE}/chat/history?limit=${limit}`);
  if (!res.ok) throw new Error(`History request failed: ${res.status}`);
  return res.json();
}
