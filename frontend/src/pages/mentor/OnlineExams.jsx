
import { useCallback, useEffect, useMemo, useState } from "react";
import AIExamBuilder from "./AIExamBuilder";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  ClipboardList,
  Clock3,
  CircleCheck,
  CircleAlert,
  FilePenLine,
  Trash2,
  Eye,
  X,
  Save,
  Send,
  LockKeyhole,
  Trophy,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import {
  getMentorExams,
  createMentorExam,
  updateMentorExam,
  deleteMentorExam,
  updateMentorExamAvailability,
  getMentorExamResults,
} from "../../api/mentorApi";
import "./OnlineExams.css";

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

const emptyExam = () => ({
  title: "",
  description: "",
  course_name: "",
  duration_minutes: 30,
  passing_marks: 5,
  questions: [emptyQuestion()],
});

function errorMessage(error) {
  const data = error?.response?.data;

  if (typeof data?.message === "string") {
    return data.message;
  }

  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (data && typeof data === "object") {
    return Object.entries(data)
      .map(([key, value]) => {
        const formattedValue = Array.isArray(value)
          ? value.join(", ")
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);

        return `${key}: ${formattedValue}`;
      })
      .join(" ");
  }

  return error?.message || "Something went wrong. Please try again.";
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function statusClass(status) {
  return `oe-status oe-status-${String(status || "draft").toLowerCase()}`;
}

