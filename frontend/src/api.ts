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

export async function createText(content: string, source = "manual"): Promise<TextItem> {
  const res = await fetch(`${API_BASE}/texts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, source }),
  });
  if (!res.ok) throw new Error(`Text create failed: ${res.status}`);
  return res.json();
}

// ── Word & Text detail (full nested) ────────────────

export interface VerbDetails {
  id: string;
  word_id: string;
  infinitive: string | null;
  participle: string | null;
  present_ich: string | null;
  present_du: string | null;
  present_er: string | null;
  present_wir: string | null;
  present_ihr: string | null;
  present_sie: string | null;
  case_rule: "akkusativ" | "dativ" | "akkusativ+dativ" | null;
  is_reflexive: boolean;
}

export interface NounDetails {
  id: string;
  word_id: string;
  article: "der" | "die" | "das" | null;
  plural: string | null;
}

export interface AdjDeclension {
  id: string;
  word_id: string;
  case_type: "nominativ" | "akkusativ" | "dativ" | "genitiv";
  gender: "maskulin" | "feminin" | "neutrum" | "plural";
  form: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Explanation {
  id: string;
  entity_type: string;
  entity_id: string;
  content: string;
  tags: Tag[];
  created_at: string;
}

export interface Correction {
  id: string;
  word_id: string | null;
  text_id: string | null;
  original_text: string;
  corrected_text: string;
  note: string | null;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

export interface TextWordLink {
  id: string;
  text_id: string;
  word_id: string;
  position: number | null;
  words: { id: string; german: string } | null;
}

export interface WordDetails extends WordItem {
  verb_details?: VerbDetails | null;
  noun_details?: NounDetails | null;
  adjective_declensions?: AdjDeclension[];
  explanations: Explanation[];
  tags: Tag[];
  corrections: Correction[];
}

export interface TextDetails extends TextItem {
  explanations: Explanation[];
  tags: Tag[];
  corrections: Correction[];
  text_words: TextWordLink[];
}

export async function fetchWordDetail(id: string): Promise<WordDetails> {
  const res = await fetch(`${API_BASE}/words/${id}`);
  if (!res.ok) throw new Error(`Word detail failed: ${res.status}`);
  return res.json();
}

export async function createWord(german: string, wordType = "other", source = "manual"): Promise<WordItem> {
  const res = await fetch(`${API_BASE}/words`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ german, word_type: wordType, source }),
  });
  if (!res.ok) throw new Error(`Word create failed: ${res.status}`);
  return res.json();
}

export async function fetchTextDetail(id: string): Promise<TextDetails> {
  const res = await fetch(`${API_BASE}/texts/${id}`);
  if (!res.ok) throw new Error(`Text detail failed: ${res.status}`);
  return res.json();
}

// ── Verb details ────────────────────────────────────

export async function upsertVerbDetails(
  wordId: string,
  fields: Partial<Pick<VerbDetails, "infinitive" | "participle" | "present_ich" | "present_du" | "present_er" | "present_wir" | "present_ihr" | "present_sie" | "case_rule" | "is_reflexive">>
): Promise<VerbDetails> {
  const res = await fetch(`${API_BASE}/words/${wordId}/verb-details`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Verb details upsert failed: ${res.status}`);
  return res.json();
}

export async function deleteVerbDetails(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/verb-details/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Verb details delete failed: ${res.status}`);
}

// ── Noun details ────────────────────────────────────

export async function upsertNounDetails(
  wordId: string,
  fields: Partial<Pick<NounDetails, "article" | "plural">>
): Promise<NounDetails> {
  const res = await fetch(`${API_BASE}/words/${wordId}/noun-details`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Noun details upsert failed: ${res.status}`);
  return res.json();
}

export async function deleteNounDetails(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/noun-details/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Noun details delete failed: ${res.status}`);
}

// ── Adjective declensions ───────────────────────────

export async function createAdjDeclension(
  wordId: string,
  fields: { case_type: string; gender: string; form: string }
): Promise<AdjDeclension> {
  const res = await fetch(`${API_BASE}/words/${wordId}/adjective-declensions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Adj declension create failed: ${res.status}`);
  return res.json();
}

export async function updateAdjDeclension(
  id: string,
  fields: { form: string }
): Promise<AdjDeclension> {
  const res = await fetch(`${API_BASE}/adjective-declensions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Adj declension update failed: ${res.status}`);
  return res.json();
}

// ── Explanations ────────────────────────────────────

export async function createExplanation(
  entityType: string,
  entityId: string,
  content: string
): Promise<Explanation> {
  const res = await fetch(`${API_BASE}/explanations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_type: entityType, entity_id: entityId, content }),
  });
  if (!res.ok) throw new Error(`Explanation create failed: ${res.status}`);
  return res.json();
}

export async function updateExplanation(id: string, content: string): Promise<Explanation> {
  const res = await fetch(`${API_BASE}/explanations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Explanation update failed: ${res.status}`);
  return res.json();
}

