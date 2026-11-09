
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  FiPlus,
  FiSearch,
  FiRefreshCw,
  FiEdit2,
  FiTrash2,
  FiEye,
  FiClipboard,
  FiUsers,
  FiCheckCircle,
  FiClock,
  FiX,
  FiFileText,
  FiUploadCloud,
  FiArrowLeft,
  FiSave,
  FiAlertCircle,
} from "react-icons/fi";
import "./Assignments.css";

/* ---------------- API CONFIGURATION ---------------- */

const API_ROOT = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com"
).replace(/\/+$/, "");

const API_BASE = API_ROOT.endsWith("/api")
  ? API_ROOT
  : `${API_ROOT}/api`;

const ASSIGNMENTS_URL = `${API_BASE}/learning/mentor/assignments/`;

function readAccessToken() {
  return (
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("access") ||
    ""
  );
}

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = readAccessToken();

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

const blankForm = {
  course: "",
  topic_title: "",
  title: "",
  instructions: "",
  due_date: "",
  total_marks: "100",
  status: "draft",
  reference_file: null,
};

/* ---------------- HELPERS ---------------- */

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.courses)) return data.courses;
  if (Array.isArray(data?.assignments)) return data.assignments;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;

  if (Array.isArray(data?.data?.results)) {
    return data.data.results;
  }

  if (Array.isArray(data?.data?.courses)) {
    return data.data.courses;
  }

  return [];
}

function asLocalDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return "No due date";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function getErrorMessage(error) {
  const data = error?.response?.data;

  if (typeof data === "string") return data;

  if (data && typeof data === "object") {
    if (data.message) return String(data.message);
    if (data.detail) return String(data.detail);

    return Object.entries(data)
      .map(([key, value]) => {
        const message = Array.isArray(value)
          ? value.join(", ")
          : typeof value === "string"
          ? value
          : JSON.stringify(value);

        return `${key}: ${message}`;
      })
      .join(" · ");
  }

  if (error?.code === "ECONNABORTED") {
    return "The request timed out. Please try again.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

function statusLabel(status) {
  const value = String(status || "draft").toLowerCase();

  if (value === "published") return "Published";
  if (value === "archived") return "Archived";
  if (value === "closed") return "Closed";

  return "Draft";
}

function getItemId(item) {
  return item?.id ?? item?.pk;
}

/* ---------------- COMPONENT ---------------- */

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 3;
  const [activeTab, setActiveTab] = useState("assignments");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm);

  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const [grading, setGrading] = useState({});
  const [gradingId, setGradingId] = useState(null);

  // Delete confirmation modal state
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /* ---------------- LOAD ASSIGNMENTS ---------------- */

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get(ASSIGNMENTS_URL);

      if (response.data?.success === false) {
        throw new Error(
          response.data.message || "Unable to load assignments."
        );
      }

      setAssignments(normalizeList(response.data));
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(`Could not load assignments: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ---------------- LOAD MENTOR COURSES ---------------- */

  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);

    const endpoints = [
      `${API_BASE}/mentor/courses/`,
      `${API_BASE}/mentor/materials/courses/`,
    ];

    let lastError = null;
    let requestSucceeded = false;

    try {
      for (const endpoint of endpoints) {
        try {
          const response = await api.get(endpoint);

          if (response.data?.success === false) {
            throw new Error(
              response.data.message || "Unable to load mentor courses."
            );
          }

          requestSucceeded = true;
          const list = normalizeList(response.data);

          if (list.length > 0) {
            const normalized = list
              .map((course) => {
                const id =
                  course.id ?? course.pk ?? course.course_id;

                return {
                  ...course,
                  id,
                  name:
                    course.name ||
                    course.title ||
                    course.course_name ||
                    `Course ${id ?? ""}`.trim(),
                };
              })
              .filter(
                (course) =>
                  course.id !== undefined && course.id !== null
              );

            if (normalized.length > 0) {
              setCourses(normalized);
              return normalized;
            }
          }
        } catch (err) {
          lastError = err;

          console.warn(
            `Course request failed: ${endpoint}`,
            err.response?.data || err.message
          );
        }
      }

      setCourses([]);

      if (requestSucceeded) {
        toast.info("No courses are assigned to your mentor account yet.");
      } else if (lastError?.response?.status === 401) {
        toast.error("Your session has expired. Please log in again.");
      } else if (lastError?.response?.status === 403) {
        toast.error("Your account does not have mentor access.");
      } else if (lastError) {
        toast.error(`Unable to load courses: ${getErrorMessage(lastError)}`);
      }

      return [];
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
    loadCourses();
  }, [loadAssignments, loadCourses]);

  /* ---------------- FILTERS AND STATISTICS ---------------- */

  const filteredAssignments = useMemo(() => {
    return assignments.filter((item) => {
      const text = [
        item.title || "",
        item.course_name || "",
        item.course_title || "",
        item.topic_title || "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = text.includes(search.toLowerCase().trim());

      const matchesStatus =
        statusFilter === "all" ||
        String(item.status || "draft").toLowerCase() === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [assignments, search, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAssignments.length / ITEMS_PER_PAGE)
  );

  const paginatedAssignments = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAssignments.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAssignments, currentPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const stats = useMemo(
    () => ({
      total: assignments.length,
      published: assignments.filter(
        (item) => item.status === "published"
      ).length,
      drafts: assignments.filter(
        (item) => item.status === "draft"
      ).length,
      submissions: assignments.reduce(
        (total, item) =>
          total +
          Number(item.submission_count ?? item.submissions_count ?? 0),
        0
      ),
    }),
    [assignments]
  );

  /* ---------------- CREATE AND EDIT ---------------- */

  function openCreate() {
    if (courses.length === 0) {
      toast.error("Assign a course to your mentor account before creating an assignment.");
      loadCourses();
      return;
    }

    setEditing(null);
    setForm({
      ...blankForm,
      course: String(courses[0].id),
    });
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditing(item);

    setForm({
      course: String(item.course ?? item.course_id ?? ""),
      topic_title: item.topic_title || "",
      title: item.title || "",
      instructions: item.instructions || "",
      due_date: asLocalDateTime(item.due_date),
      total_marks: String(item.total_marks ?? 100),
      status: item.status || "draft",
      reference_file: null,
    });

    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function updateField(event) {
    const { name, value, files, type } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "file" ? files?.[0] || null : value,
    }));
  }

  async function submitForm(event) {
    event.preventDefault();

    if (!form.course) {
      toast.error("Please select a course.");
      return;
    }

    if (!form.title.trim()) {
      toast.error("Please enter an assignment title.");
      return;
    }

    if (!form.instructions.trim()) {
      toast.error("Please enter assignment instructions.");
      return;
    }

    if (!form.due_date || Number.isNaN(new Date(form.due_date).getTime())) {
      toast.error("Please select a valid due date and time.");
      return;
    }

    if (Number(form.total_marks) < 1) {
      toast.error("Total marks must be at least 1.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const body = new FormData();

      body.append("course", form.course);
      body.append("topic_title", form.topic_title.trim());
      body.append("title", form.title.trim());
      body.append("instructions", form.instructions.trim());
      body.append("due_date", new Date(form.due_date).toISOString());
      body.append("total_marks", String(form.total_marks));
      body.append("status", form.status);

      if (form.reference_file) {
        body.append("reference_file", form.reference_file);
      }

      const id = getItemId(editing);
      const url = editing
        ? `${ASSIGNMENTS_URL}${id}/`
        : ASSIGNMENTS_URL;

      if (editing) {
        await api.patch(url, body);
        toast.success("Assignment updated successfully.");
        setNotice("Assignment updated successfully.");
      } else {
        await api.post(url, body);
        toast.success("Assignment created successfully.");
        setNotice("Assignment created successfully.");
      }

      setModalOpen(false);
      await loadAssignments();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(`Unable to save assignment: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- DELETE CONFIRMATION MODAL ---------------- */

  function deleteAssignment(item) {
    // Do not delete immediately. Show the custom modal first.
    setDeleteCandidate(item);
  }

  function cancelDelete() {
    if (deleting) return;
    setDeleteCandidate(null);
    toast.info("Deletion cancelled", {
      description: "The assignment was not deleted.",
    });
  }

  async function confirmDeleteAssignment() {
    if (!deleteCandidate || deleting) return;

    const id = getItemId(deleteCandidate);

    if (!id) {
      toast.error("Unable to identify this assignment.");
      setDeleteCandidate(null);
      return;
    }

    setDeleting(true);
    setError("");
    setNotice("");

    try {
      await api.delete(`${ASSIGNMENTS_URL}${id}/`);

      toast.success("Assignment deleted successfully.");
      setNotice("Assignment deleted successfully.");

      if (getItemId(selectedAssignment) === id) {
        setSelectedAssignment(null);
        setSubmissions([]);
        setActiveTab("assignments");
      }

      setDeleteCandidate(null);
      await loadAssignments();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(`Unable to delete assignment: ${message}`);
    } finally {
      setDeleting(false);
    }
  }

  /* ---------------- SUBMISSIONS ---------------- */

  async function viewSubmissions(item) {
    setSelectedAssignment(item);
    setActiveTab("submissions");
    setSubmissions([]);
    setSubmissionsLoading(true);
    setError("");

    try {
      const response = await api.get(
        `${API_BASE}/learning/assignments/${getItemId(item)}/submissions/`
      );

      if (response.data?.success === false) {
        throw new Error(
          response.data.message || "Unable to load submissions."
        );
      }

      const rows = normalizeList(response.data);
      setSubmissions(rows);

      setGrading(
        Object.fromEntries(
          rows.map((row) => [
            getItemId(row),
            {
              grade: row.grade ?? row.marks_obtained ?? "",
              feedback: row.feedback ?? "",
            },
          ])
        )
      );

      if (rows.length === 0) {
        toast.info("No submissions have been received yet.");
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(`Unable to load submissions: ${message}`);
    } finally {
      setSubmissionsLoading(false);
    }
  }

  function updateGrade(id, field, value) {
    setGrading((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        [field]: value,
      },
    }));
  }

  async function submitGrade(submission) {
    const id = getItemId(submission);
    const values = grading[id] || {};

    if (!id) {
      toast.error("Unable to identify this submission.");
      return;
    }

    const maxMarks = Number(
      submission.total_marks ?? selectedAssignment?.total_marks ?? 100
    );

    if (values.grade !== "" && values.grade != null) {
      const grade = Number(values.grade);

      if (!Number.isFinite(grade) || grade < 0 || grade > maxMarks) {
        toast.error(`Grade must be between 0 and ${maxMarks}.`);
        return;
      }
    }

    setGradingId(id);
    setError("");
    setNotice("");

    try {
      await api.patch(`${API_BASE}/learning/submissions/${id}/grade/`, {
        grade:
          values.grade === "" || values.grade == null
            ? null
            : Number(values.grade),
        feedback: values.feedback || "",
      });

      toast.success("Grade and feedback saved.");
      setNotice("Grade and feedback saved.");

      await viewSubmissions(selectedAssignment);
      await loadAssignments();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(`Unable to save grade: ${message}`);
    } finally {
      setGradingId(null);
    }
  }

  async function refreshData() {
    await Promise.all([loadAssignments(), loadCourses()]);
  }

  /* ---------------- RENDER ---------------- */

  return (
    <div className="mentor-assignments">
      <div className="ma-page-head">
        <div>
          <div className="ma-eyebrow">MENTOR WORKSPACE</div>
          <h1>Assignments</h1>
          <p>
            Create learning tasks, track submissions, and give students
            feedback.
          </p>
        </div>

        <div className="ma-head-actions">
          <button
            type="button"
            className="ma-btn ma-btn-quiet"
            onClick={refreshData}
            disabled={loading || coursesLoading}
          >
            <FiRefreshCw />
            Refresh
          </button>

          <button
            type="button"
            className="ma-btn ma-btn-primary"
            onClick={openCreate}
            disabled={coursesLoading}
          >
            <FiPlus />
            Create assignment
          </button>
        </div>
      </div>

      {error && (
        <div className="ma-alert ma-alert-error" role="alert">
          <FiAlertCircle />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <FiX />
          </button>
        </div>
      )}

      {notice && (
        <div className="ma-alert ma-alert-success" role="status">
          <FiCheckCircle />
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            <FiX />
          </button>
        </div>
      )}

      <section className="ma-stats">
        <article className="ma-stat-card">
          <span className="ma-stat-icon purple"><FiClipboard /></span>
          <div>
            <span>Total assignments</span>
            <strong>{stats.total}</strong>
            <small>Across your courses</small>
          </div>
        </article>

        <article className="ma-stat-card">
          <span className="ma-stat-icon green"><FiCheckCircle /></span>
          <div>
            <span>Published</span>
            <strong>{stats.published}</strong>
            <small>Visible to students</small>
          </div>
        </article>

        <article className="ma-stat-card">
          <span className="ma-stat-icon amber"><FiFileText /></span>
          <div>
            <span>Drafts</span>
            <strong>{stats.drafts}</strong>
            <small>Not published yet</small>
          </div>
        </article>

        <article className="ma-stat-card">
          <span className="ma-stat-icon blue"><FiUsers /></span>
          <div>
            <span>Submissions</span>
            <strong>{stats.submissions}</strong>
            <small>Reported by API</small>
          </div>
        </article>
      </section>

      <div className="ma-tabs" role="tablist" aria-label="Assignment views">
        <button
          type="button"
          className={activeTab === "assignments" ? "active" : ""}
          onClick={() => setActiveTab("assignments")}
          role="tab"
          aria-selected={activeTab === "assignments"}
        >
          <FiClipboard /> Assignments
        </button>

        <button
          type="button"
          className={activeTab === "submissions" ? "active" : ""}
          onClick={() => setActiveTab("submissions")}
          role="tab"
          aria-selected={activeTab === "submissions"}
        >
          <FiUsers /> Review submissions
        </button>
      </div>

      {activeTab === "assignments" ? (
        <section className="ma-panel">
          <div className="ma-panel-toolbar">
            <div>
              <h2>Your assignments</h2>
              <p>Manage tasks for courses assigned to you.</p>
            </div>

            <div className="ma-filters">
              <label className="ma-search">
                <FiSearch />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search title, course, topic…"
                />
              </label>

              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="ma-state">
              <span className="ma-loader" />
              Loading assignments…
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="ma-empty">
              <span><FiClipboard /></span>
              <h3>No assignments found</h3>
              <p>
                {search || statusFilter !== "all"
                  ? "Try changing your search or status filter."
                  : "Create your first assignment to give students a clear learning goal."}
              </p>

              {!search && statusFilter === "all" && (
                <button
                  type="button"
                  className="ma-btn ma-btn-primary"
                  onClick={openCreate}
                >
                  <FiPlus /> Create assignment
                </button>
              )}
            </div>
          ) : (
            <div className="ma-table-wrap">
              <table className="ma-table">
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th>Course / topic</th>
                    <th>Due date</th>
                    <th>Marks</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedAssignments.map((item) => {
                    const id = getItemId(item);

                    return (
                      <tr key={id}>
                        <td>
                          <div className="ma-assignment-title">
                            <span className="ma-file-icon"><FiFileText /></span>
                            <div>
                              <strong>{item.title}</strong>
                              <small>Created {formatDate(item.created_at)}</small>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="ma-course-name">
                            {item.course_name ||
                              item.course_title ||
                              `Course #${item.course ?? item.course_id ?? "—"}`}
                          </span>
                          <small className="ma-topic">
                            {item.topic_title || "General assignment"}
                          </small>
                        </td>

                        <td>
                          <span className="ma-due">
                            <FiClock /> {formatDate(item.due_date)}
                          </span>
                        </td>

                        <td><strong>{item.total_marks ?? 100}</strong></td>

                        <td>
                          <span
                            className={`ma-status status-${String(
                              item.status || "draft"
                            ).toLowerCase()}`}
                          >
                            {statusLabel(item.status)}
                          </span>
                        </td>

                        <td>
                          <div className="ma-row-actions">
                            <button
                              type="button"
                              title="Review submissions"
                              aria-label="Review submissions"
                              onClick={() => viewSubmissions(item)}
                            >
                              <FiEye />
                            </button>

                            <button
                              type="button"
                              title="Edit assignment"
                              aria-label="Edit assignment"
                              onClick={() => openEdit(item)}
                            >
                              <FiEdit2 />
                            </button>

                            <button
                              type="button"
                              title="Delete assignment"
                              aria-label="Delete assignment"
                              className="danger"
                              onClick={() => deleteAssignment(item)}
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="ma-pagination">
                <span className="ma-pagination-info">
                  Showing {filteredAssignments.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}
                  {"–"}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredAssignments.length)}
                  {" "}of {filteredAssignments.length} assignments
                </span>
                <div className="ma-pagination-controls">
                  <button
                    type="button"
                    className="ma-btn ma-btn-quiet ma-pagination-btn"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span className="ma-pagination-page">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="ma-btn ma-btn-quiet ma-pagination-btn"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="ma-panel">
          <div className="ma-panel-toolbar ma-review-head">
            <div>
              <h2>Submission review</h2>
              <p>
                {selectedAssignment
                  ? `Reviewing: ${selectedAssignment.title}`
                  : "Choose an assignment to view student submissions."}
              </p>
            </div>

            {selectedAssignment && (
              <button
                type="button"
                className="ma-btn ma-btn-quiet"
                onClick={() => setActiveTab("assignments")}
              >
                <FiArrowLeft /> Back to assignments
              </button>
            )}
          </div>

          {!selectedAssignment ? (
            <div className="ma-empty">
              <span><FiUsers /></span>
              <h3>Select an assignment</h3>
              <p>
                Open an assignment and choose the eye icon to review its
                submissions.
              </p>
              <button
                type="button"
                className="ma-btn ma-btn-primary"
                onClick={() => setActiveTab("assignments")}
              >
                View assignments
              </button>
            </div>
          ) : submissionsLoading ? (
            <div className="ma-state">
              <span className="ma-loader" />
              Loading submissions…
            </div>
          ) : submissions.length === 0 ? (
            <div className="ma-empty">
              <span><FiUsers /></span>
              <h3>No submissions yet</h3>
              <p>Student submissions will appear here when they submit their work.</p>
            </div>
          ) : (
            <div className="ma-submission-list">
              {submissions.map((submission) => {
                const id = getItemId(submission);
                const values = grading[id] || {};
                const maxMarks =
                  submission.total_marks ??
                  selectedAssignment.total_marks ??
                  100;

                return (
                  <article className="ma-submission-card" key={id}>
                    <div className="ma-submission-top">
                      <div className="ma-student-avatar">
                        {(submission.student_name ||
                          submission.student_email ||
                          "S").trim().charAt(0).toUpperCase()}
                      </div>

                      <div className="ma-student-info">
                        <strong>
                          {submission.student_name ||
                            submission.student_email ||
                            `Student #${submission.student ?? submission.student_id ?? id}`}
                        </strong>
                        <small>
                          {submission.student_email || "Student submission"}
                        </small>
                        <span
                          className={`ma-status status-${String(
                            submission.status || "submitted"
                          ).toLowerCase()}`}
                        >
                          {statusLabel(
                            submission.status === "reviewed"
                              ? "published"
                              : submission.status
                          )}
                        </span>
                      </div>

                      <div className="ma-submitted-date">
                        <small>Submitted</small>
                        <strong>{formatDate(submission.submitted_at)}</strong>
                      </div>
                    </div>

                    {submission.submission_text && (
                      <div className="ma-submission-text">
                        <strong>Student response</strong>
                        <p>{submission.submission_text}</p>
                      </div>
                    )}

                    {(submission.submission_file_url ||
                      submission.submission_file) && (
                      <a
                        className="ma-file-link"
                        href={
                          submission.submission_file_url ||
                          submission.submission_file
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FiFileText /> Open submitted file
                      </a>
                    )}

                    <div className="ma-grade-grid">
                      <label>
                        Grade (out of {maxMarks})
                        <input
                          type="number"
                          min="0"
                          max={maxMarks}
                          step="0.5"
                          value={values.grade}
                          onChange={(event) =>
                            updateGrade(id, "grade", event.target.value)
                          }
                          placeholder="Enter marks"
                        />
                      </label>

                      <label className="ma-feedback-field">
                        Feedback
                        <textarea
                          rows="2"
                          value={values.feedback}
                          onChange={(event) =>
                            updateGrade(id, "feedback", event.target.value)
                          }
                          placeholder="Share helpful feedback with the student…"
                        />
                      </label>
                    </div>

                    <div className="ma-submission-footer">
                      <span>
                        {submission.reviewed_at
                          ? `Last reviewed ${formatDate(submission.reviewed_at)}`
                          : "Awaiting review"}
                      </span>

                      <button
                        type="button"
                        className="ma-btn ma-btn-primary"
                        onClick={() => submitGrade(submission)}
                        disabled={gradingId === id}
                      >
                        <FiSave />
                        {gradingId === id
                          ? "Saving…"
                          : "Save grade & feedback"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* CREATE / EDIT ASSIGNMENT MODAL */}

      {modalOpen && (
        <div
          className="ma-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              setModalOpen(false);
            }
          }}
        >
          <section
            className="ma-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ma-modal-title"
          >
            <div className="ma-modal-head">
              <div>
                <span className="ma-eyebrow">
                  {editing ? "UPDATE TASK" : "NEW LEARNING TASK"}
                </span>
                <h2 id="ma-modal-title">
                  {editing ? "Edit assignment" : "Create assignment"}
                </h2>
                <p>Give students clear instructions and a deadline.</p>
              </div>

              <button
                type="button"
                className="ma-icon-close"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>

            <form onSubmit={submitForm} className="ma-form">
              <label>
                Assignment title <span>*</span>
                <input
                  name="title"
                  required
                  maxLength="255"
                  value={form.title}
                  onChange={updateField}
                  placeholder="e.g. Build a REST API"
                />
              </label>

              <div className="ma-form-row">
                <label>
                  Course <span>*</span>
                  <select
                    name="course"
                    required
                    value={form.course}
                    onChange={updateField}
                    disabled={coursesLoading || courses.length === 0}
                  >
                    <option value="">
                      {coursesLoading ? "Loading courses…" : "Select assigned course"}
                    </option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>

                  {courses.length === 0 && (
                    <small className="ma-field-help">
                      {coursesLoading
                        ? "Loading your assigned courses…"
                        : "No assigned courses were returned. Check the mentor course API and course assignments."}
                    </small>
                  )}
                </label>

                <label>
                  Topic (optional)
                  <input
                    name="topic_title"
                    value={form.topic_title}
                    onChange={updateField}
                    placeholder="e.g. API authentication"
                  />
                </label>
              </div>

              <label>
                Instructions <span>*</span>
                <textarea
                  name="instructions"
                  required
                  rows="4"
                  value={form.instructions}
                  onChange={updateField}
                  placeholder="Explain what students need to complete…"
                />
              </label>

              <div className="ma-form-row">
                <label>
                  Due date & time <span>*</span>
                  <input
                    type="datetime-local"
                    name="due_date"
                    required
                    value={form.due_date}
                    onChange={updateField}
                  />
                </label>

                <label>
                  Total marks <span>*</span>
                  <input
                    type="number"
                    name="total_marks"
                    required
                    min="1"
                    step="1"
                    value={form.total_marks}
                    onChange={updateField}
                  />
                </label>
              </div>

              <div className="ma-form-row">
                <label>
                  Visibility <span>*</span>
                  <select
                    name="status"
                    value={form.status}
                    onChange={updateField}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>

                <label className="ma-upload-field">
                  <span>Reference file (optional)</span>
                  <span className="ma-upload-box">
                    <FiUploadCloud />
                    <span>{form.reference_file?.name || "Choose a file"}</span>
                    <input
                      type="file"
                      name="reference_file"
                      onChange={updateField}
                    />
                  </span>
                </label>
              </div>

              <div className="ma-modal-actions">
                <button
                  type="button"
                  className="ma-btn ma-btn-quiet"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="ma-btn ma-btn-primary"
                  disabled={saving || courses.length === 0}
                >
                  <FiSave />
                  {saving
                    ? "Saving…"
                    : editing
                    ? "Save changes"
                    : "Create assignment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}

      {deleteCandidate && (
        <div
          className="ma-modal-backdrop ma-delete-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !deleting
            ) {
              cancelDelete();
            }
          }}
        >
          <section
            className="ma-modal ma-delete-modal"
            style={{
              width: "min(460px, 100%)",
              overflow: "hidden",
            }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ma-delete-title"
            aria-describedby="ma-delete-description"
          >
            <div style={{ padding: "26px", textAlign: "center" }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  margin: "0 auto 16px",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "50%",
                  color: "#dc2626",
                  background: "rgba(220, 38, 38, 0.12)",
                  fontSize: 25,
                }}
              >
                <FiAlertCircle />
              </div>

              <h2
                id="ma-delete-title"
                style={{
                  margin: "0 0 10px",
                  color: "var(--ma-text)",
                  fontSize: 21,
                }}
              >
                Are you sure you want to delete?
              </h2>

              <p
                id="ma-delete-description"
                style={{
                  margin: "0 auto 10px",
                  maxWidth: 420,
                  color: "var(--ma-muted)",
                  lineHeight: 1.7,
                }}
              >
                You are about to delete{" "}
                <strong style={{ color: "var(--ma-text)" }}>
                  “{deleteCandidate.title || "this assignment"}”
                </strong>
                . This action cannot be undone.
              </p>

              <p
                style={{
                  margin: 0,
                  color: "var(--ma-muted)",
                  fontSize: 11,
                }}
              >
                If students have already submitted work, the server may
                prevent deletion.
              </p>
            </div>

            <div
              className="ma-modal-actions"
              style={{
                padding: "0 26px 24px",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                className="ma-btn ma-btn-quiet"
                onClick={cancelDelete}
                disabled={deleting}
              >
                <FiX />
                Cancel
              </button>

              <button
                type="button"
                className="ma-btn"
                style={{
                  color: "#fff",
                  background: "#dc2626",
                  borderColor: "#dc2626",
                  minWidth: 125,
                }}
                onClick={confirmDeleteAssignment}
                disabled={deleting}
              >
                <FiTrash2 />
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
