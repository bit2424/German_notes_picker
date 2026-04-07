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

export interface Chat {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ── Chats ───────────────────────────────────────────

export async function fetchChats(): Promise<{ chats: Chat[] }> {
  const res = await fetch(`${API_BASE}/chats`);
  if (!res.ok) throw new Error(`Chats fetch failed: ${res.status}`);
  return res.json();
}

export async function createChat(
  name: string,
  description?: string
): Promise<Chat> {
  const res = await fetch(`${API_BASE}/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error(`Chat create failed: ${res.status}`);
  return res.json();
}

export async function updateChat(
  id: string,
  fields: Partial<Pick<Chat, "name" | "description">>
): Promise<Chat> {
  const res = await fetch(`${API_BASE}/chats/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Chat update failed: ${res.status}`);
  return res.json();
}

export async function deleteChat(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/chats/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Chat delete failed: ${res.status}`);
}

// ── Chat messages (scoped to a chat) ────────────────

export async function sendMessage(
  chatId: string,
  text: string,
  files: File[]
): Promise<{ reply: string }> {
  const form = new FormData();
  form.append("message", text);
  for (const f of files) {
    form.append("files", f);
  }

  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
  return res.json();
}

export async function fetchHistory(
  chatId: string,
  limit = 50
): Promise<{ messages: ChatMessage[] }> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages?limit=${limit}`);
  if (!res.ok) throw new Error(`History request failed: ${res.status}`);
  return res.json();
}

// ── Translation suggestions ─────────────────────────

export interface TranslationSuggestion {
  language: "es" | "en";
  text: string;
}

export interface WordSuggestion {
  german: string;
  word_type: "noun" | "verb" | "adjective" | "other";
  article: string | null;
  translations: TranslationSuggestion[];
}

export interface SuggestionResponse {
  suggestions: WordSuggestion[];
}

export interface ConfirmedWordTranslation {
  language: "es" | "en";
  translation: string;
}

export interface ConfirmedWord {
  german: string;
  word_type: string;
  source: string;
  translations: ConfirmedWordTranslation[];
}

export async function suggestTranslations(
  words: string[]
): Promise<SuggestionResponse> {
  const res = await fetch(`${API_BASE}/suggest-translations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words }),
  });
  if (!res.ok) throw new Error(`Suggest failed: ${res.status}`);
  return res.json();
}

export async function batchStoreWords(
  words: ConfirmedWord[]
): Promise<{ stored: number; word_ids: string[] }> {
  const res = await fetch(`${API_BASE}/words/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words }),
  });
  if (!res.ok) throw new Error(`Batch store failed: ${res.status}`);
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
