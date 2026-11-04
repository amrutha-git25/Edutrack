import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaClock,
  FaVideo,
  FaUsers,
  FaCheckCircle,
  FaTimesCircle,
  FaEdit,
  FaTrash,
  FaSyncAlt,
  FaPlus,
  FaExternalLinkAlt,
} from "react-icons/fa";
import { toast, Toaster } from "sonner";
import "./LiveClasses.css";

const API_BASE = "http://127.0.0.1:8000/api/learning/live-classes/";
const STATUS_REFRESH_MS = 15000;

const emptyForm = {
  title: "",
  description: "",
  course_name: "",
  mentor: "",
  scheduled_at: "",
  duration_minutes: 60,
  meeting_url: "",
};

function getToken() {
  return (
    localStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    sessionStorage.getItem("access_token")
  );
}

async function apiRequest(url, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error("Please log in again to continue.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data =
    response.status === 204
      ? null
      : await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      data?.detail ||
      data?.message ||
      Object.entries(data || {})
        .map(([key, value]) =>
          `${key}: ${Array.isArray(value) ? value.join(", ") : value}`
        )
        .join(" ");

    throw new Error(
      detail ||
        (response.status === 401
          ? "Your session has expired. Please log in again."
          : response.status === 403
            ? "You do not have permission to perform this action."
            : `Request failed (${response.status}).`)
    );
  }

  return data;
}

function unwrapClasses(data) {
  const list = Array.isArray(data)
    ? data
    : data?.results ?? data?.data ?? data?.live_classes ?? [];

  if (!Array.isArray(list)) {
    throw new Error("The API did not return a valid list of classes.");
  }

  return list;
}

function toLocalDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return "Not scheduled";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Invalid date"
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function getClassTimes(item) {
  const start = new Date(item.scheduled_at).getTime();
  const duration = Number(item.duration_minutes || 60);
  const end = start + duration * 60 * 1000;

  return {
    start,
    end,
    valid: Number.isFinite(start) && Number.isFinite(end) && duration > 0,
  };
}

/*
 * Status is calculated from the actual schedule and current time.
 * Cancelled classes always remain cancelled.
 * A class manually marked completed remains completed.
 */
function getEffectiveStatus(item, now = Date.now()) {
  const savedStatus = String(item.status || "scheduled").toLowerCase();

  if (savedStatus === "cancelled") return "cancelled";
  if (savedStatus === "completed") return "completed";

  const { start, end, valid } = getClassTimes(item);

  if (!valid) return "scheduled";
  if (now < start) return "scheduled";
  if (now >= start && now < end) return "live";

  return "completed";
}

