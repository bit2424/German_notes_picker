import { useState } from "react";
import { type QuizQuestion, type Tag, fetchTags, generateQuiz } from "../api";

type Phase = "setup" | "loading" | "session" | "results";

interface QuizResult {
  questionId: string;
  correct: boolean;
}

export default function QuizletView() {
  const [phase, setPhase] = useState<Phase>("setup");

  const [prompt, setPrompt] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [flipped, setFlipped] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);

  async function loadTags() {
    if (tagsLoaded) return;
    try {
      const data = await fetchTags();
      setAllTags(data.tags);
    } catch {
      /* swallow */
    }
    setTagsLoaded(true);
  }

  function handleTagToggle(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }

  async function handleGenerate() {
    if (!prompt.trim() && selectedTagIds.length === 0) return;
    setError(null);
    setPhase("loading");
    try {
      const data = await generateQuiz({
        prompt: prompt.trim() || undefined,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        count,
        types: ["flashcard", "multiple_choice"],
      });
      if (data.questions.length === 0) {
        setError("No questions could be generated. Try different tags or a broader prompt.");
        setPhase("setup");
        return;
      }
      setQuestions(data.questions);
      setCurrentIdx(0);
      setResults([]);
      setFlipped(false);
      setSelectedOption(null);
      setPhase("session");
    } catch {
      setError("Failed to generate quiz. Please try again.");
      setPhase("setup");
    }
  }

  function handleFlashcardAnswer(correct: boolean) {
    setResults((prev) => [
      ...prev,
      { questionId: questions[currentIdx].id, correct },
    ]);
    goNext();
  }

  function handleMCAnswer(option: string) {
    if (selectedOption !== null) return;
    setSelectedOption(option);
    const isCorrect = option === questions[currentIdx].answer;
    setResults((prev) => [
      ...prev,
      { questionId: questions[currentIdx].id, correct: isCorrect },
    ]);
  }

  function goNext() {
    if (currentIdx + 1 >= questions.length) {
      setPhase("results");
    } else {
      setCurrentIdx((i) => i + 1);
      setFlipped(false);
      setSelectedOption(null);
      setHintOpen(false);
    }
  }

  function handleNewQuiz() {
    setPhase("setup");
    setQuestions([]);
    setResults([]);
    setCurrentIdx(0);
    setFlipped(false);
    setSelectedOption(null);
    setHintOpen(false);
  }

  function handleRetry() {
    setCurrentIdx(0);
    setResults([]);
    setFlipped(false);
    setSelectedOption(null);
    setHintOpen(false);
    setPhase("session");
  }

  if (!tagsLoaded) {
    loadTags();
  }

  const score = results.filter((r) => r.correct).length;

  return (
    <div className="quizlet-view">
      {phase === "setup" && (
        <div className="quiz-setup">
          <h2 className="quiz-setup-title">Generate a Quiz</h2>

          <label className="quiz-field-label">
            What do you want to practice?
            <input
              className="quiz-prompt-input"
              type="text"
              placeholder='e.g. "food vocabulary", "verbs from this week"'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGenerate();
              }}
            />
          </label>

          <div className="quiz-field-group">
            <span className="quiz-field-label">Filter by tags</span>
            <div className="quiz-tag-selector">
              {allTags.length === 0 && tagsLoaded && (
                <span className="quiz-no-tags">No tags found</span>
              )}
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  className={`quiz-tag-pill ${selectedTagIds.includes(tag.id) ? "selected" : ""}`}
                  onClick={() => handleTagToggle(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <label className="quiz-field-label">
            Number of questions
            <input
              className="quiz-count-input"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </label>

          {error && <p className="quiz-error">{error}</p>}

          <button
            className="quiz-generate-btn"
            onClick={handleGenerate}
            disabled={!prompt.trim() && selectedTagIds.length === 0}
          >
            Generate Quiz
          </button>
        </div>
      )}

      {phase === "loading" && (
        <div className="quiz-loading">
          <div className="quiz-loading-spinner" />
          <p>Generating your quiz...</p>
        </div>
      )}

      {phase === "session" && questions.length > 0 && (
        <div className="quiz-session">
          <div className="quiz-progress">
            <div className="quiz-progress-bar">
              <div
                className="quiz-progress-fill"
                style={{ width: `${((currentIdx) / questions.length) * 100}%` }}
              />
            </div>
            <span className="quiz-progress-text">
              {currentIdx + 1} / {questions.length}
            </span>
          </div>

          {questions[currentIdx].type === "flashcard" ? (
            <div className="quiz-card-wrapper">
              <div
                className={`quiz-card ${flipped ? "flipped" : ""}`}
                onClick={() => setFlipped((f) => !f)}
              >
                <div className="quiz-card-front">
                  <span className="quiz-card-type-badge">Flashcard</span>
                  <p className="quiz-card-prompt">{questions[currentIdx].prompt}</p>
                  <p className="quiz-card-german">{questions[currentIdx].german}</p>
                  {questions[currentIdx].hint && (
                    <div className="quiz-hint-wrapper" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="quiz-hint-toggle"
                        onClick={() => setHintOpen((o) => !o)}
                      >
                        {hintOpen ? "▲ Tipp verbergen" : "▼ Tipp anzeigen"}
                      </button>
                      {hintOpen && (
                        <p className="quiz-card-hint">{questions[currentIdx].hint}</p>
                      )}
                    </div>
                  )}
                  <p className="quiz-card-tap">{flipped ? "Click to flip back" : "Click to reveal answer"}</p>
                </div>
                <div className="quiz-card-back">
                  <span className="quiz-card-type-badge">Answer</span>
                  <p className="quiz-card-answer">{questions[currentIdx].answer}</p>
                </div>
              </div>
              {flipped && (
                <div className="quiz-flashcard-actions">
                  <button
                    className="quiz-action-btn missed"
                    onClick={() => handleFlashcardAnswer(false)}
                  >
                    Missed it
                  </button>
                  <button
                    className="quiz-action-btn got-it"
                    onClick={() => handleFlashcardAnswer(true)}
                  >
                    Got it!
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="quiz-mc-wrapper">
              <div className="quiz-mc-card">
                <span className="quiz-card-type-badge">Multiple Choice</span>
                <p className="quiz-card-prompt">{questions[currentIdx].prompt}</p>
                <p className="quiz-card-german">{questions[currentIdx].german}</p>
                {questions[currentIdx].hint && (
                  <div className="quiz-hint-wrapper">
                    <button
                      className="quiz-hint-toggle"
                      onClick={() => setHintOpen((o) => !o)}
                    >
                      {hintOpen ? "▲ Tipp verbergen" : "▼ Tipp anzeigen"}
                    </button>
                    {hintOpen && (
                      <p className="quiz-card-hint">{questions[currentIdx].hint}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="quiz-options">
                {questions[currentIdx].options.map((opt) => {
                  let cls = "quiz-option";
                  if (selectedOption !== null) {
                    if (opt === questions[currentIdx].answer) cls += " correct";
                    else if (opt === selectedOption) cls += " wrong";
                  }
                  return (
                    <button
                      key={opt}
                      className={cls}
                      onClick={() => handleMCAnswer(opt)}
                      disabled={selectedOption !== null}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {selectedOption !== null && (
                <button className="quiz-next-btn" onClick={goNext}>
                  {currentIdx + 1 >= questions.length ? "See Results" : "Next"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {phase === "results" && (
        <div className="quiz-results">
          <h2 className="quiz-results-title">Quiz Complete!</h2>
          <div className="quiz-score">
            <span className="quiz-score-number">{score}</span>
            <span className="quiz-score-divider">/</span>
            <span className="quiz-score-total">{questions.length}</span>
          </div>
          <p className="quiz-score-label">
            {score === questions.length
              ? "Perfect score!"
              : score >= questions.length * 0.7
                ? "Great job!"
                : "Keep practicing!"}
          </p>

          {results.some((r) => !r.correct) && (
            <div className="quiz-missed-section">
              <h3 className="quiz-missed-title">Words to review</h3>
              <ul className="quiz-missed-list">
                {results
                  .filter((r) => !r.correct)
                  .map((r) => {
                    const q = questions.find((q) => q.id === r.questionId);
                    if (!q) return null;
                    return (
                      <li key={r.questionId} className="quiz-missed-item">
                        <span className="quiz-missed-german">{q.german}</span>
                        <span className="quiz-missed-arrow">&rarr;</span>
                        <span className="quiz-missed-answer">{q.answer}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}

          <div className="quiz-results-actions">
            <button className="quiz-action-btn retry" onClick={handleRetry}>
              Try Again
            </button>
            <button className="quiz-action-btn new-quiz" onClick={handleNewQuiz}>
              New Quiz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
