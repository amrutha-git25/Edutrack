import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  LoaderCircle,
  Search,
  Send,
  Upload,
  X,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import "./Assignments.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
)
  .replace(/\/+$/, "")
  .replace(/(?:\/api)+$/i, "");

function getAccessToken() {
  return (
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    localStorage.getItem("accessToken") ||
    ""
  );
}

async function apiRequest(path, options = {}) {
  const token = getAccessToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      result?.detail ||
      result?.message ||
      result?.error ||
      (typeof result === "string" ? result : "") ||
      `Request failed (${response.status})`;

    throw new Error(
      typeof message === "string" ? message : JSON.stringify(message)
    );
  }

  return result;
}

function unwrapList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.results)) return result.results;
  if (Array.isArray(result?.assignments)) return result.assignments;
  return [];
}

function formatDate(value) {
  if (!value) return "No due date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function isPastDue(value) {
  return value ? new Date(value).getTime() < Date.now() : false;
}

function getStatus(assignment) {
  const status = String(
    assignment.submission_status || "pending"
  ).toLowerCase();

  if (status === "reviewed") return "reviewed";
  if (status === "submitted") return "submitted";
  if (status === "late") return "late";

  return isPastDue(assignment.due_date) ? "overdue" : "pending";
}

const STATUS_LABELS = {
  all: "All assignments",
  pending: "Pending",
  submitted: "Submitted",
  late: "Submitted late",
  reviewed: "Reviewed",
  overdue: "Overdue",
};

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [submissionText, setSubmissionText] = useState("");
  const [submissionFile, setSubmissionFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const result = await apiRequest("/api/learning/assignments/");
      setAssignments(unwrapList(result));
    } catch (error) {
      const message = error.message || "Unable to load assignments.";
      setPageError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const counts = useMemo(() => {
    const initial = {
      all: assignments.length,
      pending: 0,
      submitted: 0,
      late: 0,
      reviewed: 0,
      overdue: 0,
    };

    assignments.forEach((assignment) => {
      initial[getStatus(assignment)] += 1;
    });

    return initial;
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assignments.filter((assignment) => {
      const matchesSearch = [
        assignment.title,
        assignment.course_name,
        assignment.topic_title,
        assignment.instructions,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        );

      return (
        matchesSearch &&
        (filter === "all" || getStatus(assignment) === filter)
      );
    });
  }, [assignments, search, filter]);

  function openSubmission(assignment) {
    setSelected(assignment);
    setSubmissionText("");
    setSubmissionFile(null);
    setNotice("");
    setPageError("");

    toast.info(`Ready to submit: ${assignment.title}`);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selected) {
      toast.error("Please select an assignment first.");
      return;
    }

    if (!submissionFile && !submissionText.trim()) {
      const message = "Choose a file or enter submission text.";
      setPageError(message);
      toast.error(message);
      return;
    }

    setSaving(true);
    setPageError("");
    setNotice("");

    try {
      const formData = new FormData();

      if (submissionFile) {
        formData.append("submission_file", submissionFile);
      }

      if (submissionText.trim()) {
        formData.append("submission_text", submissionText.trim());
      }

      const result = await apiRequest(
        `/api/learning/assignments/${selected.id}/submission/`,
        {
          method: "POST",
          body: formData,
        }
      );

      const successMessage =
        result?.message || "Assignment submitted successfully.";

      setNotice(successMessage);
      toast.success(successMessage);
      setSelected(null);

      await loadAssignments();
    } catch (error) {
      const message =
        error.message || "Unable to submit this assignment.";

      setPageError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="student-assignments">
      <header className="assignments-heading">
        <div>
          <span className="assignments-eyebrow">
            YOUR LEARNING JOURNEY
          </span>
          <h1>Assignments</h1>
          <p>
            Keep track of your work, deadlines, grades, and feedback.
          </p>
        </div>

        <button
          className="assignments-refresh"
          type="button"
          onClick={() => {
            toast.info("Refreshing your assignments...");
            loadAssignments();
          }}
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle size={17} className="assignments-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </header>

      <section
        className="assignment-stats"
        aria-label="Assignment summary"
      >
        <div className="assignment-stat">
          <span className="assignment-stat-icon">
            <BookOpen size={19} />
          </span>
          <div>
            <span>Total assignments</span>
            <strong>{counts.all}</strong>
          </div>
        </div>

        <div className="assignment-stat">
          <span className="assignment-stat-icon pending-icon">
            <Clock3 size={19} />
          </span>
          <div>
            <span>Pending</span>
            <strong>{counts.pending + counts.overdue}</strong>
          </div>
        </div>

        <div className="assignment-stat">
          <span className="assignment-stat-icon submitted-icon">
            <Send size={19} />
          </span>
          <div>
            <span>Submitted</span>
            <strong>{counts.submitted + counts.late}</strong>
          </div>
        </div>

        <div className="assignment-stat">
          <span className="assignment-stat-icon reviewed-icon">
            <CheckCircle2 size={19} />
          </span>
          <div>
            <span>Reviewed</span>
            <strong>{counts.reviewed}</strong>
          </div>
        </div>
      </section>

      {pageError && (
        <div
          className="assignment-alert assignment-alert-error"
          role="alert"
        >
          <AlertCircle size={18} />
          <span>{pageError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setPageError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div
          className="assignment-alert assignment-alert-success"
          role="status"
        >
          <CheckCircle2 size={18} />
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

      <section className="assignment-toolbar">
        <label className="assignment-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search assignments or courses..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label className="assignment-filter">
          <Filter size={17} />
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter assignments by status"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading ? (
        <div className="assignment-state">
          <LoaderCircle size={28} className="assignments-spin" />
          <p>Loading your assignments...</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="assignment-state">
          <span className="assignment-empty-icon">
            <FileText size={28} />
          </span>
          <h2>No assignments found</h2>
          <p>
            {assignments.length === 0
              ? "Published assignments will appear here when they are available."
              : "Try changing your search or status filter."}
          </p>
        </div>
      ) : (
        <section
          className="assignment-grid"
          aria-label="Assignments list"
        >
          {filteredAssignments.map((assignment) => {
            const status = getStatus(assignment);
            const canSubmit = [
              "pending",
              "overdue",
              "submitted",
              "late",
            ].includes(status);

            return (
              <article
                className="assignment-card"
                key={assignment.id}
              >
                <div className="assignment-card-top">
                  <span className="assignment-course-icon">
                    <FileText size={20} />
                  </span>
                  <span className={`assignment-status status-${status}`}>
                    {STATUS_LABELS[status] || status}
                  </span>
                </div>

                <p className="assignment-course">
                  {assignment.course_name || "Course assignment"}
                  {assignment.topic_title
                    ? ` · ${assignment.topic_title}`
                    : ""}
                </p>

                <h2>{assignment.title}</h2>

                <p className="assignment-instructions">
                  {assignment.instructions ||
                    "No instructions provided."}
                </p>

                <div className="assignment-meta">
                  <span>
                    <CalendarDays size={16} />
                    {formatDate(assignment.due_date)}
                  </span>
                  <span>
                    <BookOpen size={16} />
                    {assignment.total_marks ?? 100} marks
                  </span>
                </div>

                {status === "reviewed" && (
                  <div className="assignment-review">
                    <div>
                      <span>Your grade</span>
                      <strong>
                        {assignment.grade ?? "—"} /{" "}
                        {assignment.total_marks}
                      </strong>
                    </div>

                    {assignment.feedback && (
                      <p>
                        <strong>Mentor feedback:</strong>{" "}
                        {assignment.feedback}
                      </p>
                    )}
                  </div>
                )}

                {assignment.reference_file && (
                  <a
                    className="assignment-reference-link"
                    href={
                      assignment.reference_file.startsWith("http")
                        ? assignment.reference_file
                        : `${API_BASE}${assignment.reference_file}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArrowDownToLine size={16} />
                    Reference material
                  </a>
                )}

                <div className="assignment-card-footer">
                  {assignment.submission_status &&
                    assignment.submission_status !== "pending" &&
                    assignment.submitted_at && (
                      <span className="assignment-submitted-date">
                        Submitted {formatDate(assignment.submitted_at)}
                      </span>
                    )}

                  {canSubmit && (
                    <button
                      type="button"
                      className="assignment-primary-button"
                      onClick={() => openSubmission(assignment)}
                    >
                      <Upload size={16} />
                      {status === "submitted" || status === "late"
                        ? "Update submission"
                        : "Submit assignment"}
                    </button>
                  )}

                  {status === "reviewed" && (
                    <span className="assignment-reviewed-label">
                      <CheckCircle2 size={16} /> Reviewed
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {selected && (
        <div
          className="assignment-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setSelected(null);
            }
          }}
        >
          <section
            className="assignment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assignment-modal-title"
          >
            <header className="assignment-modal-header">
              <div>
                <span className="assignments-eyebrow">
                  YOUR SUBMISSION
                </span>
                <h2 id="assignment-modal-title">
                  {selected.title}
                </h2>
              </div>

              <button
                type="button"
                className="assignment-modal-close"
                aria-label="Close submission form"
                disabled={saving}
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </header>

            <p className="assignment-modal-description">
              Upload your work or enter your answer below. You can provide both.
            </p>

            <form onSubmit={handleSubmit}>
              <label
                className="assignment-form-label"
                htmlFor="submission-file"
              >
                Submission file
              </label>

              <label
                className="assignment-file-picker"
                htmlFor="submission-file"
              >
                <Upload size={22} />
                <span>
                  <strong>
                    {submissionFile
                      ? submissionFile.name
                      : "Choose a file"}
                  </strong>
                  <small>
                    PDF, document, ZIP, or other permitted file type
                  </small>
                </span>

                <input
                  id="submission-file"
                  type="file"
                  onChange={(event) =>
                    setSubmissionFile(
                      event.target.files?.[0] || null
                    )
                  }
                />
              </label>

              {submissionFile && (
                <button
                  type="button"
                  className="assignment-remove-file"
                  onClick={() => setSubmissionFile(null)}
                >
                  <X size={15} /> Remove selected file
                </button>
              )}

              <label
                className="assignment-form-label"
                htmlFor="submission-text"
              >
                Written answer
              </label>

              <textarea
                id="submission-text"
                rows={5}
                value={submissionText}
                onChange={(event) =>
                  setSubmissionText(event.target.value)
                }
                placeholder="Write your answer or add a note about your submission..."
              />

              <div className="assignment-modal-actions">
                <button
                  type="button"
                  className="assignment-secondary-button"
                  disabled={saving}
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="assignment-primary-button"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <LoaderCircle
                        size={17}
                        className="assignments-spin"
                      />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Submit work
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}