export default function OnlineExams() {
  const [exams, setExams] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 3;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyExam());
  const [results, setResults] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [showAIBuilder, setShowAIBuilder] = useState(false);

  // Load mentor exams
  const loadExams = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getMentorExams();

      setExams(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = errorMessage(err);

      setError(message);

      toast.error("Unable to load exams", {
        description: message,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // Search and filter exams
  const filteredExams = useMemo(() => {
    const query = search.trim().toLowerCase();

    return exams.filter((exam) => {
      const matchesSearch =
        !query ||
        [exam.title, exam.course_name, exam.description].some((value) =>
          String(value || "").toLowerCase().includes(query)
        );

      return (
        matchesSearch &&
        (statusFilter === "all" || exam.status === statusFilter)
      );
    });
  }, [exams, search, statusFilter]);

  // Pagination: display three exams per page.
  const totalPages = Math.max(1, Math.ceil(filteredExams.length / ITEMS_PER_PAGE));
  const paginatedExams = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredExams.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredExams, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Dashboard statistics
  const stats = useMemo(
    () => ({
      total: exams.length,
      published: exams.filter((exam) => exam.status === "published").length,
      drafts: exams.filter((exam) => exam.status === "draft").length,
      closed: exams.filter((exam) => exam.status === "closed").length,
    }),
    [exams]
  );

  // Open create exam modal
  function openCreate() {
    setEditingId(null);
    setForm(emptyExam());
    setError("");
    setNotice("");
    setModal("form");
  }

  // Open edit exam modal
  function openEdit(exam) {
    setEditingId(exam.id);

    setForm({
      title: exam.title || "",
      description: exam.description || "",
      course_name: exam.course_name || "",
      duration_minutes: exam.duration_minutes || 30,
      passing_marks: exam.passing_marks ?? 0,
      questions: (exam.questions || []).map((question) => ({
        ...emptyQuestion(),
        ...question,
        correct_option: question.correct_option || "A",
      })),
    });

    setError("");
    setNotice("");
    setModal("form");
  }

  // Update exam fields
  function setExamField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  // Update individual question fields
  function setQuestionField(index, field, value) {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, i) =>
        i === index
          ? {
              ...question,
              [field]: value,
            }
          : question
      ),
    }));
  }

  // Add question
  function addQuestion() {
    setForm((current) => ({
      ...current,
      questions: [...current.questions, emptyQuestion()],
    }));

    toast.success("Question added", {
      description: "A new question has been added to the exam.",
    });
  }

  // Remove question
  function removeQuestion(index) {
    if (form.questions.length <= 1) {
      toast.warning("At least one question is required", {
        description: "An exam must contain at least one question.",
      });

      return;
    }

    setForm((current) => ({
      ...current,
      questions: current.questions.filter((_, i) => i !== index),
    }));

    toast.info("Question removed", {
      description: `Question ${index + 1} was removed from this draft.`,
    });
  }

  // Calculate total marks
  const totalMarks = form.questions.reduce(
    (total, question) =>
      total + Math.max(0, Number(question.marks) || 0),
    0
  );

  // Create or update exam
  async function saveExam(event) {
    event.preventDefault();

    if (saving) return;

    const title = form.title.trim();
    const courseName = form.course_name.trim();

    if (!title) {
      toast.warning("Exam title is required", {
        description: "Enter a title before saving the exam.",
      });

      return;
    }

    if (!courseName) {
      toast.warning("Course title is required", {
        description: "Enter the exact title of your assigned course.",
      });

      return;
    }

    if (!form.questions.length) {
      toast.warning("Add at least one question", {
        description: "An exam must contain at least one question.",
      });

      return;
    }

    const incompleteQuestion = form.questions.findIndex(
      (question) =>
        !question.text.trim() ||
        !question.option_a.trim() ||
        !question.option_b.trim() ||
        !question.option_c.trim() ||
        !question.option_d.trim()
    );

    if (incompleteQuestion !== -1) {
      toast.warning("Complete all question fields", {
        description: `Question ${incompleteQuestion + 1} needs its question text and all four options.`,
      });

      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      ...form,
      title,
      course_name: courseName,
      duration_minutes: Number(form.duration_minutes),
      passing_marks: Number(form.passing_marks),
      questions: form.questions.map((question) => ({
        ...question,
        text: question.text.trim(),
        option_a: question.option_a.trim(),
        option_b: question.option_b.trim(),
        option_c: question.option_c.trim(),
        option_d: question.option_d.trim(),
        marks: Number(question.marks),
        correct_option: question.correct_option.toUpperCase(),
        topic: question.topic.trim(),
        explanation: question.explanation.trim(),
      })),
    };

    try {
      if (editingId) {
        await updateMentorExam(editingId, payload);

        toast.success("Exam draft updated successfully", {
          description: `"${payload.title}" has been updated.`,
        });
      } else {
        await createMentorExam(payload);

        toast.success("Exam saved as a draft", {
          description: `"${payload.title}" has been created.`,
        });
      }

      setModal("");
      await loadExams();
    } catch (err) {
      const message = errorMessage(err);

      setError(message);

      toast.error(
        editingId ? "Unable to update exam" : "Unable to create exam",
        {
          description: message,
        }
      );
    } finally {
      setSaving(false);
    }
  }

  // Publish or close an exam
  async function changeAvailability(exam, action) {
    const message =
      action === "publish"
        ? `Publish "${exam.title}" for students?`
        : `Close "${exam.title}"?`;

    if (!window.confirm(message)) {
      toast.info(
        action === "publish"
          ? "Publishing cancelled"
          : "Closing exam cancelled",
        {
          description: `"${exam.title}" was not changed.`,
        }
      );

      return;
    }

    setError("");
    setNotice("");

    try {
      await updateMentorExamAvailability(exam.id, action);

      toast.success(
        action === "publish"
          ? "Exam published successfully"
          : "Exam closed successfully",
        {
          description:
            action === "publish"
              ? `"${exam.title}" is now available to students.`
              : `"${exam.title}" has been closed.`,
        }
      );

      await loadExams();
    } catch (err) {
      const message = errorMessage(err);

      setError(message);

      toast.error(
        action === "publish"
          ? "Unable to publish exam"
          : "Unable to close exam",
        {
          description: message,
        }
      );
    }
  }

  // Delete a draft exam
  async function removeExam(exam) {
    if (!window.confirm(`Delete draft "${exam.title}"?`)) {
      toast.info("Deletion cancelled", {
        description: `"${exam.title}" was not deleted.`,
      });

      return;
    }

    setError("");
    setNotice("");

    try {
      await deleteMentorExam(exam.id);

      toast.success("Draft deleted successfully", {
        description: `"${exam.title}" has been deleted.`,
      });

      await loadExams();
    } catch (err) {
      const message = errorMessage(err);

      setError(message);

      toast.error("Unable to delete draft", {
        description: message,
      });
    }
  }

  // View exam results
  async function showResults(exam) {
    setSelectedExam(exam);
    setResults([]);
    setError("");
    setModal("results");
    setSaving(true);

    try {
      const data = await getMentorExamResults(exam.id);

      setResults(Array.isArray(data) ? data : []);

      toast.success("Exam results loaded", {
        description: `Results for "${exam.title}" are ready to view.`,
      });
    } catch (err) {
      const message = errorMessage(err);

      setError(message);

      toast.error("Unable to load exam results", {
        description: message,
      });
    } finally {
      setSaving(false);
    }
  }

  // AI exam builder
  if (showAIBuilder) {
    return (
      <AIExamBuilder
        onBack={() => setShowAIBuilder(false)}
        onSaved={async () => {
          await loadExams();
          setShowAIBuilder(false);

          toast.success("AI-generated exam saved as a draft", {
            description: "Your generated exam is ready.",
          });
        }}
      />
    );
  }

  return (
    <main className="oe-page">
      <header className="oe-header">
        <div>
          <p className="oe-eyebrow">MENTOR WORKSPACE</p>
          <h1>Online Exams</h1>
          <p className="oe-subtitle">
            Create assessments, manage availability and review student results.
          </p>
        </div>

        <div className="oe-header-actions">
          <button
            type="button"
            className="oe-secondary-btn"
            onClick={() => {
              setError("");
              setNotice("");
              setShowAIBuilder(true);
            }}
          >
            <Sparkles size={17} />
            Generate with AI
          </button>

          <button
            type="button"
            className="oe-primary-btn"
            onClick={openCreate}
          >
            <Plus size={18} />
            Create exam
          </button>
        </div>
      </header>

      {error && (
        <div className="oe-alert oe-alert-error" role="alert">
          <CircleAlert size={18} />
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="oe-alert oe-alert-success" role="status">
          <CircleCheck size={18} />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <section className="oe-stats">
        <article className="oe-stat-card">
          <span className="oe-stat-icon">
            <ClipboardList size={20} />
          </span>
          <span className="oe-stat-label">Total exams</span>
          <strong>{stats.total}</strong>
        </article>

        <article className="oe-stat-card">
          <span className="oe-stat-icon oe-stat-published">
            <CircleCheck size={20} />
          </span>
          <span className="oe-stat-label">Published</span>
          <strong>{stats.published}</strong>
        </article>

        <article className="oe-stat-card">
          <span className="oe-stat-icon oe-stat-draft">
            <FilePenLine size={20} />
          </span>
          <span className="oe-stat-label">Drafts</span>
          <strong>{stats.drafts}</strong>
        </article>

        <article className="oe-stat-card">
          <span className="oe-stat-icon oe-stat-closed">
            <LockKeyhole size={20} />
          </span>
          <span className="oe-stat-label">Closed</span>
          <strong>{stats.closed}</strong>
        </article>
      </section>

      <section className="oe-panel">
        <div className="oe-toolbar">
          <div>
            <h2>Your exams</h2>
            <p>Exams associated with your assigned courses</p>
          </div>

          <button
            type="button"
            className="oe-icon-btn"
            onClick={loadExams}
            title="Refresh exams"
            disabled={loading}
          >
            <RefreshCw size={17} />
          </button>
        </div>

        <div className="oe-filters">
          <label className="oe-search">
            <Search size={17} />
            <input
              placeholder="Search by exam or course..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <select
            aria-label="Filter exams by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {loading ? (
          <div className="oe-empty">
            <RefreshCw className="oe-spin" size={25} />
            <p>Loading exams...</p>
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="oe-empty">
            <span className="oe-empty-icon">
              <BookOpen size={26} />
            </span>

            <h3>{exams.length ? "No matching exams" : "No exams yet"}</h3>

            <p>
              {exams.length
                ? "Try changing your search or status filter."
                : "Create your first exam for one of your assigned courses."}
            </p>

            {!exams.length && (
              <button
                type="button"
                className="oe-primary-btn"
                onClick={openCreate}
              >
                <Plus size={17} />
                Create your first exam
              </button>
            )}
          </div>
        ) : (
          <div className="oe-table-wrap">
            <table className="oe-table">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Course</th>
                  <th>Questions</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginatedExams.map((exam) => (
                  <tr key={exam.id}>
                    <td>
                      <div className="oe-exam-title">
                        <span className="oe-exam-icon">
                          <ClipboardList size={18} />
                        </span>

                        <span>
                          <strong>{exam.title}</strong>
                          <small>
                            {exam.description || "Online assessment"}
                          </small>
                        </span>
                      </div>
                    </td>

                    <td>{exam.course_name || "—"}</td>

                    <td>
                      {exam.question_count ?? exam.questions?.length ?? 0}
                    </td>

                    <td>
                      <span className="oe-inline-icon">
                        <Clock3 size={15} />
                        {exam.duration_minutes} min
                      </span>
                    </td>

                    <td>
                      <span className={statusClass(exam.status)}>
                        {exam.status || "draft"}
                      </span>
                    </td>

                    <td>{formatDate(exam.created_at)}</td>

                    <td>
                      <div className="oe-actions">
                        {exam.status === "draft" && (
                          <>
                            <button
                              type="button"
                              className="oe-action-btn"
                              title="Edit draft"
                              aria-label={`Edit ${exam.title}`}
                              onClick={() => openEdit(exam)}
                            >
                              <FilePenLine size={16} />
                            </button>

                            <button
                              type="button"
                              className="oe-action-btn oe-action-publish"
                              title="Publish exam"
                              aria-label={`Publish ${exam.title}`}
                              onClick={() =>
                                changeAvailability(exam, "publish")
                              }
                            >
                              <Send size={16} />
                            </button>

                            <button
                              type="button"
                              className="oe-action-btn oe-action-delete"
                              title="Delete draft"
                              aria-label={`Delete ${exam.title}`}
                              onClick={() => removeExam(exam)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}

                        {exam.status === "published" && (
                          <button
                            type="button"
                            className="oe-action-btn oe-action-delete"
                            title="Close exam"
                            aria-label={`Close ${exam.title}`}
                            onClick={() =>
                              changeAvailability(exam, "close")
                            }
                          >
                            <LockKeyhole size={16} />
                          </button>
                        )}

                        <button
                          type="button"
                          className="oe-action-btn"
                          title="View results"
                          aria-label={`View results for ${exam.title}`}
                          onClick={() => showResults(exam)}
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredExams.length > 0 && (
          <div className="oe-table-footer oe-pagination">
            <span className="oe-pagination-info">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredExams.length)} of {filteredExams.length} exams
            </span>
            <div className="oe-pagination-controls">
              <button
                type="button"
                className="oe-page-btn"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="oe-page-number">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                className="oe-page-btn"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {modal === "form" && (
        <div
          className="oe-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setModal("");
              toast.info("Exam editor closed", {
                description: "Your unsaved changes have not been submitted.",
              });
            }
          }}
        >
          <section
            className="oe-modal oe-exam-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="oe-form-title"
          >
            <header className="oe-modal-header">
              <div>
                <p className="oe-eyebrow">EXAM BUILDER</p>
                <h2 id="oe-form-title">
                  {editingId ? "Edit exam draft" : "Create online exam"}
                </h2>
                <p>Configure the exam and add multiple-choice questions.</p>
              </div>

              <button
                type="button"
                className="oe-icon-btn"
                onClick={() => {
                  setModal("");
                  toast.info("Exam editor closed", {
                    description: "Your changes were not submitted.",
                  });
                }}
                disabled={saving}
                aria-label="Close exam editor"
              >
                <X size={19} />
              </button>
            </header>

            <form onSubmit={saveExam} className="oe-form">
              <div className="oe-form-grid">
                <label className="oe-field oe-field-full">
                  Exam title *
                  <input
                    name="title"
                    value={form.title}
                    onChange={setExamField}
                    required
                    maxLength={200}
                    placeholder="e.g. Data Structures — Unit Test"
                  />
                </label>

                <label className="oe-field oe-field-full">
                  Course title *
                  <input
                    name="course_name"
                    value={form.course_name}
                    onChange={setExamField}
                    required
                    placeholder="Enter the exact title of your assigned course"
                  />
                  <small>
                    Use the exact course title shown in your assigned courses.
                  </small>
                </label>

                <label className="oe-field oe-field-full">
                  Description
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={setExamField}
                    rows={2}
                    placeholder="Instructions or topics covered..."
                  />
                </label>

                <label className="oe-field">
                  Duration (minutes) *
                  <input
                    type="number"
                    name="duration_minutes"
                    value={form.duration_minutes}
                    onChange={setExamField}
                    min="1"
                    required
                  />
                </label>

                <label className="oe-field">
                  Passing marks *
                  <input
                    type="number"
                    name="passing_marks"
                    value={form.passing_marks}
                    onChange={setExamField}
                    min="0"
                    max={totalMarks}
                    required
                  />
                </label>
              </div>

              <div className="oe-question-heading">
                <div>
                  <h3>Questions</h3>
                  <p>
                    {form.questions.length} questions · {totalMarks} total marks
                  </p>
                </div>

                <button
                  type="button"
                  className="oe-secondary-btn"
                  onClick={addQuestion}
                >
                  <Plus size={16} />
                  Add question
                </button>
              </div>

              {form.questions.map((question, index) => (
                <article className="oe-question-card" key={index}>
                  <div className="oe-question-card-top">
                    <strong>Question {index + 1}</strong>

                    <button
                      type="button"
                      className="oe-remove-question"
                      onClick={() => removeQuestion(index)}
                      disabled={form.questions.length === 1}
                      title="Remove question"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  </div>

                  <label className="oe-field">
                    Question text *
                    <textarea
                      value={question.text}
                      onChange={(event) =>
                        setQuestionField(index, "text", event.target.value)
                      }
                      rows={2}
                      required
                      placeholder="Enter the question..."
                    />
                  </label>

                  <div className="oe-options-grid">
                    {["a", "b", "c", "d"].map((option) => (
                      <label className="oe-field" key={option}>
                        Option {option.toUpperCase()} *
                        <input
                          value={question[`option_${option}`]}
                          onChange={(event) =>
                            setQuestionField(
                              index,
                              `option_${option}`,
                              event.target.value
                            )
                          }
                          required
                          maxLength={500}
                          placeholder={`Enter option ${option.toUpperCase()}`}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="oe-form-grid">
                    <label className="oe-field">
                      Correct answer *
                      <select
                        value={question.correct_option}
                        onChange={(event) =>
                          setQuestionField(
                            index,
                            "correct_option",
                            event.target.value
                          )
                        }
                      >
                        {["A", "B", "C", "D"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="oe-field">
                      Marks *
                      <input
                        type="number"
                        min="1"
                        value={question.marks}
                        onChange={(event) =>
                          setQuestionField(
                            index,
                            "marks",
                            event.target.value
                          )
                        }
                        required
                      />
                    </label>

                    <label className="oe-field">
                      Topic
                      <input
                        value={question.topic}
                        onChange={(event) =>
                          setQuestionField(index, "topic", event.target.value)
                        }
                        placeholder="e.g. Arrays"
                      />
                    </label>

                    <label className="oe-field">
                      Difficulty
                      <select
                        value={question.difficulty}
                        onChange={(event) =>
                          setQuestionField(
                            index,
                            "difficulty",
                            event.target.value
                          )
                        }
                      >
                        <option>Easy</option>
                        <option>Medium</option>
                        <option>Hard</option>
                      </select>
                    </label>

                    <label className="oe-field oe-field-full">
                      Explanation (optional)
                      <textarea
                        value={question.explanation}
                        onChange={(event) =>
                          setQuestionField(
                            index,
                            "explanation",
                            event.target.value
                          )
                        }
                        rows={2}
                        placeholder="Explain why this answer is correct..."
                      />
                    </label>
                  </div>
                </article>
              ))}

              <div className="oe-form-summary">
                <span>
                  <ClipboardList size={17} />
                  {form.questions.length} questions
                </span>
                <span>
                  <Trophy size={17} />
                  {totalMarks} total marks
                </span>
              </div>

              {error && <div className="oe-inline-error">{error}</div>}

              <footer className="oe-modal-footer">
                <button
                  type="button"
                  className="oe-secondary-btn"
                  onClick={() => {
                    setModal("");
                    toast.info("Exam editing cancelled", {
                      description: "Your changes were not submitted.",
                    });
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="oe-primary-btn"
                  disabled={saving}
                >
                  <Save size={17} />
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save draft"
                      : "Create draft"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {modal === "results" && (
        <div
          className="oe-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setModal("");
            }
          }}
        >
          <section
            className="oe-modal oe-results-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="oe-results-title"
          >
            <header className="oe-modal-header">
              <div>
                <p className="oe-eyebrow">ASSESSMENT REPORT</p>
                <h2 id="oe-results-title">Student results</h2>
                <p>
                  {selectedExam?.title} · {selectedExam?.course_name}
                </p>
              </div>

              <button
                type="button"
                className="oe-icon-btn"
                onClick={() => setModal("")}
                disabled={saving}
                aria-label="Close results"
              >
                <X size={19} />
              </button>
            </header>

            {saving ? (
              <div className="oe-empty">
                <RefreshCw className="oe-spin" size={24} />
                <p>Loading results...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="oe-empty">
                <Trophy size={27} />
                <h3>No submitted results yet</h3>
                <p>
                  Student results will appear here after an exam has been
                  submitted.
                </p>
              </div>
            ) : (
              <div className="oe-table-wrap">
                <table className="oe-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Score</th>
                      <th>Percentage</th>
                      <th>Result</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>

                  <tbody>
                    {results.map((result) => (
                      <tr key={result.attempt_id}>
                        <td>
                          <div className="oe-student-cell">
                            <strong>{result.student_name}</strong>
                            <small>{result.student_email}</small>
                          </div>
                        </td>

                        <td>
                          {result.score} / {result.total_marks}
                        </td>

                        <td>{result.percentage}%</td>

                        <td>
                          <span
                            className={
                              result.passed
                                ? "oe-status oe-status-published"
                                : "oe-status oe-status-closed"
                            }
                          >
                            {result.passed ? "Passed" : "Failed"}
                          </span>
                        </td>

                        <td>{formatDate(result.submitted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="oe-modal-footer">
              <button
                type="button"
                className="oe-secondary-btn"
                onClick={() => setModal("")}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
