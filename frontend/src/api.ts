const API_BASE = "/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: { filename: string; size: number }[] | null;
  created_at: string;
}

export interface Translation {
  id: string;
  word_id: string;
  language: "es" | "en";
  translation: string;
  created_at: string;
}

export interface WordItem {
  id: string;
  german: string;
  word_type: "verb" | "noun" | "adjective" | "other";
  source: string | null;
  date: string | null;
  sender: string | null;
  raw_message: string | null;
  created_at: string;
  translations: Translation[];
}

export interface TextItem {
  id: string;
  content: string;
  source: string | null;
  date: string | null;
  sender: string | null;
  created_at: string;
}

// ── Chat ────────────────────────────────────────────

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

// ── Words ───────────────────────────────────────────

export async function fetchWords(
  limit = 200
): Promise<{ words: WordItem[] }> {
  const res = await fetch(`${API_BASE}/words?limit=${limit}`);
  if (!res.ok) throw new Error(`Words fetch failed: ${res.status}`);
  return res.json();
}

export async function updateWord(
  id: string,
  fields: Partial<Pick<WordItem, "german" | "word_type" | "source">>
): Promise<WordItem> {
  const res = await fetch(`${API_BASE}/words/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Word update failed: ${res.status}`);
  return res.json();
}

export async function deleteWord(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/words/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Word delete failed: ${res.status}`);
}

// ── Translations ────────────────────────────────────

export async function updateTranslation(
  id: string,
  fields: Partial<Pick<Translation, "language" | "translation">>
): Promise<Translation> {
  const res = await fetch(`${API_BASE}/translations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Translation update failed: ${res.status}`);
  return res.json();
}

// ── Texts ───────────────────────────────────────────

export async function fetchTexts(
  limit = 200
): Promise<{ texts: TextItem[] }> {
  const res = await fetch(`${API_BASE}/texts?limit=${limit}`);
  if (!res.ok) throw new Error(`Texts fetch failed: ${res.status}`);
  return res.json();
}

export async function updateText(
  id: string,
  fields: Partial<Pick<TextItem, "content" | "source">>
): Promise<TextItem> {
  const res = await fetch(`${API_BASE}/texts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Text update failed: ${res.status}`);
  return res.json();
}

export async function deleteText(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/texts/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Text delete failed: ${res.status}`);
}
