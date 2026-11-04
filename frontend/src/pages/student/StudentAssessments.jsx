import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import "./StudentAssessments.css";

const API_BASE = "/api/ai-services/student";

function getAccessToken() {
  return (
    localStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("accessToken") ||
    ""
  );
}

async function apiRequest(path, options = {}) {
  const token = getAccessToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Please log in again.");
    }

    throw new Error(
      data.message ||
        data.detail ||
        data.error ||
        "Something went wrong. Please try again."
    );
  }

  return data;
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function getRemainingSeconds(deadline) {
  if (!deadline) return 0;

  const deadlineTime = new Date(deadline).getTime();

  if (Number.isNaN(deadlineTime)) return 0;

  return Math.max(0, Math.floor((deadlineTime - Date.now()) / 1000));
}

function StatusBadge({ status }) {
  const labels = {
    draft: "Draft",
    published: "Available",
    closed: "Closed",
    in_progress: "In progress",
    evaluated: "Completed",
    submitted: "Submitted",
    expired: "Expired",
  };

  return (
    <span className={`assessment-status assessment-status--${status}`}>
      {labels[status] || status || "Unknown"}
    </span>
  );
}

function ExamCard({ exam, onStart, onResult, busy }) {
  const attempt = exam.attempt;

  const completed =
    attempt &&
    ["evaluated", "submitted", "expired"].includes(attempt.status);

  const inProgress = attempt?.status === "in_progress";

  return (
    <article className="assessment-card">
      <div className="assessment-card__top">
        <span className="assessment-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect
              x="4"
              y="3"
              width="16"
              height="18"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <path
              d="M8 8h8M8 12h8M8 16h4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </span>

        <StatusBadge status={attempt?.status || exam.status} />
      </div>

      <div className="assessment-card__content">
        <p className="assessment-eyebrow">
          {exam.course_name || "General assessment"}
        </p>

        <h3>{exam.title}</h3>

        <p className="assessment-card__description">
          {exam.description ||
            "Test your understanding and review your results."}
        </p>
      </div>

      <div className="assessment-card__stats">
        <div>
          <span>Questions</span>
          <strong>{exam.question_count ?? "—"}</strong>
        </div>

        <div>
          <span>Duration</span>
          <strong>{exam.duration_minutes} min</strong>
        </div>

        <div>
          <span>Total marks</span>
          <strong>{exam.total_marks}</strong>
        </div>
      </div>

      <div className="assessment-card__footer">
        {completed ? (
          <button
            type="button"
            className="assessment-button assessment-button--secondary"
            onClick={() => onResult(attempt.id)}
            disabled={busy}
          >
            View result <span aria-hidden="true">→</span>
          </button>
        ) : (
          <button
            type="button"
            className="assessment-button assessment-button--primary"
            onClick={() => onStart(exam)}
            disabled={busy || (!inProgress && !exam.can_start)}
          >
            {busy
              ? "Please wait..."
              : inProgress
                ? "Resume exam"
                : "Start exam"}

            {!busy && <span aria-hidden="true">→</span>}
          </button>
        )}
      </div>
    </article>
  );
}

