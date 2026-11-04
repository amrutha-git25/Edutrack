
import { useMemo, useState } from "react";
import {
  Sparkles, RefreshCw, Plus, Trash2, Save,
  ArrowLeft, CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  generateAIExamQuestions,
  createMentorExam,
} from "../../api/mentorApi";
import "./AIExamBuilder.css";

const emptyQuestion = () => ({
  text: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_option: "A",
  marks: 1,
  topic: "",
  difficulty: "Medium",
  explanation: "",
});

function getError(error) {
  const data = error?.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  if (data && typeof data === "object") {
    return Object.entries(data)
      .map(([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.join(", ") : value}`
      )
      .join(" ");
  }
  return error?.message || "Something went wrong. Please try again.";
}

export default function AIExamBuilder({ onBack, onSaved }) {
  const [form, setForm] = useState({
    title: "",
    course_name: "",
    topics: "",
    description: "",
    difficulty: "Medium",
    question_count: 10,
    duration_minutes: 30,
    passing_marks: 5,
  });

  const [questions, setQuestions] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const totalMarks = useMemo(
    () => questions.reduce(
      (sum, q) => sum + Math.max(0, Number(q.marks) || 0),
      0
    ),
    [questions]
  );

  function changeForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function changeQuestion(index, field, value) {
    setQuestions((current) =>
      current.map((question, i) =>
        i === index ? { ...question, [field]: value } : question
      )
    );
  }

  async function generateQuestions(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setGenerating(true);

    try {
      const data = await generateAIExamQuestions({
        course_name: form.course_name.trim(),
        topics: form.topics.trim(),
        difficulty: form.difficulty,
        question_count: Number(form.question_count),
        question_type: "MCQ",
      });

      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error("The AI did not return any questions.");
      }

      const generated = data.questions.map((question) => ({
        ...emptyQuestion(),
        ...question,
      }));

      setQuestions(generated);
      setForm((current) => ({
        ...current,
        title: current.title.trim()
          ? current.title
          : `${current.course_name} - AI Assessment`,
        passing_marks: Math.min(
          Number(current.passing_marks),
          generated.reduce((sum, q) => sum + Number(q.marks || 1), 0)
        ),
      }));

      setNotice(
        `${generated.length} questions generated. Review every answer before saving.`
      );
    } catch (err) {
      setError(getError(err));
    } finally {
      setGenerating(false);
    }
  }

  async function regenerate() {
    if (!window.confirm("Replace these questions with a newly generated set?")) {
      return;
    }
    await generateQuestions({ preventDefault() {} });
  }

  function addQuestion() {
    setQuestions((current) => [...current, emptyQuestion()]);
  }

  function removeQuestion(index) {
    setQuestions((current) => current.filter((_, i) => i !== index));
  }

  async function saveDraft(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!questions.length) {
      setError("Generate or add at least one question first.");
      return;
    }

    if (!form.title.trim() || !form.course_name.trim()) {
      setError("Exam title and course title are required.");
      return;
    }

    const invalidIndex = questions.findIndex((q) =>
      !q.text.trim() ||
      !q.option_a.trim() ||
      !q.option_b.trim() ||
      !q.option_c.trim() ||
      !q.option_d.trim() ||
      !["A", "B", "C", "D"].includes(
        String(q.correct_option).toUpperCase()
      ) ||
      !Number.isInteger(Number(q.marks)) ||
      Number(q.marks) < 1
    );

    if (invalidIndex !== -1) {
      setError(`Please check all required fields in Question ${invalidIndex + 1}.`);
      return;
    }

    if (
      Number(form.passing_marks) < 0 ||
      Number(form.passing_marks) > totalMarks
    ) {
      setError(`Passing marks must be between 0 and ${totalMarks}.`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        course_name: form.course_name.trim(),
        description: form.description.trim() ||
          `AI-generated assessment covering ${form.topics.trim()}`,
        duration_minutes: Number(form.duration_minutes),
        passing_marks: Number(form.passing_marks),
        questions: questions.map((q) => ({
          ...q,
          text: q.text.trim(),
          correct_option: String(q.correct_option).toUpperCase(),
          marks: Number(q.marks),
        })),
      };

      await createMentorExam(payload);

      setNotice("Exam saved as a draft. Publish it from Online Exams when ready.");
      setQuestions([]);

      if (onSaved) await onSaved();
    } catch (err) {
      setError(getError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="aieb-page">
      <button type="button" className="aieb-back" onClick={onBack}>
        <ArrowLeft size={17} /> Back to exams
      </button>

      <header className="aieb-hero">
        <span className="aieb-hero-icon"><Sparkles size={28} /></span>
        <div>
          <span className="aieb-eyebrow">EDUTRACK AI</span>
          <h1>AI Exam Builder</h1>
          <p>Generate course-based questions, review them and save your assessment.</p>
        </div>
      </header>

      {error && (
        <div className="aieb-alert aieb-error" role="alert">
          <AlertCircle size={18} /><span>{error}</span>
          <button type="button" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {notice && (
        <div className="aieb-alert aieb-success" role="status">
          <CheckCircle2 size={18} /><span>{notice}</span>
        </div>
      )}

      <form className="aieb-card" onSubmit={generateQuestions}>
        <div className="aieb-section-title">
          <span>STEP 01</span>
          <h2>Exam requirements</h2>
          <p>Describe the topics and choose how you want AI to generate the exam.</p>
        </div>

        <div className="aieb-grid">
          <label className="aieb-field">
            Course title *
            <input
              name="course_name"
              value={form.course_name}
              onChange={changeForm}
              placeholder="Exact assigned course title"
              required
            />
          </label>

          <label className="aieb-field">
            Exam title *
            <input
              name="title"
              value={form.title}
              onChange={changeForm}
              placeholder="e.g. Data Structures Unit Test"
              maxLength={200}
              required
            />
          </label>

          <label className="aieb-field aieb-full">
            Topics to cover *
            <textarea
              name="topics"
              value={form.topics}
              onChange={changeForm}
              placeholder="e.g. Arrays, linked lists, stacks and queues"
              rows={3}
              required
            />
          </label>

          <label className="aieb-field">
            Difficulty
            <select name="difficulty" value={form.difficulty} onChange={changeForm}>
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
              <option>Mixed</option>
            </select>
          </label>

          <label className="aieb-field">
            Number of questions
            <select
              name="question_count"
              value={form.question_count}
              onChange={changeForm}
            >
              {[5, 10, 15, 20, 25, 30].map((n) => (
                <option key={n} value={n}>{n} questions</option>
              ))}
            </select>
          </label>

          <label className="aieb-field">
            Duration (minutes)
            <input
              type="number"
              name="duration_minutes"
              min="1"
              max="300"
              value={form.duration_minutes}
              onChange={changeForm}
              required
            />
          </label>

          <label className="aieb-field">
            Passing marks
            <input
              type="number"
              name="passing_marks"
              min="0"
              value={form.passing_marks}
              onChange={changeForm}
              required
            />
          </label>

          <label className="aieb-field aieb-full">
            Instructions (optional)
            <textarea
              name="description"
              value={form.description}
              onChange={changeForm}
              rows={2}
              placeholder="Instructions students should read before starting..."
            />
          </label>
        </div>

        <button className="aieb-generate" type="submit" disabled={generating}>
          {generating
            ? <><RefreshCw className="aieb-spin" size={18} /> Generating with OpenRouter...</>
            : <><Sparkles size={18} /> Generate questions with AI</>}
        </button>
      </form>

      {questions.length > 0 && (
        <form className="aieb-card" onSubmit={saveDraft}>
          <div className="aieb-section-title">
            <span>STEP 02</span>
            <h2>Review generated questions</h2>
            <p>Correct the wording, options and answer keys before saving.</p>
          </div>

          <div className="aieb-summary">
            <span><strong>{questions.length}</strong> questions</span>
            <span><strong>{totalMarks}</strong> total marks</span>
            <span><strong>{form.duration_minutes}</strong> minutes</span>
          </div>

          {questions.map((q, index) => (
            <article className="aieb-question" key={index}>
              <div className="aieb-question-header">
                <strong>Question {index + 1}</strong>
                <button
                  type="button"
                  className="aieb-remove"
                  onClick={() => removeQuestion(index)}
                >
                  <Trash2 size={15} /> Remove
                </button>
              </div>

              <label className="aieb-field">
                Question text *
                <textarea
                  rows={2}
                  value={q.text}
                  onChange={(e) => changeQuestion(index, "text", e.target.value)}
                  required
                />
              </label>

              <div className="aieb-grid aieb-options">
                {["a", "b", "c", "d"].map((letter) => (
                  <label className="aieb-field" key={letter}>
                    Option {letter.toUpperCase()} *
                    <input
                      value={q[`option_${letter}`]}
                      onChange={(e) =>
                        changeQuestion(index, `option_${letter}`, e.target.value)
                      }
                      required
                    />
                  </label>
                ))}
              </div>

              <div className="aieb-grid aieb-question-meta">
                <label className="aieb-field">
                  Correct answer
                  <select
                    value={q.correct_option}
                    onChange={(e) => changeQuestion(index, "correct_option", e.target.value)}
                  >
                    {["A", "B", "C", "D"].map((letter) => (
                      <option key={letter} value={letter}>{letter}</option>
                    ))}
                  </select>
                </label>

                <label className="aieb-field">
                  Marks
                  <input
                    type="number"
                    min="1"
                    value={q.marks}
                    onChange={(e) => changeQuestion(index, "marks", e.target.value)}
                    required
                  />
                </label>

                <label className="aieb-field">
                  Difficulty
                  <select
                    value={q.difficulty}
                    onChange={(e) => changeQuestion(index, "difficulty", e.target.value)}
                  >
                    {["Easy", "Medium", "Hard"].map((level) => (
                      <option key={level}>{level}</option>
                    ))}
                  </select>
                </label>

                <label className="aieb-field">
                  Topic
                  <input
                    value={q.topic || ""}
                    onChange={(e) => changeQuestion(index, "topic", e.target.value)}
                  />
                </label>

                <label className="aieb-field aieb-full">
                  Explanation
                  <textarea
                    rows={2}
                    value={q.explanation || ""}
                    onChange={(e) => changeQuestion(index, "explanation", e.target.value)}
                  />
                </label>
              </div>
            </article>
          ))}

          <div className="aieb-actions">
            <button type="button" className="aieb-secondary" onClick={addQuestion}>
              <Plus size={17} /> Add question
            </button>
            <button type="button" className="aieb-secondary" onClick={regenerate} disabled={generating}>
              <RefreshCw size={16} /> Regenerate all
            </button>
            <button type="submit" className="aieb-save" disabled={saving}>
              <Save size={17} /> {saving ? "Saving..." : "Save as draft"}
            </button>
          </div>

          <p className="aieb-footnote">
            AI content can contain errors. Verify the answer keys before publishing.
          </p>
        </form>
      )}
    </main>
  );
}
