import { useCallback, useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import {
  type QuizQuestion,
  type SavedQuizlet,
  type QuizRun,
  type ReviewAnswer,
  type Tag,
  fetchTags,
  generateAndSaveQuizlet,
  fetchQuizlets,
  startQuizRun,
  completeQuizRun,
  deleteQuizlet,
} from '../api';

type Phase = 'home' | 'setup' | 'loading' | 'session' | 'results';

interface SessionResult {
  questionId: string;
  correct: boolean;
}

export default function QuizletView() {
  const [phase, setPhase] = useState<Phase>('home');

  // saved quizlets list
  const [savedQuizlets, setSavedQuizlets] = useState<SavedQuizlet[]>([]);
  const [quizletsLoading, setQuizletsLoading] = useState(true);

  // setup fields
  const [prompt, setPrompt] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [poolCount, setPoolCount] = useState(15);
  const [questionCount, setQuestionCount] = useState(10);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);

  // active quiz session
  const [activeQuizlet, setActiveQuizlet] = useState<SavedQuizlet | null>(null);
  const [activeRun, setActiveRun] = useState<QuizRun | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // card interaction state
  const [flipped, setFlipped] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);

  const loadQuizlets = useCallback(() => {
    setQuizletsLoading(true);
    fetchQuizlets()
      .then((d) => setSavedQuizlets(d.quizlets))
      .catch(() => {})
      .finally(() => setQuizletsLoading(false));
  }, []);

  useEffect(() => {
    loadQuizlets();
  }, [loadQuizlets]);

  function loadTags() {
    if (tagsLoaded) return;
    fetchTags()
      .then((d) => setAllTags(d.tags))
      .catch(() => {})
      .finally(() => setTagsLoaded(true));
  }

  function handleTagToggle(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  async function handleGenerateAndSave() {
    if (!prompt.trim() && selectedTagIds.length === 0) return;
    setError(null);
    setPhase('loading');
    try {
      const quizlet = await generateAndSaveQuizlet({
        prompt: prompt.trim() || undefined,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        pool_count: poolCount,
        question_count: questionCount,
        types: ['flashcard', 'multiple_choice'],
        name: prompt.trim() || undefined,
      });
      if (!quizlet.questions || quizlet.questions.length === 0) {
        setError('No questions could be generated. Try different tags or a broader prompt.');
        setPhase('setup');
        return;
      }
      setActiveQuizlet(quizlet);
      loadQuizlets();
      await startRunFromQuizlet(quizlet.id, questionCount);
    } catch {
      setError('Failed to generate quiz. Please try again.');
      setPhase('setup');
    }
  }

  async function startRunFromQuizlet(quizletId: string, qCount?: number) {
    setError(null);
    try {
      const run = await startQuizRun(quizletId, qCount);
      setActiveRun(run);
      setQuestions(run.questions);
      setCurrentIdx(0);
      setResults([]);
      setFlipped(false);
      setSelectedOption(null);
      setHintOpen(false);
      setPhase('session');
    } catch {
      setError('Failed to start quiz run.');
      setPhase('home');
    }
  }

  async function handlePractice(quizlet: SavedQuizlet) {
    setActiveQuizlet(quizlet);
    setPhase('loading');
    await startRunFromQuizlet(quizlet.id, quizlet.default_question_count);
  }

  function handleFlashcardAnswer(correct: boolean) {
    setResults((prev) => [...prev, { questionId: questions[currentIdx].id, correct }]);
    goNext();
  }

  function handleMCAnswer(option: string) {
    if (selectedOption !== null) return;
    setSelectedOption(option);
    const isCorrect = option === questions[currentIdx].answer;
    setResults((prev) => [...prev, { questionId: questions[currentIdx].id, correct: isCorrect }]);
  }

  function goNext() {
    if (currentIdx + 1 >= questions.length) {
      handleFinish();
    } else {
      setCurrentIdx((i) => i + 1);
      setFlipped(false);
      setSelectedOption(null);
      setHintOpen(false);
    }
  }

  async function handleFinish() {
    if (activeRun) {
      const answers: ReviewAnswer[] = results.map((r) => {
        const q = questions.find((q) => q.id === r.questionId);
        return {
          question_id: r.questionId,
          word_id: q?.word_id,
          correct: r.correct,
          question_type: q?.type ?? 'flashcard',
        };
      });
      if (currentIdx + 1 >= questions.length) {
        const lastQ = questions[currentIdx];
        const lastCorrect =
          selectedOption !== null
            ? selectedOption === lastQ.answer
            : (results[results.length - 1]?.correct ?? false);
        const lastAlready = answers.some((a) => a.question_id === lastQ.id);
        if (!lastAlready) {
          answers.push({
            question_id: lastQ.id,
            word_id: lastQ.word_id,
            correct: lastCorrect,
            question_type: lastQ.type,
          });
        }
      }
      try {
        await completeQuizRun(activeRun.id, answers);
      } catch {
        /* best effort */
      }
      loadQuizlets();
    }
    setPhase('results');
  }

  async function handleRetryNewSubset() {
    if (!activeQuizlet) return;
    setPhase('loading');
    await startRunFromQuizlet(activeQuizlet.id, activeQuizlet.default_question_count);
  }

  function handleBackToHome() {
    setPhase('home');
    setActiveQuizlet(null);
    setActiveRun(null);
    setQuestions([]);
    setResults([]);
    setCurrentIdx(0);
    setFlipped(false);
    setSelectedOption(null);
    setHintOpen(false);
    setError(null);
  }

  function handleGoToSetup() {
    loadTags();
    setPhase('setup');
    setError(null);
  }

  async function handleDeleteQuizlet(id: string) {
    if (!confirm('Delete this saved quiz?')) return;
    try {
      await deleteQuizlet(id);
      setSavedQuizlets((prev) => prev.filter((q) => q.id !== id));
    } catch {
      /* swallow */
    }
  }

  const score = results.filter((r) => r.correct).length;

  // ── Home: saved quizlets list ──
  if (phase === 'home') {
    return (
      <div className="quizlet-view">
        <div className="quiz-home">
          <div className="quiz-home-header">
            <h2 className="quiz-setup-title">My Quizzes</h2>
            <Button variant="contained" onClick={handleGoToSetup}>
              + New Quiz
            </Button>
          </div>

          {quizletsLoading && <p className="quiz-home-loading">Loading saved quizzes...</p>}

          {!quizletsLoading && savedQuizlets.length === 0 && (
            <div className="quiz-empty-state">
              <p className="quiz-empty-text">No saved quizzes yet.</p>
              <p className="quiz-empty-sub">Create your first quiz to start practicing.</p>
            </div>
          )}

          {!quizletsLoading && savedQuizlets.length > 0 && (
            <div className="quiz-saved-list">
              {savedQuizlets.map((q) => {
                const typesArr: string[] = (() => {
                  try {
                    return JSON.parse(q.types);
                  } catch {
                    return [];
                  }
                })();
                const lastRun = q.runs?.[0];
                return (
                  <div key={q.id} className="quiz-saved-card">
                    <div className="quiz-saved-card-header">
                      <h3 className="quiz-saved-card-title">{q.name}</h3>
                      <div className="quiz-saved-card-meta">
                        <span>{q.pool_count} questions in pool</span>
                        <span>{q.default_question_count} per run</span>
                        {typesArr.length > 0 && <span>{typesArr.join(', ')}</span>}
                      </div>
                    </div>
                    {q.tags && q.tags.length > 0 && (
                      <div className="quiz-saved-card-tags">
                        {q.tags.map((t) => (
                          <span key={t.id} className="quiz-tag-pill selected">
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {lastRun && lastRun.score_total != null && (
                      <div className="quiz-saved-card-last-run">
                        Last score: {lastRun.score_correct}/{lastRun.score_total}
                        {q.total_runs && q.total_runs > 1 && (
                          <span className="quiz-saved-card-run-count"> ({q.total_runs} runs)</span>
                        )}
                      </div>
                    )}
                    <div className="quiz-saved-card-actions">
                      <Button variant="contained" color="success" onClick={() => handlePractice(q)}>
                        Practice
                      </Button>
                      <Button color="error" onClick={() => handleDeleteQuizlet(q.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Setup: create new quiz ──
  if (phase === 'setup') {
    return (
      <div className="quizlet-view">
        <div className="quiz-setup">
          <div className="quiz-setup-top-row">
            <Button onClick={handleBackToHome}>&larr; Back</Button>
            <h2 className="quiz-setup-title">Create a New Quiz</h2>
          </div>

          <div className="quiz-field-label">
            What do you want to practice?
            <TextField
              className="quiz-prompt-input"
              placeholder='e.g. "food vocabulary", "verbs from this week"'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGenerateAndSave();
              }}
              size="small"
              variant="outlined"
              fullWidth
            />
          </div>

          <div className="quiz-field-group">
            <span className="quiz-field-label">Filter by tags</span>
            <div className="quiz-tag-selector">
              {allTags.length === 0 && tagsLoaded && (
                <span className="quiz-no-tags">No tags found</span>
              )}
              {allTags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  clickable
                  color={selectedTagIds.includes(tag.id) ? 'primary' : 'default'}
                  variant={selectedTagIds.includes(tag.id) ? 'filled' : 'outlined'}
                  onClick={() => handleTagToggle(tag.id)}
                  className={`quiz-tag-pill ${selectedTagIds.includes(tag.id) ? 'selected' : ''}`}
                />
              ))}
            </div>
          </div>

          <div className="quiz-count-row">
            <div className="quiz-field-label">
              Total questions in pool
              <TextField
                className="quiz-count-input"
                type="number"
                slotProps={{ htmlInput: { min: 1, max: 50 } }}
                value={poolCount}
                onChange={(e) => setPoolCount(Math.max(1, parseInt(e.target.value) || 1))}
                size="small"
                variant="outlined"
              />
            </div>
            <div className="quiz-field-label">
              Questions per run
              <TextField
                className="quiz-count-input"
                type="number"
                slotProps={{ htmlInput: { min: 1, max: poolCount } }}
                value={questionCount}
                onChange={(e) =>
                  setQuestionCount(Math.max(1, Math.min(poolCount, parseInt(e.target.value) || 1)))
                }
                size="small"
                variant="outlined"
              />
            </div>
          </div>

          {error && <p className="quiz-error">{error}</p>}

          <Button
            variant="contained"
            onClick={handleGenerateAndSave}
            disabled={!prompt.trim() && selectedTagIds.length === 0}
          >
            Generate & Save Quiz
          </Button>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <div className="quizlet-view">
        <div className="quiz-loading">
          <CircularProgress />
          <p>Generating your quiz...</p>
        </div>
      </div>
    );
  }

  // ── Session ──
  if (phase === 'session' && questions.length > 0) {
    return (
      <div className="quizlet-view">
        <div className="quiz-session">
          <div className="quiz-progress">
            <div className="quiz-progress-bar">
              <div
                className="quiz-progress-fill"
                style={{ width: `${(currentIdx / questions.length) * 100}%` }}
              />
            </div>
            <span className="quiz-progress-text">
              {currentIdx + 1} / {questions.length}
            </span>
          </div>

          {questions[currentIdx].type === 'flashcard' ? (
            <div className="quiz-card-wrapper">
              <div
                className={`quiz-card ${flipped ? 'flipped' : ''}`}
                onClick={() => setFlipped((f) => !f)}
              >
                <div className="quiz-card-front">
                  <span className="quiz-card-type-badge">Flashcard</span>
                  <p className="quiz-card-prompt">{questions[currentIdx].prompt}</p>
                  <p className="quiz-card-german">{questions[currentIdx].german}</p>
                  {questions[currentIdx].hint && (
                    <div className="quiz-hint-wrapper" onClick={(e) => e.stopPropagation()}>
                      <button className="quiz-hint-toggle" onClick={() => setHintOpen((o) => !o)}>
                        {hintOpen ? '▲ Tipp verbergen' : '▼ Tipp anzeigen'}
                      </button>
                      {hintOpen && <p className="quiz-card-hint">{questions[currentIdx].hint}</p>}
                    </div>
                  )}
                  <p className="quiz-card-tap">
                    {flipped ? 'Click to flip back' : 'Click to reveal answer'}
                  </p>
                </div>
                <div className="quiz-card-back">
                  <span className="quiz-card-type-badge">Answer</span>
                  <p className="quiz-card-answer">{questions[currentIdx].answer}</p>
                </div>
              </div>
              {flipped && (
                <div className="quiz-flashcard-actions">
                  <Button color="error" onClick={() => handleFlashcardAnswer(false)}>
                    Missed it
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => handleFlashcardAnswer(true)}
                  >
                    Got it!
                  </Button>
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
                    <button className="quiz-hint-toggle" onClick={() => setHintOpen((o) => !o)}>
                      {hintOpen ? '▲ Tipp verbergen' : '▼ Tipp anzeigen'}
                    </button>
                    {hintOpen && <p className="quiz-card-hint">{questions[currentIdx].hint}</p>}
                  </div>
                )}
              </div>
              <div className="quiz-options">
                {questions[currentIdx].options.map((opt) => {
                  let cls = 'quiz-option';
                  if (selectedOption !== null) {
                    if (opt === questions[currentIdx].answer) cls += ' correct';
                    else if (opt === selectedOption) cls += ' wrong';
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
                <Button variant="contained" onClick={goNext}>
                  {currentIdx + 1 >= questions.length ? 'See Results' : 'Next'}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Results ──
  if (phase === 'results') {
    return (
      <div className="quizlet-view">
        <div className="quiz-results">
          <h2 className="quiz-results-title">Quiz Complete!</h2>
          <div className="quiz-score">
            <span className="quiz-score-number">{score}</span>
            <span className="quiz-score-divider">/</span>
            <span className="quiz-score-total">{questions.length}</span>
          </div>
          <p className="quiz-score-label">
            {score === questions.length
              ? 'Perfect score!'
              : score >= questions.length * 0.7
                ? 'Great job!'
                : 'Keep practicing!'}
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
            {activeQuizlet && (
              <Button variant="contained" onClick={handleRetryNewSubset}>
                New Subset
              </Button>
            )}
            <Button onClick={handleBackToHome}>Back to Quizzes</Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
