import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  FileQuestion,
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  Trophy,
  XCircle,
} from "lucide-react";
import "./Quizzes.css";
import { useAdminTheme } from "../../context/ThemeContext";
import { toast, Toaster } from "sonner";

const API_BASE = "http://127.0.0.1:8000/api/ai-services";

function getAccessToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    ""
  );
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getErrorMessage(error, fallback) {
  return error?.message || fallback;
}

// Explicit red/green styling keeps notifications consistent across themes.
// Use toast.error for failures and toast.success for successful actions only.
const toastError = (message) =>
  toast.error(message, {
    style: {
      background: "#fee2e2",
      color: "#991b1b",
      border: "1px solid #fca5a5",
    },
  });

const toastSuccess = (message) =>
  toast.success(message, {
    style: {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    },
  });

export default function Quizzes() {
  // Read the same live theme state used by StudentLayout's theme picker.
  const { theme } = useAdminTheme();
  const activeTheme = ["light", "dark", "yellow"].includes(
    String(theme || "").toLowerCase()
  )
    ? String(theme).toLowerCase()
    : "light";
  const [view, setView] = useState("list"); // list | instructions | attempt | result
  const [quizzes, setQuizzes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [result, setResult] = useState(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const submitLock = useRef(false);

  const apiRequest = useCallback(async (path, options = {}) => {
    const token = getAccessToken();
    if (!token) {
      throw new Error("Your login token was not found. Please log in again.");
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Your session has expired. Please log in again.");
      }
      throw new Error(data.message || data.detail || `Request failed (${response.status}).`);
    }
    return data;
  }, []);

  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/student/exams/");
      setQuizzes(
        Array.isArray(data)
          ? data
          : Array.isArray(data.results)
            ? data.results
            : []
      );
    } catch (err) {
      toastError(getErrorMessage(err, "Unable to load quizzes."));
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  useEffect(() => {
    if (view !== "attempt" || remainingSeconds <= 0 || busy) return undefined;
    const timer = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view, busy, remainingSeconds > 0]);

  useEffect(() => {
    if (view === "attempt" && remainingSeconds === 0 && attemptId && questions.length && !busy) {
      submitAttempt(true);
    }
    // submitAttempt is intentionally triggered when the countdown reaches zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, view, attemptId, questions.length, busy]);

  const filteredQuizzes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return quizzes;
    return quizzes.filter((quiz) =>
      [quiz.title, quiz.course_name, quiz.description]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [quizzes, search]);

  async function openQuiz(quiz) {
    setBusy(true);
    try {
      const data = await apiRequest(`/student/exams/${quiz.id}/`);
      setSelectedQuiz({ ...quiz, ...data });
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setAnswers({});
      setCurrentQuestion(0);
      setAttemptId(null);
      setResult(null);
      setReviewVisible(false);
      setView("instructions");
    } catch (err) {
      const message = getErrorMessage(err, "Unable to open this quiz.");
      if (message.toLowerCase().includes("already submitted")) {
        toastError("You have already submitted this quiz. Refresh the quiz list to see its status.");
        await loadQuizzes();
      } else {
        toastError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function startQuiz() {
    if (!selectedQuiz) return;
    submitLock.current = false;
    setBusy(true);
    try {
      const started = await apiRequest(`/student/exams/${selectedQuiz.id}/attempts/`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      const detail = await apiRequest(`/student/exams/${selectedQuiz.id}/`);
      setSelectedQuiz({ ...selectedQuiz, ...detail });
      setQuestions(Array.isArray(detail.questions) ? detail.questions : []);
      setAttemptId(started.attempt_id);
      setRemainingSeconds(
        Number.isFinite(Number(started.remaining_seconds))
          ? Number(started.remaining_seconds)
          : Number(detail.duration_minutes || selectedQuiz.duration_minutes || 30) * 60
      );
      setAnswers({});
      setCurrentQuestion(0);
      setView("attempt");
      toastSuccess("Quiz started. Good luck!");
    } catch (err) {
      const message = getErrorMessage(err, "Unable to start the quiz.");
      toastError(message);
      if (message.toLowerCase().includes("already submitted")) {
        await loadQuizzes();
        setView("list");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitAttempt(isAutoSubmit = false) {
    if (!attemptId || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    try {
      const payload = {
        answers: questions.map((question) => ({
          question_id: question.id,
          selected_option: answers[question.id] || "",
        })),
      };
      const data = await apiRequest(`/student/attempts/${attemptId}/submit/`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const submittedResult = data.result || data;
      setResult(submittedResult);
      setView("result");
      toastSuccess(
        isAutoSubmit
          ? "Time ended. Your quiz was submitted automatically."
          : "Your quiz was submitted successfully."
      );
      await loadQuizzes();
    } catch (err) {
      toastError(getErrorMessage(err, "Unable to submit the quiz."));
      submitLock.current = false;
    } finally {
      setBusy(false);
    }
  }

  async function viewExistingResult(quiz) {
    if (!quiz.attempt_id) return;
    setBusy(true);
    try {
      const data = await apiRequest(`/student/attempts/${quiz.attempt_id}/result/`);
      setSelectedQuiz(quiz);
      setResult(data);
      setReviewVisible(false);
      setView("result");
      toastSuccess("Latest quiz result loaded successfully.");
    } catch (err) {
      toastError(getErrorMessage(err, "Unable to load the result."));
    } finally {
      setBusy(false);
    }
  }

  function backToList() {
    setView("list");
    setSelectedQuiz(null);
    setQuestions([]);
    setAttemptId(null);
    setResult(null);
    setAnswers({});
    loadQuizzes();
  }

  const current = questions[currentQuestion];
  const answeredCount = questions.filter((question) => Boolean(answers[question.id])).length;

  return (
    <main className={`student-quizzes theme-${activeTheme}`}>
      <Toaster position="top-right" richColors closeButton />
      <div className="sq-page-heading">
        <div>
          <p className="sq-eyebrow">LEARNING CENTER</p>
          <h1>{view === "attempt" ? selectedQuiz?.title || "Quiz attempt" : view === "result" ? "Quiz Results" : "Quizzes"}</h1>
          <p className="sq-subtitle">
            {view === "attempt"
              ? "Answer each question and submit before the timer ends."
              : view === "instructions"
              ? "Review the details before starting your quiz."
              : view === "result"
              ? "Review your score and learn from your answers."
              : "Test your understanding and track your learning progress."}
          </p>
        </div>
        {view !== "list" && (
          <button className="sq-button sq-button-secondary" onClick={backToList} disabled={busy}>
            <ArrowLeft size={17} /> Back to quizzes
          </button>
        )}
      </div>


      {view === "list" && (
        <>
          <section className="sq-stats-grid">
            <article className="sq-stat-card">
              <span className="sq-stat-icon"><FileQuestion size={20} /></span>
              <div><p>Available quizzes</p><strong>{quizzes.length}</strong></div>
            </article>
            <article className="sq-stat-card">
              <span className="sq-stat-icon sq-stat-purple"><Trophy size={20} /></span>
              <div><p>Submitted</p><strong>{quizzes.filter((quiz) => quiz.attempt_status === "submitted" || quiz.attempt_status === "evaluated").length}</strong></div>
            </article>
            <article className="sq-stat-card">
              <span className="sq-stat-icon sq-stat-orange"><Clock3 size={20} /></span>
              <div><p>Not attempted</p><strong>{quizzes.filter((quiz) => !quiz.attempt_status).length}</strong></div>
            </article>
          </section>

          <section className="sq-content-card">
            <div className="sq-list-toolbar">
              <div>
                <h2>Available quizzes</h2>
                <p>Select a quiz to view its instructions.</p>
              </div>
              <label className="sq-search">
                <Search size={18} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quizzes or courses..." />
              </label>
            </div>

            {loading ? (
              <div className="sq-state"><LoaderCircle className="sq-spin" size={28} /><p>Loading quizzes...</p></div>
            ) : filteredQuizzes.length === 0 ? (
              <div className="sq-state">
                <span className="sq-empty-icon"><BookOpen size={28} /></span>
                <h3>{search ? "No matching quizzes" : "No quizzes available yet"}</h3>
                <p>{search ? "Try another title or course name." : "Published quizzes from your mentors will appear here."}</p>
                <button className="sq-button sq-button-secondary" onClick={loadQuizzes}><RefreshCw size={16} /> Refresh</button>
              </div>
            ) : (
              <div className="sq-quiz-grid">
                {filteredQuizzes.map((quiz) => {
                  const submitted = quiz.attempt_status === "submitted" || quiz.attempt_status === "evaluated";
                  return (
                    <article className="sq-quiz-card" key={quiz.id}>
                      <div className="sq-quiz-card-top">
                        <span className="sq-quiz-symbol"><FileQuestion size={23} /></span>
                        <span className={`sq-status ${submitted ? "sq-status-done" : quiz.attempt_status ? "sq-status-progress" : "sq-status-new"}`}>
                          {submitted ? "Completed" : quiz.attempt_status ? "In progress" : "Available"}
                        </span>
                      </div>
                      <h3>{quiz.title}</h3>
                      <p className="sq-course-name">{quiz.course_name || "General course"}</p>
                      <p className="sq-quiz-description">{quiz.description || "Test your knowledge with this quiz."}</p>
                      <div className="sq-quiz-meta">
                        <span><CircleHelp size={15} /> {quiz.question_count ?? "—"} questions</span>
                        <span><Clock3 size={15} /> {quiz.duration_minutes ?? "—"} min</span>
                        <span><Trophy size={15} /> {quiz.total_marks ?? "—"} marks</span>
                      </div>
                      <div className="sq-quiz-card-footer">
                        {submitted ? (
                          <>
                            <span className="sq-score-label">Score: {quiz.score ?? "Submitted"}</span>
                            <button className="sq-button sq-button-secondary" onClick={() => viewExistingResult(quiz)} disabled={busy}>
                              <Eye size={16} /> View result
                            </button>
                            <button className="sq-button sq-button-primary" onClick={() => openQuiz(quiz)} disabled={busy}>
                              <RefreshCw size={16} /> Reattempt
                            </button>
                          </>
                        ) : (
                          <button className="sq-button sq-button-primary" onClick={() => openQuiz(quiz)} disabled={busy}>
                            View quiz <ChevronRight size={17} />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {view === "instructions" && selectedQuiz && (
        <section className="sq-content-card sq-instructions">
          <div className="sq-instruction-icon"><FileQuestion size={30} /></div>
          <h2>{selectedQuiz.title}</h2>
          <p className="sq-course-name">{selectedQuiz.course_name}</p>
          <p className="sq-instruction-description">{selectedQuiz.description || "Read each question carefully and select the best answer."}</p>
          <div className="sq-instruction-stats">
            <div><Clock3 size={20} /><span><strong>{selectedQuiz.duration_minutes}</strong><small>Minutes</small></span></div>
            <div><CircleHelp size={20} /><span><strong>{selectedQuiz.question_count ?? questions.length}</strong><small>Questions</small></span></div>
            <div><Trophy size={20} /><span><strong>{selectedQuiz.total_marks}</strong><small>Total marks</small></span></div>
            <div><CheckCircle2 size={20} /><span><strong>{selectedQuiz.passing_marks}</strong><small>Pass marks</small></span></div>
          </div>
          <div className="sq-rules">
            <h3>Before you begin</h3>
            <ul>
              <li>The timer starts as soon as you begin the quiz.</li>
              <li>You can move between questions and change your answers before submitting.</li>
              <li>Unanswered questions receive no marks.</li>
              <li>You may reattempt this quiz after submitting. Each attempt is saved separately.</li>
              <li>Your answers are evaluated by the server when you submit.</li>
            </ul>
          </div>
          <div className="sq-instruction-actions">
            <button className="sq-button sq-button-secondary" onClick={backToList} disabled={busy}>Cancel</button>
            <button className="sq-button sq-button-primary" onClick={startQuiz} disabled={busy || questions.length === 0}>
              {busy ? <LoaderCircle className="sq-spin" size={17} /> : <BookOpen size={17} />}
              {busy ? "Starting..." : "Start quiz"}
            </button>
          </div>
        </section>
      )}

      {view === "attempt" && current && (
        <section className="sq-attempt-layout">
          <div className="sq-attempt-main sq-content-card">
            <div className="sq-attempt-topline">
              <div><span className="sq-muted-label">QUESTION</span><strong>{currentQuestion + 1} <span>/ {questions.length}</span></strong></div>
              <div className={`sq-countdown ${remainingSeconds <= 60 ? "sq-countdown-warning" : ""}`}><Clock3 size={18} /><span>{formatTime(remainingSeconds)}</span></div>
            </div>
            <div className="sq-progress-track"><div style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }} /></div>
            <div className="sq-question-heading">
              <span>Question {currentQuestion + 1}</span>
              <span>{current.marks || 1} {Number(current.marks || 1) === 1 ? "mark" : "marks"}</span>
            </div>
            <h2 className="sq-question-text">{current.text}</h2>
            {current.topic && <p className="sq-topic-tag">{current.topic}</p>}
            <div className="sq-options">
              {["A", "B", "C", "D"].map((option) => {
                const optionText = current[`option_${option.toLowerCase()}`];
                if (optionText === undefined || optionText === null) return null;
                const selected = answers[current.id] === option;
                return (
                  <button type="button" key={option} className={`sq-option ${selected ? "sq-option-selected" : ""}`} onClick={() => setAnswers((previous) => ({ ...previous, [current.id]: option }))}>
                    <span className="sq-option-letter">{option}</span><span>{optionText}</span>
                    <span className="sq-option-radio">{selected ? <CheckCircle2 size={19} /> : null}</span>
                  </button>
                );
              })}
            </div>
            <div className="sq-question-controls">
              <button className="sq-button sq-button-secondary" onClick={() => setCurrentQuestion((index) => Math.max(0, index - 1))} disabled={currentQuestion === 0 || busy}><ChevronLeft size={17} /> Previous</button>
              <button className="sq-button sq-button-secondary" onClick={() => setAnswers((previous) => ({ ...previous, [current.id]: "" }))} disabled={!answers[current.id] || busy}>Clear answer</button>
              {currentQuestion < questions.length - 1 ? (
                <button className="sq-button sq-button-primary" onClick={() => setCurrentQuestion((index) => Math.min(questions.length - 1, index + 1))} disabled={busy}>Next <ChevronRight size={17} /></button>
              ) : (
                <button className="sq-button sq-button-primary" onClick={() => submitAttempt(false)} disabled={busy}>{busy ? <LoaderCircle className="sq-spin" size={17} /> : <Send size={17} />} Submit quiz</button>
              )}
            </div>
          </div>
          <aside className="sq-question-sidebar sq-content-card">
            <h3>Question navigator</h3>
            <p>{answeredCount} of {questions.length} answered</p>
            <div className="sq-question-grid">
              {questions.map((question, index) => (
                <button key={question.id} className={`sq-question-number ${index === currentQuestion ? "sq-number-current" : ""} ${answers[question.id] ? "sq-number-answered" : ""}`} onClick={() => setCurrentQuestion(index)} aria-label={`Go to question ${index + 1}`}>
                  {index + 1}
                </button>
              ))}
            </div>
            <div className="sq-legend"><span><i className="sq-legend-current" /> Current</span><span><i className="sq-legend-answered" /> Answered</span><span><i className="sq-legend-unanswered" /> Unanswered</span></div>
            <button className="sq-button sq-button-submit-wide" onClick={() => submitAttempt(false)} disabled={busy}>
              {busy ? <LoaderCircle className="sq-spin" size={17} /> : <Send size={17} />} Submit quiz
            </button>
            <p className="sq-submit-hint">Please review your answers before submitting.</p>
          </aside>
        </section>
      )}

      {view === "result" && result && (
        <section className="sq-content-card sq-result-card">
          <div className={`sq-result-icon ${result.passed ? "sq-result-passed" : "sq-result-failed"}`}>
            {result.passed ? <Trophy size={32} /> : <BookOpen size={32} />}
          </div>
          <p className="sq-eyebrow">QUIZ COMPLETED</p>
          <h2>{result.exam_title || selectedQuiz?.title || "Your result"}</h2>
          <p className="sq-result-subtitle">{result.passed ? "Congratulations! You achieved the passing score." : "Keep practicing. Review your answers and try to improve next time."}</p>
          <div className="sq-result-score"><strong>{result.score ?? 0}</strong><span>/ {result.total_marks ?? 0} marks</span></div>
          <div className="sq-result-progress"><div style={{ width: `${Math.min(100, Math.max(0, Number(result.percentage) || 0))}%` }} /></div>
          <div className="sq-result-stats">
            <div><span>Percentage</span><strong>{result.percentage ?? 0}%</strong></div>
            <div><span>Passing marks</span><strong>{result.passing_marks ?? 0}</strong></div>
            <div><span>Status</span><strong className={result.passed ? "sq-text-success" : "sq-text-danger"}>{result.passed ? "Passed" : "Not passed"}</strong></div>
          </div>
          <div className="sq-result-actions">
            <button className="sq-button sq-button-secondary" onClick={() => setReviewVisible((visible) => !visible)}>
              <Eye size={17} /> {reviewVisible ? "Hide answer review" : "Review answers"}
            </button>
            <button className="sq-button sq-button-primary" onClick={backToList}><ArrowLeft size={17} /> Back to quizzes</button>
          </div>

          {reviewVisible && (
            <div className="sq-review-list">
              <h3>Answer review</h3>
              {(result.questions || []).map((item, index) => (
                <article className="sq-review-item" key={item.question_id || index}>
                  <div className="sq-review-title">
                    <strong>Q{index + 1}. {item.question}</strong>
                    {item.is_correct ? <span className="sq-review-correct"><CheckCircle2 size={16} /> Correct</span> : <span className="sq-review-wrong"><XCircle size={16} /> Incorrect</span>}
                  </div>
                  <p>Your answer: <strong>{item.selected_option || "Not answered"}{item.selected_option && item.options?.[item.selected_option] ? ` — ${item.options[item.selected_option]}` : ""}</strong></p>
                  <p>Correct answer: <strong>{item.correct_option}{item.options?.[item.correct_option] ? ` — ${item.options[item.correct_option]}` : ""}</strong></p>
                  {item.explanation && <p className="sq-explanation">Explanation: {item.explanation}</p>}
                  <small>{item.marks_awarded ?? 0} / {item.marks ?? 1} marks</small>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