function QuestionCard({
  question,
  index,
  total,
  selected,
  onSelect,
}) {
  const options = [
    ["A", question.option_a],
    ["B", question.option_b],
    ["C", question.option_c],
    ["D", question.option_d],
  ];

  return (
    <section className="assessment-question">
      <div className="assessment-question__heading">
        <span className="assessment-question__number">
          Question {index + 1} of {total}
        </span>

        <span className="assessment-question__marks">
          {question.marks} {question.marks === 1 ? "mark" : "marks"}
        </span>
      </div>

      <h2>{question.text}</h2>

      <div className="assessment-options">
        {options.map(([letter, text]) => (
          <label
            key={letter}
            className={`assessment-option ${
              selected === letter ? "assessment-option--selected" : ""
            }`}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={letter}
              checked={selected === letter}
              onChange={() => onSelect(question.id, letter)}
            />

            <span className="assessment-option__letter">{letter}</span>
            <span className="assessment-option__text">{text}</span>

            <span className="assessment-option__check" aria-hidden="true">
              {selected === letter ? "✓" : ""}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function ResultPanel({ result, answers, onBack }) {
  const percentage = Number(result.percentage || 0);
  const passed = Boolean(result.passed);

  return (
    <section className="assessment-result">
      <div
        className={`assessment-result__hero ${
          passed
            ? "assessment-result__hero--passed"
            : "assessment-result__hero--failed"
        }`}
      >
        <span className="assessment-result__symbol" aria-hidden="true">
          {passed ? "✓" : "!"}
        </span>

        <p className="assessment-eyebrow">Assessment completed</p>

        <h2>{passed ? "Well done!" : "Keep practising"}</h2>

        <p>
          {passed
            ? "You achieved the required passing marks."
            : "Review your answers and keep building your skills."}
        </p>

        <div className="assessment-result__score">
          <strong>{result.score ?? 0}</strong>
          <span>/ {result.total_marks ?? 0} marks</span>
        </div>
      </div>

      <div className="assessment-result__stats">
        <div>
          <span>Percentage</span>
          <strong>{percentage.toFixed(2)}%</strong>
        </div>

        <div>
          <span>Passing marks</span>
          <strong>{result.passing_marks ?? 0}</strong>
        </div>

        <div>
          <span>Outcome</span>
          <strong
            className={
              passed ? "assessment-text-success" : "assessment-text-danger"
            }
          >
            {passed ? "Passed" : "Not passed"}
          </strong>
        </div>
      </div>

      <div className="assessment-review">
        <div className="assessment-section-heading">
          <div>
            <p className="assessment-eyebrow">Answer review</p>
            <h3>Review your responses</h3>
          </div>

          <span>{answers.length} questions</span>
        </div>

        {answers.map((answer, index) => {
          const selectedText = answer.selected_option
            ? answer[
                `option_${answer.selected_option.toLowerCase()}`
              ]
            : "Not answered";

          const correctText =
            answer[
              `option_${String(answer.correct_option).toLowerCase()}`
            ];

          const correct =
            answer.selected_option === answer.correct_option;

          return (
            <article
              className="assessment-review__item"
              key={answer.question_id}
            >
              <div className="assessment-review__title">
                <span>Question {index + 1}</span>

                <span
                  className={
                    correct
                      ? "assessment-text-success"
                      : "assessment-text-danger"
                  }
                >
                  {correct ? "Correct" : "Incorrect"}
                </span>
              </div>

              <h4>{answer.text}</h4>

              <p>
                <span>Your answer:</span> {selectedText}
              </p>

              <p>
                <span>Correct answer:</span>{" "}
                {answer.correct_option}. {correctText}
              </p>

              <p className="assessment-review__marks">
                Marks awarded: {answer.awarded_marks} / {answer.marks}
              </p>

              {answer.explanation && (
                <div className="assessment-review__explanation">
                  <strong>Explanation</strong>
                  <p>{answer.explanation}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className="assessment-button assessment-button--primary"
        onClick={onBack}
      >
        Back to assessments
      </button>
    </section>
  );
}

export default function StudentAssessments() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyExamId, setBusyExamId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [activeExam, setActiveExam] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [result, setResult] = useState(null);
  const [resultAnswers, setResultAnswers] = useState([]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [filter, setFilter] = useState("all");

  const submittedRef = useRef(false);

  // Load assessments
  const loadExams = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/exams/");
      setExams(data.results || []);
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Unable to load assessments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // Assessment timer
  useEffect(() => {
    if (!attempt?.deadline || result || confirmSubmit) {
      return undefined;
    }

    const updateTimer = () => {
      setRemainingSeconds(getRemainingSeconds(attempt.deadline));
    };

    updateTimer();

    const timerId = window.setInterval(updateTimer, 1000);

    return () => window.clearInterval(timerId);
  }, [attempt, result, confirmSubmit]);

  // Load the active assessment and its questions
  const refreshActiveExam = async (exam, attemptData) => {
    const detail = await apiRequest(`/exams/${exam.id}/`);

    setActiveExam(detail.exam || exam);
    setQuestions(detail.questions || []);
    setAttempt(attemptData || detail.attempt);
  };

  // Start or resume an assessment
  const startExam = async (exam) => {
    setBusyExamId(exam.id);
    setError("");
    setNotice("");
    setResult(null);
    setConfirmSubmit(false);
    submittedRef.current = false;

    try {
      let data;

      if (exam.attempt?.status === "in_progress") {
        data = {
          attempt: exam.attempt,
          questions: [],
        };
      } else {
        data = await apiRequest(`/exams/${exam.id}/attempts/`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      }

      const startedAttempt = data.attempt;

      if (!startedAttempt) {
        throw new Error("The server did not return an exam attempt.");
      }

      setAttempt(startedAttempt);
      setAnswers({});
      setQuestionIndex(0);

      await refreshActiveExam(exam, startedAttempt);
      setNotice("");

      toast.success(
        exam.attempt?.status === "in_progress"
          ? "Your assessment has been resumed."
          : "Assessment started. Good luck!"
      );
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Unable to start this assessment.");

      await loadExams();
    } finally {
      setBusyExamId(null);
    }
  };

  // Open assessment results
  const openResult = async (attemptId) => {
    setError("");
    setNotice("");

    try {
      const data = await apiRequest(`/attempts/${attemptId}/result/`);

      setResult(data.result);
      setResultAnswers(data.answers || []);
      setActiveExam(null);
      setAttempt(null);

      toast.success("Assessment results loaded successfully.");
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Unable to load assessment results.");
    }
  };

  // Save a selected answer in component state
  const chooseAnswer = (questionId, option) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: option,
    }));
  };

  // Submit the assessment
  const submitExam = async () => {
    if (!attempt || submitting || submittedRef.current) return;

    submittedRef.current = true;
    setSubmitting(true);
    setError("");
    setConfirmSubmit(false);

    const payload = questions.map((question) => ({
      question_id: question.id,
      selected_option: answers[question.id] || "",
    }));

    try {
      await apiRequest(`/attempts/${attempt.id}/submit/`, {
        method: "POST",
        body: JSON.stringify({ answers: payload }),
      });

      const data = await apiRequest(`/attempts/${attempt.id}/result/`);

      setResult(data.result);
      setResultAnswers(data.answers || []);
      setActiveExam(null);
      setAttempt(null);
      setQuestions([]);

      toast.success("Your assessment has been submitted successfully.");

      await loadExams();
    } catch (err) {
      submittedRef.current = false;
      setError(err.message);

      toast.error(err.message || "Unable to submit your assessment.");
    } finally {
      setSubmitting(false);
    }
  };

  // Exit the current assessment
  const leaveExam = () => {
    toast.info(
      "You left the assessment. Your progress may not be submitted."
    );

    setActiveExam(null);
    setAttempt(null);
    setQuestions([]);
    setAnswers({});
    setQuestionIndex(0);
    setConfirmSubmit(false);
    setError("");
    setNotice("");
    submittedRef.current = false;

    loadExams();
  };

  // Return to the assessment list
  const returnToList = () => {
    setResult(null);
    setResultAnswers([]);
    setError("");
    setNotice("");

    loadExams();
  };

  // Assessment filters
  const filteredExams = exams.filter((exam) => {
    if (filter === "all") return true;

    if (filter === "available") {
      return !exam.attempt && exam.can_start;
    }

    if (filter === "in_progress") {
      return exam.attempt?.status === "in_progress";
    }

    if (filter === "completed") {
      return ["evaluated", "submitted", "expired"].includes(
        exam.attempt?.status
      );
    }

    return true;
  });

  // Active assessment screen
  if (activeExam && attempt && questions.length > 0) {
    const currentQuestion = questions[questionIndex];

    const answeredCount = questions.filter((question) =>
      Boolean(answers[question.id])
    ).length;

    return (
      <main className="student-assessments">
        <div className="assessment-exam-header">
          <button
            type="button"
            className="assessment-back-button"
            onClick={() => setConfirmSubmit(true)}
          >
            ← Exit exam
          </button>

          <div className="assessment-exam-header__title">
            <p className="assessment-eyebrow">
              {activeExam.course_name}
            </p>
            <h1>{activeExam.title}</h1>
          </div>

          <div
            className={`assessment-timer ${
              remainingSeconds <= 60
                ? "assessment-timer--warning"
                : ""
            }`}
          >
            <span aria-hidden="true">◷</span>

            <div>
              <span>Time remaining</span>
              <strong>{formatTime(remainingSeconds)}</strong>
            </div>
          </div>
        </div>

        {error && (
          <div className="assessment-alert assessment-alert--error">
            {error}
          </div>
        )}

        {remainingSeconds === 0 && (
          <div className="assessment-alert assessment-alert--error">
            Your exam time has expired. Submit your answers if the server
            still allows it, or return to the assessment list.

            <button type="button" onClick={leaveExam}>
              Return to assessments
            </button>
          </div>
        )}

        <div className="assessment-exam-layout">
          <div className="assessment-exam-main">
            <div className="assessment-progress">
              <div className="assessment-progress__labels">
                <span>Exam progress</span>
                <strong>
                  {answeredCount} of {questions.length} answered
                </strong>
              </div>

              <div className="assessment-progress__track">
                <div
                  className="assessment-progress__fill"
                  style={{
                    width: `${
                      (answeredCount / questions.length) * 100
                    }%`,
                  }}
                />
              </div>
            </div>

            <QuestionCard
              question={currentQuestion}
              index={questionIndex}
              total={questions.length}
              selected={answers[currentQuestion.id] || ""}
              onSelect={chooseAnswer}
            />

            <div className="assessment-question-nav">
              <button
                type="button"
                className="assessment-button assessment-button--secondary"
                disabled={questionIndex === 0}
                onClick={() =>
                  setQuestionIndex((index) => index - 1)
                }
              >
                ← Previous
              </button>

              {questionIndex < questions.length - 1 ? (
                <button
                  type="button"
                  className="assessment-button assessment-button--primary"
                  onClick={() =>
                    setQuestionIndex((index) => index + 1)
                  }
                >
                  Next question →
                </button>
              ) : (
                <button
                  type="button"
                  className="assessment-button assessment-button--primary"
                  onClick={() => setConfirmSubmit(true)}
                  disabled={submitting}
                >
                  Submit exam
                </button>
              )}
            </div>
          </div>

          <aside className="assessment-question-sidebar">
            <div className="assessment-section-heading">
              <div>
                <p className="assessment-eyebrow">Navigation</p>
                <h3>Questions</h3>
              </div>

              <span>{questions.length}</span>
            </div>

            <div className="assessment-question-grid">
              {questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  className={[
                    "assessment-question-grid__item",
                    index === questionIndex ? "is-current" : "",
                    answers[question.id] ? "is-answered" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setQuestionIndex(index)}
                  aria-label={`Go to question ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <div className="assessment-legend">
              <span>
                <i className="assessment-legend__dot is-answered" />
                Answered
              </span>

              <span>
                <i className="assessment-legend__dot is-current" />
                Current
              </span>

              <span>
                <i className="assessment-legend__dot" />
                Unanswered
              </span>
            </div>

            <button
              type="button"
              className="assessment-button assessment-button--primary assessment-button--full"
              onClick={() => setConfirmSubmit(true)}
              disabled={submitting}
            >
              Submit exam
            </button>
          </aside>
        </div>

        {confirmSubmit && (
          <div
            className="assessment-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setConfirmSubmit(false);
              }
            }}
          >
            <section
              className="assessment-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="assessment-submit-title"
            >
              <span className="assessment-modal__icon">?</span>

              <h2 id="assessment-submit-title">
                Submit your exam?
              </h2>

              <p>
                You answered {answeredCount} of {questions.length} questions.
                Unanswered questions will receive zero marks. You cannot
                retake this exam after submission.
              </p>

              <div className="assessment-modal__actions">
                <button
                  type="button"
                  className="assessment-button assessment-button--secondary"
                  onClick={() => setConfirmSubmit(false)}
                  disabled={submitting}
                >
                  Continue exam
                </button>

                <button
                  type="button"
                  className="assessment-button assessment-button--primary"
                  onClick={submitExam}
                  disabled={submitting}
                >
                  {submitting
                    ? "Submitting..."
                    : "Confirm submission"}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    );
  }

  // Assessment results screen
  if (result) {
    return (
      <main className="student-assessments">
        <div className="assessment-page-heading">
          <button
            type="button"
            className="assessment-back-button"
            onClick={returnToList}
          >
            ← All assessments
          </button>

          <p className="assessment-eyebrow">Your performance</p>

          <h1>{result.exam_title || "Assessment results"}</h1>
        </div>

        {error && (
          <div className="assessment-alert assessment-alert--error">
            {error}
          </div>
        )}

        <ResultPanel
          result={result}
          answers={resultAnswers}
          onBack={returnToList}
        />
      </main>
    );
  }

  // Assessment listing screen
  return (
    <main className="student-assessments">
      <header className="assessment-page-heading">
        <div>
          <p className="assessment-eyebrow">
            LEARNING CENTER / ASSESSMENTS
          </p>

          <h1>Assessments</h1>

          <p className="assessment-page-subtitle">
            Challenge yourself, track your progress, and review your
            performance.
          </p>
        </div>

        <button
          type="button"
          className="assessment-button assessment-button--secondary"
          onClick={() => {
            toast.info("Refreshing assessments...");
            loadExams();
          }}
          disabled={loading}
        >
          <span aria-hidden="true">↻</span> Refresh
        </button>
      </header>

      <section className="assessment-welcome">
        <div>
          <span className="assessment-welcome__tag">
            YOUR LEARNING JOURNEY
          </span>

          <h2>Ready to test your knowledge?</h2>

          <p>
            Choose an assessment, complete the questions before time runs
            out, and review your results when you're done.
          </p>
        </div>

        <div
          className="assessment-welcome__art"
          aria-hidden="true"
        >
          <div className="assessment-welcome__circle assessment-welcome__circle--one" />
          <div className="assessment-welcome__circle assessment-welcome__circle--two" />

          <div className="assessment-welcome__paper">
            <span>✓</span>
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>

      <section className="assessment-overview">
        <article className="assessment-overview__card">
          <span className="assessment-overview__icon">▤</span>

          <div>
            <span>Total assessments</span>
            <strong>{exams.length}</strong>
          </div>
        </article>

        <article className="assessment-overview__card">
          <span className="assessment-overview__icon">◷</span>

          <div>
            <span>In progress</span>

            <strong>
              {
                exams.filter(
                  (exam) =>
                    exam.attempt?.status === "in_progress"
                ).length
              }
            </strong>
          </div>
        </article>

        <article className="assessment-overview__card">
          <span className="assessment-overview__icon">✓</span>

          <div>
            <span>Completed</span>

            <strong>
              {
                exams.filter((exam) =>
                  ["evaluated", "submitted", "expired"].includes(
                    exam.attempt?.status
                  )
                ).length
              }
            </strong>
          </div>
        </article>
      </section>

      <section className="assessment-list-section">
        <div className="assessment-section-heading">
          <div>
            <p className="assessment-eyebrow">ASSESSMENT CENTER</p>
            <h2>Your assessments</h2>
          </div>

          <div className="assessment-filter">
            <label htmlFor="assessment-filter">Show</label>

            <select
              id="assessment-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All assessments</option>
              <option value="available">Available</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="assessment-alert assessment-alert--error">
            <span>{error}</span>

            <button type="button" onClick={loadExams}>
              Try again
            </button>
          </div>
        )}

        {notice && (
          <div className="assessment-alert assessment-alert--success">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="assessment-empty">
            <div className="assessment-spinner" />
            <h3>Loading assessments...</h3>
            <p>Fetching the latest published exams.</p>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="assessment-empty">
            <span className="assessment-empty__icon">▤</span>

            <h3>
              {exams.length === 0
                ? "No published assessments yet"
                : "No assessments in this category"}
            </h3>

            <p>
              {exams.length === 0
                ? "Published exams will appear here when your mentor or administrator makes them available."
                : "Try selecting another filter to see your assessments."}
            </p>

            <button
              type="button"
              className="assessment-button assessment-button--secondary"
              onClick={() => {
                toast.info("Refreshing assessments...");
                loadExams();
              }}
            >
              Refresh assessments
            </button>
          </div>
        ) : (
          <div className="assessment-grid">
            {filteredExams.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                busy={busyExamId === exam.id}
                onStart={startExam}
                onResult={openResult}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}