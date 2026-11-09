import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Toaster, toast } from "sonner";
import "./AIExamGenerator.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com/api"
).replace(/\/+$/, "") + "/ai-services";

const initialForm = {
  course: "Python Programming",
  topics: "Functions, OOP, Exception Handling",
  difficulty: "Mixed",
  question_type: "MCQ",
  count: 20,
  duration_minutes: 30,
};

function getToken() {
  return (
    localStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    sessionStorage.getItem("access_token")
  );
}

function getErrorText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(getErrorText).join(", ");

  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, message]) => `${key}: ${getErrorText(message)}`)
      .join("\n");
  }

  return "";
}

async function apiRequest(path, body) {
  const token = getToken();

  if (!token) {
    throw new Error("Please log in again. Your access token was not found.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = getErrorText(
      data.detail || data.error || data.message
    );

    const fieldErrors = Object.entries(data)
      .filter(
        ([key]) =>
          !["detail", "error", "message"].includes(key)
      )
      .map(([key, value]) => `${key}: ${getErrorText(value)}`)
      .filter(Boolean)
      .join("\n");

    throw new Error(
      [detail, fieldErrors].filter(Boolean).join("\n") ||
        `Request failed with status ${response.status}.`
    );
  }

  if (data?.success === false) {
    throw new Error(
      getErrorText(data.message || data.error) ||
        "The server could not complete the request."
    );
  }

  return data;
}