export async function deleteExplanation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/explanations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Explanation delete failed: ${res.status}`);
}

// ── Tags ────────────────────────────────────────────

export async function fetchTags(): Promise<{ tags: Tag[] }> {
  const res = await fetch(`${API_BASE}/tags`);
  if (!res.ok) throw new Error(`Tags fetch failed: ${res.status}`);
  return res.json();
}

export async function createTag(name: string): Promise<Tag> {
  const res = await fetch(`${API_BASE}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Tag create failed: ${res.status}`);
  return res.json();
}

export async function deleteTag(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/tags/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Tag delete failed: ${res.status}`);
}

// ── Tag assignments ─────────────────────────────────

export async function addWordTag(wordId: string, tagId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/words/${wordId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_id: tagId }),
  });
  if (!res.ok) throw new Error(`Add word tag failed: ${res.status}`);
}

export async function removeWordTag(wordId: string, tagId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/words/${wordId}/tags/${tagId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Remove word tag failed: ${res.status}`);
}

export async function addTextTag(textId: string, tagId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/texts/${textId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_id: tagId }),
  });
  if (!res.ok) throw new Error(`Add text tag failed: ${res.status}`);
}

export async function removeTextTag(textId: string, tagId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/texts/${textId}/tags/${tagId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Remove text tag failed: ${res.status}`);
}

export async function addExplanationTag(explId: string, tagId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/explanations/${explId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_id: tagId }),
  });
  if (!res.ok) throw new Error(`Add explanation tag failed: ${res.status}`);
}

export async function removeExplanationTag(explId: string, tagId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/explanations/${explId}/tags/${tagId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Remove explanation tag failed: ${res.status}`);
}

// ── Corrections ─────────────────────────────────────

export async function createCorrection(fields: {
  word_id?: string;
  text_id?: string;
  original_text: string;
  corrected_text: string;
  note?: string;
}): Promise<Correction> {
  const res = await fetch(`${API_BASE}/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Correction create failed: ${res.status}`);
  return res.json();
}

export async function updateCorrection(
  id: string,
  fields: Partial<Pick<Correction, "status" | "note" | "corrected_text">>
): Promise<Correction> {
  const res = await fetch(`${API_BASE}/corrections/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Correction update failed: ${res.status}`);
  return res.json();
}

export async function deleteCorrection(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/corrections/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Correction delete failed: ${res.status}`);
}

// ── Text-word links ─────────────────────────────────

export async function linkTextWord(textId: string, wordId: string, position?: number): Promise<TextWordLink> {
  const res = await fetch(`${API_BASE}/texts/${textId}/words`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word_id: wordId, position }),
  });
  if (!res.ok) throw new Error(`Link text-word failed: ${res.status}`);
  return res.json();
}

export async function unlinkTextWord(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/text-words/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Unlink text-word failed: ${res.status}`);
}

// ── Word enrichment (propose + apply) ───────────────

export interface EnrichmentProposal {
  word_id: string;
  german: string;
  word_type?: string;
  translations?: { language: string; translation: string }[];
  verb_details?: {
    infinitive?: string;
    participle?: string;
    present_ich?: string;
    present_du?: string;
    present_er?: string;
    present_wir?: string;
    present_ihr?: string;
    present_sie?: string;
  };
  noun_details?: { article?: string; plural?: string };
  tags?: string[];
  explanation?: string;
}

export interface ApplyResult {
  applied: number;
  total: number;
  details: {
    word_id: string;
    german: string;
    actions: string[];
    ok: boolean;
  }[];
}

export async function proposeEnrichments(
  wordIds?: string[],
  limit = 10,
  filter = "all"
): Promise<{ proposals: EnrichmentProposal[] }> {
  const payload: Record<string, unknown> = { limit, filter };
  if (wordIds && wordIds.length > 0) {
    payload.word_ids = wordIds;
  }
  const res = await fetch(`${API_BASE}/enrich/words/propose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Enrich propose failed: ${res.status}`);
  return res.json();
}

export async function applyEnrichments(
  approved: EnrichmentProposal[]
): Promise<ApplyResult> {
  const res = await fetch(`${API_BASE}/enrich/words/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved }),
  });
  if (!res.ok) throw new Error(`Enrich apply failed: ${res.status}`);
  return res.json();
}

// ── Quiz generation ─────────────────────────────────

export interface QuizQuestion {
  id: string;
  type: "flashcard" | "multiple_choice";
  prompt: string;
  german: string;
  answer: string;
  options: string[];
  word_id: string;
  hint: string;
}

export async function generateQuiz(params: {
  prompt?: string;
  tag_ids?: string[];
  count?: number;
  types?: string[];
}): Promise<{ questions: QuizQuestion[] }> {
  const res = await fetch(`${API_BASE}/quizzes/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Quiz generate failed: ${res.status}`);
  return res.json();
}

// ── Translation add/delete ──────────────────────────

export async function addTranslation(wordId: string, language: string, translation: string): Promise<Translation> {
  const res = await fetch(`${API_BASE}/words/${wordId}/translations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, translation }),
  });
  if (!res.ok) throw new Error(`Add translation failed: ${res.status}`);
  return res.json();
}

export async function deleteTranslation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/translations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete translation failed: ${res.status}`);
}
