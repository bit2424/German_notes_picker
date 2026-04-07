const API_BASE = "/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: { filename: string; size: number }[] | null;
  created_at: string;
}

export interface VocabularyItem {
  id: string;
  german: string;
  translation: string;
  translation_lang: string;
  source: string | null;
  date: string | null;
  sender: string | null;
  raw_message: string | null;
  created_at: string;
}

export interface SentenceItem {
  id: string;
  sentence: string;
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

// ── Vocabulary ──────────────────────────────────────

export async function fetchVocabulary(
  limit = 200
): Promise<{ vocabulary: VocabularyItem[] }> {
  const res = await fetch(`${API_BASE}/vocabulary?limit=${limit}`);
  if (!res.ok) throw new Error(`Vocabulary fetch failed: ${res.status}`);
  return res.json();
}

export async function updateVocabulary(
  id: string,
  fields: Partial<Pick<VocabularyItem, "german" | "translation" | "translation_lang" | "source">>
): Promise<VocabularyItem> {
  const res = await fetch(`${API_BASE}/vocabulary/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Vocabulary update failed: ${res.status}`);
  return res.json();
}

export async function deleteVocabulary(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/vocabulary/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Vocabulary delete failed: ${res.status}`);
}

// ── Sentences ───────────────────────────────────────

export async function fetchSentences(
  limit = 200
): Promise<{ sentences: SentenceItem[] }> {
  const res = await fetch(`${API_BASE}/sentences?limit=${limit}`);
  if (!res.ok) throw new Error(`Sentences fetch failed: ${res.status}`);
  return res.json();
}

export async function updateSentence(
  id: string,
  fields: Partial<Pick<SentenceItem, "sentence" | "source">>
): Promise<SentenceItem> {
  const res = await fetch(`${API_BASE}/sentences/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Sentence update failed: ${res.status}`);
  return res.json();
}

export async function deleteSentence(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sentences/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Sentence delete failed: ${res.status}`);
}