function statusLabel(status) {
  const labels = {
    scheduled: "Scheduled",
    live: "Live Now",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return labels[status] || "Scheduled";
}

function getTimeLabel(item, now) {
  const { start, end, valid } = getClassTimes(item);

  if (!valid) return "Check schedule";

  const status = getEffectiveStatus(item, now);

  if (status === "cancelled") return "Class cancelled";
  if (status === "completed") return "Session ended";
  if (status === "live") {
    const minutesLeft = Math.max(0, Math.ceil((end - now) / 60000));
    return `${minutesLeft} min remaining`;
  }

  const minutesUntil = Math.ceil((start - now) / 60000);

  if (minutesUntil < 60) {
    return `Starts in ${minutesUntil} min`;
  }

  if (minutesUntil < 1440) {
    const hours = Math.floor(minutesUntil / 60);
    const minutes = minutesUntil % 60;
    return minutes ? `Starts in ${hours}h ${minutes}m` : `Starts in ${hours}h`;
  }

  return `Starts ${formatDate(item.scheduled_at)}`;
}

export default function LiveClasses() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState(null);
  const [deletingClass, setDeletingClass] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [now, setNow] = useState(Date.now());

  // Update live/scheduled/completed status as time passes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, STATUS_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, []);

  const loadClasses = useCallback(async (showToast = false) => {
    setLoading((previous) => previous);
    setRefreshing(true);

    const toastId = showToast
      ? toast.loading("Refreshing live classes...")
      : null;

    try {
      const data = await apiRequest(API_BASE);
      const list = unwrapClasses(data);

      setClasses(list);

      if (toastId) {
        toast.success(`Loaded ${list.length} class(es) successfully.`, {
          id: toastId,
        });
      }
    } catch (error) {
      const message = error.message || "Unable to load live classes.";

      if (toastId) {
        toast.error(message, { id: toastId });
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadClasses(false);
  }, [loadClasses]);

  const classesWithStatus = useMemo(
    () =>
      classes.map((item) => ({
        ...item,
        effectiveStatus: getEffectiveStatus(item, now),
      })),
    [classes, now]
  );

  const filteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return classesWithStatus.filter((item) => {
      const matchesSearch = [
        item.title,
        item.course_name,
        item.mentor_name,
      ].some((value) => String(value || "").toLowerCase().includes(query));

      return (
        matchesSearch &&
        (statusFilter === "all" ||
          item.effectiveStatus === statusFilter)
      );
    });
  }, [classesWithStatus, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredClasses.length / itemsPerPage));
  const paginatedClasses = filteredClasses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const startRecord = filteredClasses.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endRecord = Math.min(currentPage * itemsPerPage, filteredClasses.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const stats = useMemo(
    () => ({
      total: classesWithStatus.length,
      upcoming: classesWithStatus.filter(
        (item) => item.effectiveStatus === "scheduled"
      ).length,
      live: classesWithStatus.filter(
        (item) => item.effectiveStatus === "live"
      ).length,
      completed: classesWithStatus.filter(
        (item) => item.effectiveStatus === "completed"
      ).length,
    }),
    [classesWithStatus]
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
    toast.info("Enter the details to schedule a new class.");
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      course_name: item.course_name || "",
      mentor: String(item.mentor ?? ""),
      scheduled_at: toLocalDateTime(item.scheduled_at),
      duration_minutes: item.duration_minutes || 60,
      meeting_url: item.meeting_url || "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    toast.info("Class form closed. No changes were saved.");
  }

  function updateField(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (saving) return;

    if (!form.title.trim()) {
      toast.warning("Please enter a class title.");
      return;
    }

    if (!form.course_name.trim()) {
      toast.warning("Please enter a course name.");
      return;
    }

    if (!form.mentor || Number(form.mentor) <= 0) {
      toast.warning("Enter a valid mentor user ID.");
      return;
    }

    if (!form.scheduled_at) {
      toast.warning("Please choose the class date and start time.");
      return;
    }

    const start = new Date(form.scheduled_at);

    if (Number.isNaN(start.getTime())) {
      toast.error("The selected class date and time are invalid.");
      return;
    }

    const duration = Number(form.duration_minutes);

    if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
      toast.warning("Duration must be between 1 and 1440 minutes.");
      return;
    }

    if (form.meeting_url) {
      try {
        const meetingUrl = new URL(form.meeting_url);

        if (!["http:", "https:"].includes(meetingUrl.protocol)) {
          toast.error("Meeting URL must start with http:// or https://.");
          return;
        }
      } catch {
        toast.error("Please enter a valid meeting URL.");
        return;
      }
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      course_name: form.course_name.trim(),
      mentor: Number(form.mentor),
      scheduled_at: start.toISOString(),
      duration_minutes: duration,
      meeting_url: form.meeting_url.trim(),
      status: "scheduled",
    };

    setSaving(true);

    const toastId = toast.loading(
      editingId ? "Updating class..." : "Scheduling class..."
    );

    try {
      await apiRequest(
        editingId ? `${API_BASE}${editingId}/` : API_BASE,
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        }
      );

      setModalOpen(false);

      toast.success(
        editingId
          ? "Class updated successfully."
          : "Class scheduled successfully.",
        { id: toastId }
      );

      await loadClasses(false);
    } catch (error) {
      toast.error(
        error.message ||
          (editingId ? "Unable to update the class." : "Unable to schedule the class."),
        { id: toastId, duration: 5000 }
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelClass(item) {
    const confirmed = window.confirm(
      `Cancel "${item.title}"? Students should no longer join this session.`
    );

    if (!confirmed) {
      toast.info("Class cancellation was not performed.");
      return;
    }

    const toastId = toast.loading("Cancelling class...");

    try {
      await apiRequest(`${API_BASE}${item.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });

      toast.success("Class cancelled successfully.", { id: toastId });
      await loadClasses(false);
    } catch (error) {
      toast.error(error.message || "Unable to cancel this class.", {
        id: toastId,
      });
    }
  }

  function deleteClass(item) {
    setClassToDelete(item);
    setDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    if (deletingClass) return;
    setDeleteModalOpen(false);
    setClassToDelete(null);
  }

  async function confirmDeleteClass() {
    if (!classToDelete || deletingClass) return;

    const item = classToDelete;
    setDeletingClass(true);

    try {
      await apiRequest(`${API_BASE}${item.id}/`, {
        method: "DELETE",
      });

      setClasses((previous) =>
        previous.filter((classItem) => classItem.id !== item.id)
      );
      setDeleteModalOpen(false);
      setClassToDelete(null);

      toast("Class deleted successfully.", {
        style: {
          background: "#dc2626",
          color: "#ffffff",
          border: "1px solid #b91c1c",
        },
      });
    } catch (error) {
      toast.error(error.message || "Unable to delete this class.");
    } finally {
      setDeletingClass(false);
    }
  }

  function joinClass(item) {
    const status = getEffectiveStatus(item, now);

    if (status !== "live") {
      toast.warning("This class is not live yet.");
      return;
    }

    if (!item.meeting_url) {
      toast.error("No meeting link has been added to this class.");
      return;
    }

    toast.success("Opening your live class...");

    window.open(item.meeting_url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="lc-page">
      <Toaster
        position="top-right"
        duration={3500}
        richColors
        closeButton
        visibleToasts={4}
      />

      <div className="lc-heading">
        <div>
          <span className="lc-eyebrow">LEARNING MANAGEMENT</span>
          <h1>Live Classes</h1>
          <p>Schedule sessions and manage your online classroom.</p>
        </div>

        <button className="lc-primary" onClick={openCreate}>
          <FaPlus /> Schedule class
        </button>
      </div>

      <div className="lc-stats">
        {[
          { label: "Total classes", value: stats.total, icon: <FaCalendarAlt /> },
          { label: "Scheduled", value: stats.upcoming, icon: <FaClock /> },
          { label: "Live now", value: stats.live, icon: <FaVideo /> },
          { label: "Completed", value: stats.completed, icon: <FaCheckCircle /> },
        ].map((stat) => (
          <article className="lc-stat-card" key={stat.label}>
            <span className="lc-stat-icon">{stat.icon}</span>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
            </div>
          </article>
        ))}
      </div>

      <section className="lc-panel">
        <div className="lc-panel-heading">
          <div>
            <h2>Class schedule</h2>
            <p>Class status updates automatically according to date and time.</p>
          </div>

          <button
            className="lc-secondary"
            onClick={() => loadClasses(true)}
            disabled={refreshing}
          >
            <FaSyncAlt className={refreshing ? "lc-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="lc-toolbar">
          <label className="lc-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search class, course, mentor..."
              aria-label="Search classes"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live now</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="lc-table-wrap">
          <table className="lc-table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Course</th>
                <th>Mentor</th>
                <th>Date &amp; time</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="lc-empty">
                    Loading classes...
                  </td>
                </tr>
              ) : filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan="7" className="lc-empty">
                    <span className="lc-empty-icon">▣</span>
                    <strong>No classes found</strong>
                    <p>Schedule a class or change your search filters.</p>
                  </td>
                </tr>
              ) : (
                paginatedClasses.map((item) => {
                  const status = item.effectiveStatus;

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="lc-class-name">{item.title}</div>
                        <div className="lc-subtext">Class #{item.id}</div>
                      </td>

                      <td>{item.course_name || "—"}</td>
                      <td>{item.mentor_name || `Mentor #${item.mentor}`}</td>

                      <td>
                        <div>{formatDate(item.scheduled_at)}</div>
                        <div className="lc-subtext">
                          {getTimeLabel(item, now)}
                        </div>
                      </td>

                      <td>{item.duration_minutes || 60} min</td>

                      <td>
                        <span className={`lc-status lc-status-${status}`}>
                          {status === "live" && (
                            <span className="lc-live-dot" />
                          )}
                          {statusLabel(status)}
                        </span>
                      </td>

                      <td>
                        <div className="lc-actions">
                          {status === "live" && (
                            <button
                              className="lc-action-join"
                              onClick={() => joinClass(item)}
                              title="Join live class"
                            >
                              <FaVideo /> Join Class
                            </button>
                          )}

                          <button
                            className="lc-action-edit"
                            onClick={() => openEdit(item)}
                            title="Edit class"
                          >
                            <FaEdit /> Edit
                          </button>

                          {status !== "cancelled" &&
                            status !== "completed" && (
                              <button
                                className="lc-action-cancel"
                                onClick={() => cancelClass(item)}
                                title="Cancel class"
                              >
                                <FaTimesCircle /> Cancel
                              </button>
                            )}

                          <button
                            className="lc-action-delete"
                            onClick={() => deleteClass(item)}
                            title="Delete class"
                          >
                            <FaTrash /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="lc-table-footer lc-pagination-footer">
          <span className="lc-pagination-info">
            Showing {loading ? 0 : startRecord}–{loading ? 0 : endRecord} of {loading ? 0 : filteredClasses.length} filtered classes ({classes.length} total)
          </span>
          {!loading && filteredClasses.length > 0 && (
            <div className="lc-pagination-controls" aria-label="Live classes pagination">
              <button
                type="button"
                className="lc-page-btn"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  type="button"
                  key={page}
                  className={`lc-page-btn ${currentPage === page ? "active" : ""}`}
                  onClick={() => setCurrentPage(page)}
                  aria-current={currentPage === page ? "page" : undefined}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="lc-page-btn"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>

      {deleteModalOpen && classToDelete && (
        <div
          className="lc-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteModal();
          }}
        >
          <section
            className="lc-modal lc-delete-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="lc-delete-title"
            aria-describedby="lc-delete-description"
          >
            <div className="lc-delete-confirm-icon">
              <FaTrash />
            </div>
            <div className="lc-delete-confirm-content">
              <span className="lc-eyebrow">DELETE LIVE CLASS</span>
              <h2 id="lc-delete-title">Are you sure you want to delete?</h2>
              <p id="lc-delete-description">
                Do you really want to delete{" "}
                <strong>{classToDelete.title}</strong>? This action cannot be
                undone.
              </p>
            </div>
            <div className="lc-modal-actions">
              <button
                type="button"
                className="lc-secondary"
                onClick={closeDeleteModal}
                disabled={deletingClass}
              >
                Cancel
              </button>
              <button
                type="button"
                className="lc-delete-confirm-button"
                onClick={confirmDeleteClass}
                disabled={deletingClass}
              >
                <FaTrash />
                {deletingClass ? "Deleting..." : "Delete class"}
              </button>
            </div>
          </section>
        </div>
      )}

      {modalOpen && (
        <div
          className="lc-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              closeModal();
            }
          }}
        >
          <section
            className="lc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lc-modal-title"
          >
            <div className="lc-modal-heading">
              <div>
                <span className="lc-eyebrow">CLASS MANAGEMENT</span>
                <h2 id="lc-modal-title">
                  {editingId ? "Edit class" : "Schedule a class"}
                </h2>
                <p>Set the session details and meeting link.</p>
              </div>

              <button
                className="lc-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="lc-form-grid">
                <label className="lc-field lc-field-full">
                  Class title *
                  <input
                    name="title"
                    value={form.title}
                    onChange={updateField}
                    required
                    maxLength="200"
                  />
                </label>

                <label className="lc-field lc-field-full">
                  Description
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={updateField}
                    rows="3"
                  />
                </label>

                <label className="lc-field">
                  Course name *
                  <input
                    name="course_name"
                    value={form.course_name}
                    onChange={updateField}
                    required
                    maxLength="200"
                  />
                </label>

                <label className="lc-field">
                  Mentor user ID *
                  <input
                    name="mentor"
                    type="number"
                    min="1"
                    step="1"
                    value={form.mentor}
                    onChange={updateField}
                    required
                  />
                  <small>Enter the mentor's user ID from your backend.</small>
                </label>

                <label className="lc-field">
                  Date &amp; time *
                  <input
                    name="scheduled_at"
                    type="datetime-local"
                    value={form.scheduled_at}
                    onChange={updateField}
                    required
                  />
                </label>

                <label className="lc-field">
                  Duration (minutes) *
                  <input
                    name="duration_minutes"
                    type="number"
                    min="1"
                    max="1440"
                    value={form.duration_minutes}
                    onChange={updateField}
                    required
                  />
                </label>

                <label className="lc-field lc-field-full">
                  Meeting URL
                  <input
                    name="meeting_url"
                    type="url"
                    placeholder="https://..."
                    value={form.meeting_url}
                    onChange={updateField}
                  />
                </label>
              </div>

              <div className="lc-modal-actions">
                <button
                  type="button"
                  className="lc-secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="lc-primary"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Schedule class"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
