import { useState } from "react";
import type {
  WordSuggestion,
  SuggestionResponse,
  ConfirmedWord,
} from "../api";

interface Props {
  suggestions: SuggestionResponse;
  onConfirm: (words: ConfirmedWord[]) => void;
  onCancel: () => void;
  disabled?: boolean;
}

type SelectionMap = Record<string, Set<string>>;

function buildInitialSelection(suggestions: WordSuggestion[]): SelectionMap {
  const map: SelectionMap = {};
  for (let i = 0; i < suggestions.length; i++) {
    const key = String(i);
    map[key] = new Set(
      suggestions[i].translations.map((t) => `${t.language}:${t.text}`)
    );
  }
  return map;
}

export default function TranslationSuggestionCard({
  suggestions,
  onConfirm,
  onCancel,
  disabled,
}: Props) {
  const [selected, setSelected] = useState<SelectionMap>(() =>
    buildInitialSelection(suggestions.suggestions)
  );

  function toggleTranslation(wordIdx: number, key: string) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(prev[String(wordIdx)]);
      if (set.has(key)) {
        set.delete(key);
      } else {
        set.add(key);
      }
      next[String(wordIdx)] = set;
      return next;
    });
  }

  function handleConfirm() {
    const words: ConfirmedWord[] = [];

    suggestions.suggestions.forEach((ws, idx) => {
      const sel = selected[String(idx)] ?? new Set();
      const translations = ws.translations
        .filter((t) => sel.has(`${t.language}:${t.text}`))
        .map((t) => ({ language: t.language, translation: t.text }));

      if (translations.length > 0) {
        words.push({
          german: ws.german,
          word_type: ws.word_type,
          source: "chat",
          translations,
        });
      }
    });

    onConfirm(words);
  }

  const totalSelected = Object.values(selected).reduce(
    (sum, s) => sum + s.size,
    0
  );

  return (
    <div className="chat-message assistant">
      <div className="message-label">Agent</div>
      <div className="suggestion-card">
        <div className="suggestion-header">
          Select translations to store:
        </div>

        {suggestions.suggestions.map((ws, idx) => (
          <div key={idx} className="suggestion-word-group">
            <div className="suggestion-word-header">
              <span className="suggestion-german">
                {ws.article ? `${ws.article} ` : ""}
                {ws.german}
              </span>
              <span className={`suggestion-type-badge ${ws.word_type}`}>
                {ws.word_type}
              </span>
            </div>
            <div className="suggestion-translations">
              {ws.translations.map((t) => {
                const key = `${t.language}:${t.text}`;
                const checked = selected[String(idx)]?.has(key) ?? false;
                return (
                  <label key={key} className="suggestion-translation-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTranslation(idx, key)}
                      disabled={disabled}
                    />
                    <span className="suggestion-lang-tag">{t.language}</span>
                    <span className="suggestion-text">{t.text}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <div className="suggestion-actions">
          <button
            className="suggestion-btn confirm"
            onClick={handleConfirm}
            disabled={disabled || totalSelected === 0}
          >
            Confirm & Store
          </button>
          <button
            className="suggestion-btn cancel"
            onClick={onCancel}
            disabled={disabled}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