export default function AIExamGenerator() {
  const [form, setForm] = useState(initialForm);
  const [questions, setQuestions] = useState([]);
  const [generated, setGenerated] = useState(false);
  const [examTitle, setExamTitle] = useState(
    "Python Programming — AI Assessment"
  );
  const [description, setDescription] = useState(
    "AI-generated practice assessment covering Functions, OOP, and Exception Handling."
  );
  const [passingMarks, setPassingMarks] = useState("10");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalMarks = useMemo(
    () =>
      questions.reduce(
        (sum, question) => sum + (Number(question.marks) || 0),
        0
      ),
    [questions]
  );

  function updateForm(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function updateQuestion(index, field, value) {
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === index
          ? { ...question, [field]: value }
          : question
      )
    );
  }

  function removeQuestion(index) {
    const questionNumber = index + 1;

    setQuestions((previous) =>
      previous.filter((_, i) => i !== index)
    );

    toast.info(`Question ${questionNumber} removed from the review list.`);
  }

  async function generateQuestions(event) {
    event.preventDefault();

    if (loading) return;

    const course = form.course.trim();
    const topics = form.topics
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean);

    const count = Number(form.count);
    const duration = Number(form.duration_minutes);

    if (!course) {
      toast.warning("Please enter a course name.");
      return;
    }

    if (!topics.length) {
      toast.warning("Enter at least one topic, separated by commas.");
      return;
    }

    if (!Number.isInteger(count) || count < 1 || count > 50) {
      toast.warning("Choose between 1 and 50 questions.");
      return;
    }

    if (
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 300
    ) {
      toast.warning("Exam duration must be between 1 and 300 minutes.");
      return;
    }

    setLoading(true);

    const toastId = toast.loading("Generating exam questions with AI...");

    try {
      const result = await apiRequest("/exams/generate/", {
        course,
        topics,
        difficulty: form.difficulty,
        question_type: form.question_type,
        count,
        duration_minutes: duration,
      });

      if (!Array.isArray(result.questions) || !result.questions.length) {
        throw new Error(
          "The API did not return any questions. Try different topics or generate again."
        );
      }

      const newQuestions = result.questions.map((question, index) => ({
        ...question,
        _reviewId: `${Date.now()}-${index}`,
        marks: Number(question.marks) || 1,
        correct_option: String(question.correct_option || "").toUpperCase(),
      }));

      setQuestions(newQuestions);
      setGenerated(true);
      setPassingMarks((previous) => {
        const marks = newQuestions.reduce(
          (sum, question) => sum + (Number(question.marks) || 0),
          0
        );

        const current = Number(previous);
        return Number.isInteger(current) && current <= marks
          ? previous
          : String(Math.min(10, marks));
      });

      toast.success(
        `${newQuestions.length} question(s) generated successfully. Review them before saving.`,
        {
          id: toastId,
          duration: 5000,
        }
      );
    } catch (error) {
      console.error("AI Question Generation Error:", error);

      toast.error(
        error.message || "Unable to generate questions. Please try again.",
        {
          id: toastId,
          duration: 6000,
        }
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveDraft() {
    if (saving) return;

    if (!generated || !questions.length) {
      toast.warning("Generate and review questions before saving.");
      return;
    }

    if (!examTitle.trim()) {
      toast.warning("Please enter an exam title.");
      return;
    }

    if (!form.course.trim()) {
      toast.warning("Please enter a course name.");
      return;
    }

    if (!Number.isInteger(Number(form.duration_minutes)) ||
        Number(form.duration_minutes) < 1) {
      toast.warning("Enter a valid exam duration.");
      return;
    }

    const invalidIndex = questions.findIndex((question) => {
      const options = [
        question.option_a,
        question.option_b,
        question.option_c,
        question.option_d,
      ].map((option) => String(option || "").trim());

      return (
        !String(question.text || "").trim() ||
        options.some((option) => !option) ||
        new Set(options.map((option) => option.toLowerCase())).size !== 4 ||
        !["A", "B", "C", "D"].includes(
          String(question.correct_option || "").toUpperCase()
        ) ||
        !Number.isInteger(Number(question.marks)) ||
        Number(question.marks) < 1
      );
    });

    if (invalidIndex !== -1) {
      toast.error(
        `Question ${invalidIndex + 1} needs question text, four distinct options, a valid correct answer, and positive whole-number marks.`,
        { duration: 6000 }
      );
      return;
    }

    const passing = Number(passingMarks);

    if (
      !Number.isInteger(passing) ||
      passing < 0 ||
      passing > totalMarks
    ) {
      toast.warning(
        `Passing marks must be a whole number between 0 and ${totalMarks}.`
      );
      return;
    }

    setSaving(true);

    const toastId = toast.loading("Saving exam as a draft...");

    try {
      const payload = {
        title: examTitle.trim(),
        description: description.trim(),
        course_name: form.course.trim(),
        duration_minutes: Number(form.duration_minutes),
        passing_marks: passing,
        questions: questions.map(
          ({
            text,
            option_a,
            option_b,
            option_c,
            option_d,
            correct_option,
            marks,
            explanation,
            difficulty,
            topic,
          }) => ({
            text: String(text).trim(),
            option_a: String(option_a).trim(),
            option_b: String(option_b).trim(),
            option_c: String(option_c).trim(),
            option_d: String(option_d).trim(),
            correct_option: String(correct_option).toUpperCase(),
            marks: Number(marks),
            explanation: explanation || "",
            difficulty: difficulty || "Medium",
            topic: topic || "",
          })
        ),
      };

      const result = await apiRequest("/exams/save/", payload);

      const examId = result.exam_id ?? result.id;

      toast.success(
        examId != null
          ? `Exam draft saved successfully. Exam ID: ${examId}.`
          : "Exam draft saved successfully.",
        {
          id: toastId,
          duration: 5000,
        }
      );

      setGenerated(false);
      setQuestions([]);
    } catch (error) {
      console.error("Save Exam Draft Error:", error);

      toast.error(
        error.message || "Unable to save the exam draft.",
        {
          id: toastId,
          duration: 6000,
        }
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="aig-page">
      <Toaster
        position="top-right"
        duration={3500}
        richColors
        closeButton
        visibleToasts={4}
      />

      <header className="aig-header">
        <div>
          <Link to="/admin/exams" className="aig-back">
            ← Back to Online Exams
          </Link>

          <p className="aig-eyebrow">EDUTRACK · ASSESSMENTS</p>

          <h1>AI Exam Generator</h1>

          <p className="aig-subtitle">
            Generate, review, edit, and save exam questions with OpenRouter.
          </p>
        </div>

        <div className="aig-ai-badge">
          <span>✦</span> AI powered
        </div>
      </header>

      <form className="aig-config" onSubmit={generateQuestions}>
        <div className="aig-section-heading">
          <div>
            <span className="aig-step">01</span>
            <h2>Exam configuration</h2>
          </div>

          <span className="aig-muted">Configure your question set</span>
        </div>

        <div className="aig-form-grid">
          <label className="aig-field">
            <span>Course name</span>
            <input
              name="course"
              value={form.course}
              onChange={updateForm}
              required
              maxLength={200}
            />
          </label>

          <label className="aig-field">
            <span>Difficulty</span>
            <select
              name="difficulty"
              value={form.difficulty}
              onChange={updateForm}
            >
              <option value="Mixed">Mixed</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </label>

          <label className="aig-field aig-field-full">
            <span>Topics</span>
            <input
              name="topics"
              value={form.topics}
              onChange={updateForm}
              placeholder="Functions, OOP, Exception Handling"
              required
            />
            <small>Separate topics with commas.</small>
          </label>

          <label className="aig-field">
            <span>Question type</span>
            <select
              name="question_type"
              value={form.question_type}
              onChange={updateForm}
            >
              <option value="MCQ">Multiple choice (MCQ)</option>
            </select>
          </label>

          <label className="aig-field">
            <span>Number of questions</span>
            <input
              name="count"
              type="number"
              min="1"
              max="50"
              value={form.count}
              onChange={updateForm}
              required
            />
          </label>

          <label className="aig-field">
            <span>Duration (minutes)</span>
            <input
              name="duration_minutes"
              type="number"
              min="1"
              max="300"
              value={form.duration_minutes}
              onChange={updateForm}
              required
            />
          </label>
        </div>

        <div className="aig-config-footer">
          <p>
            <span className="aig-status-dot" />
            Generated questions remain unsaved until you save the draft.
          </p>

          <button
            className="aig-button aig-button-primary"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="aig-spinner" /> Generating…
              </>
            ) : (
              <>✦ Generate questions</>
            )}
          </button>
        </div>
      </form>

      {generated && (
        <section className="aig-review">
          <div className="aig-section-heading">
            <div>
              <span className="aig-step">02</span>
              <h2>Review questions</h2>
            </div>

            <span className="aig-count-pill">
              {questions.length} questions
            </span>
          </div>

          <div className="aig-review-summary">
            <div>
              <span>Questions</span>
              <strong>{questions.length}</strong>
            </div>

            <div>
              <span>Total marks</span>
              <strong>{totalMarks}</strong>
            </div>

            <div>
              <span>Duration</span>
              <strong>{form.duration_minutes} min</strong>
            </div>
          </div>

          <div className="aig-exam-details">
            <label className="aig-field">
              <span>Exam title</span>
              <input
                value={examTitle}
                onChange={(event) => setExamTitle(event.target.value)}
                required
              />
            </label>

            <label className="aig-field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
              />
            </label>

            <label className="aig-field">
              <span>Passing marks (max {totalMarks})</span>
              <input
                type="number"
                min="0"
                max={totalMarks}
                value={passingMarks}
                onChange={(event) => setPassingMarks(event.target.value)}
                required
              />
            </label>
          </div>

          {questions.map((question, index) => (
            <article
              className="aig-question-card"
              key={question._reviewId}
            >
              <div className="aig-question-top">
                <div className="aig-question-number">
                  Q{String(index + 1).padStart(2, "0")}
                </div>

                <div className="aig-question-tags">
                  <span>{question.topic || "General"}</span>
                  <span>{question.difficulty || "Medium"}</span>
                </div>

                <button
                  type="button"
                  className="aig-remove"
                  onClick={() => removeQuestion(index)}
                  aria-label={`Remove question ${index + 1}`}
                >
                  Remove
                </button>
              </div>

              <label className="aig-field">
                <span>Question</span>
                <textarea
                  rows={3}
                  value={question.text || ""}
                  onChange={(event) =>
                    updateQuestion(index, "text", event.target.value)
                  }
                />
              </label>

              <div className="aig-options-grid">
                {["a", "b", "c", "d"].map((letter) => (
                  <label className="aig-field" key={letter}>
                    <span>Option {letter.toUpperCase()}</span>
                    <input
                      value={question[`option_${letter}`] || ""}
                      onChange={(event) =>
                        updateQuestion(
                          index,
                          `option_${letter}`,
                          event.target.value
                        )
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="aig-question-bottom">
                <label className="aig-field">
                  <span>Correct answer</span>
                  <select
                    value={question.correct_option || ""}
                    onChange={(event) =>
                      updateQuestion(
                        index,
                        "correct_option",
                        event.target.value
                      )
                    }
                  >
                    <option value="">Select answer</option>
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </label>

                <label className="aig-field aig-marks-field">
                  <span>Marks</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={question.marks}
                    onChange={(event) =>
                      updateQuestion(index, "marks", event.target.value)
                    }
                  />
                </label>

                <label className="aig-field">
                  <span>Difficulty</span>
                  <select
                    value={question.difficulty || "Medium"}
                    onChange={(event) =>
                      updateQuestion(
                        index,
                        "difficulty",
                        event.target.value
                      )
                    }
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </label>
              </div>

              <label className="aig-field aig-explanation">
                <span>Answer explanation</span>
                <textarea
                  rows={2}
                  value={question.explanation || ""}
                  onChange={(event) =>
                    updateQuestion(
                      index,
                      "explanation",
                      event.target.value
                    )
                  }
                />
              </label>
            </article>
          ))}

          {questions.length === 0 && (
            <p className="aig-empty">
              No questions remain. Generate another set to continue.
            </p>
          )}

          <div className="aig-save-bar">
            <div>
              <strong>Ready to save?</strong>
              <p>The exam will be saved as a draft, not published.</p>
            </div>

            <button
              type="button"
              className="aig-button aig-button-primary"
              onClick={saveDraft}
              disabled={saving || questions.length === 0}
            >
              {saving ? "Saving…" : "Save as draft →"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
