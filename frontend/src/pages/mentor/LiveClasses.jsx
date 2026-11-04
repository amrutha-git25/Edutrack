
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  Video,
  Plus,
  Search,
  CalendarDays,
  Clock3,
  ExternalLink,
  Pencil,
  X,
  RefreshCw,
  Radio,
  BookOpen,
  Link2,
  CheckCircle2,
  Users,
} from "lucide-react";

import mentorApi from "../../api/mentorApi";
import "./LiveClasses.css";

const EMPTY_FORM = {
  title: "",
  description: "",
  course_name: "",
  scheduled_at: "",
  duration_minutes: 60,
  meeting_url: "",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All classes" },
  { value: "scheduled", label: "Upcoming" },
  { value: "live", label: "Live now" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
}

function errorMessage(error) {
  const data = error?.response?.data;

  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;

  if (data && typeof data === "object") {
    const messages = Object.entries(data)
      .map(([key, value]) => {
        const message = Array.isArray(value)
          ? value.join(" ")
          : typeof value === "string"
            ? value
            : "";

        return message ? `${key}: ${message}` : "";
      })
      .filter(Boolean);

    if (messages.length) return messages.join(" ");
  }

  return error?.message || "Something went wrong. Please try again.";
}

function formatDate(value) {
  if (!value) return "Date not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "Time not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInput(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

function getClassStartTime(item) {
  return new Date(item.scheduled_at).getTime();
}

/*
 * Automatic status calculation:
 * Before start time                 -> scheduled
 * From start until duration ends    -> live
 * At or after duration end          -> completed
 * Cancelled classes remain cancelled.
 */
function getEffectiveStatus(item, now = Date.now()) {
  if (item.status === "cancelled") return "cancelled";

  const startTime = getClassStartTime(item);

  if (!Number.isFinite(startTime)) {
    return item.status || "scheduled";
  }

  const duration = Math.max(
    1,
    Number(item.duration_minutes) || 60
  );

  const endTime = startTime + duration * 60 * 1000;

  if (now < startTime) return "scheduled";
  if (now < endTime) return "live";

  return "completed";
}

function getStatusLabel(status) {
  return {
    scheduled: "Upcoming",
    live: "Live now",
    completed: "Completed",
    cancelled: "Cancelled",
  }[status] || status;
}

function getInitials(title) {
  return String(title || "LC")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

export default function LiveClasses() {
  const [classes, setClasses] = useState([]);
  const [clockNow, setClockNow] = useState(Date.now());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState(null);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 3;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadClasses = useCallback(
    async (showRefresh = false, notifyRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await mentorApi.get("/mentor/live-classes/");
        setClasses(normalizeList(response.data));

        if (showRefresh && notifyRefresh) {
          toast.success("Live classes refreshed successfully.");
        }
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Update statuses and dashboard counts automatically as time passes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 15000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!modalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !saving) {
        setModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalOpen, saving]);

  const filteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return classes.filter((item) => {
      const status = getEffectiveStatus(item, clockNow);

      const matchesStatus =
        activeFilter === "all" || status === activeFilter;

      const matchesSearch =
        !query ||
        [
          item.title,
          item.course_name,
          item.description,
          item.mentor_name,
        ].some((value) =>
          String(value || "").toLowerCase().includes(query)
        );

      return matchesStatus && matchesSearch;
    });
  }, [classes, search, activeFilter, clockNow]);

  const totalPages = Math.max(1, Math.ceil(filteredClasses.length / ITEMS_PER_PAGE));
  const paginatedClasses = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredClasses.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredClasses, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const stats = useMemo(() => {
    const statuses = classes.map((item) =>
      getEffectiveStatus(item, clockNow)
    );

    return {
      total: classes.length,
      upcoming: statuses.filter(
        (status) => status === "scheduled"
      ).length,
      live: statuses.filter(
        (status) => status === "live"
      ).length,
      completed: statuses.filter(
        (status) => status === "completed"
      ).length,
    };
  }, [classes, clockNow]);

  const openCreateModal = () => {
    setEditingClass(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEditModal = (item) => {
    if (getEffectiveStatus(item) !== "scheduled") {
      toast.error("Only upcoming classes can be edited.");
      return;
    }

    setEditingClass(item);

    setForm({
      title: item.title || "",
      description: item.description || "",
      course_name: item.course_name || "",
      scheduled_at: toLocalInput(item.scheduled_at),
      duration_minutes: item.duration_minutes || 60,
      meeting_url: item.meeting_url || "",
    });

    setModalOpen(true);
  };

  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.title.trim() || !form.course_name.trim()) {
      toast.error("Enter a class title and course name.");
      return;
    }

    if (!form.scheduled_at) {
      toast.error("Please select the class date and time.");
      return;
    }

    if (new Date(form.scheduled_at).getTime() <= Date.now()) {
      toast.error("Choose a future date and time.");
      return;
    }

    if (
      form.meeting_url.trim() &&
      !/^https?:\/\/\S+/i.test(form.meeting_url.trim())
    ) {
      toast.error(
        "Enter a valid meeting link beginning with https:// or http://."
      );
      return;
    }

    const duration = Number(form.duration_minutes);

    if (!Number.isFinite(duration) || duration < 1) {
      toast.error("Class duration must be at least one minute.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      course_name: form.course_name.trim(),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_minutes: duration,
      meeting_url: form.meeting_url.trim(),
    };

    setSaving(true);

    try {
      if (editingClass) {
        const response = await mentorApi.patch(
          `/mentor/live-classes/${editingClass.id}/`,
          payload
        );

        const updated = response.data?.class;

        setClasses((current) =>
          current.map((item) =>
            item.id === editingClass.id
              ? updated || { ...item, ...payload }
              : item
          )
        );

        toast.success("Live class updated successfully.");
      } else {
        const response = await mentorApi.post(
          "/mentor/live-classes/",
          payload
        );

        const created = response.data?.class;

        if (created) {
          setClasses((current) =>
            [...current, created].sort(
              (a, b) =>
                getClassStartTime(a) - getClassStartTime(b)
            )
          );
        } else {
          await loadClasses();
        }

        toast.success("Live class scheduled successfully.");
      }

      setModalOpen(false);
      setEditingClass(null);
      setForm({ ...EMPTY_FORM });
      setClockNow(Date.now());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const cancelClass = async (item) => {
    if (getEffectiveStatus(item) !== "scheduled") {
      toast.error("Only upcoming classes can be cancelled.");
      return;
    }

    const confirmed = window.confirm(
      `Cancel "${item.title}"? Students may no longer be able to join this class.`
    );

    if (!confirmed) return;

    setActionId(item.id);

    try {
      await mentorApi.patch(
        `/mentor/live-classes/${item.id}/`,
        { status: "cancelled" }
      );

      setClasses((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, status: "cancelled" }
            : row
        )
      );

      toast.success("Live class cancelled successfully.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setActionId(null);
    }
  };

  const startClass = async (item) => {
    if (!item.meeting_url) {
      toast.error(
        "Add a meeting link before starting this class."
      );
      return;
    }

    // Open the meeting provider. EduTrack does not host video calls.
    const newWindow = window.open(
      item.meeting_url,
      "_blank",
      "noopener,noreferrer"
    );

    if (!newWindow) {
      toast.error(
        "The meeting window was blocked. Allow pop-ups and try again."
      );
      return;
    }

    // Record the start through the existing API, if available.
    setActionId(item.id);

    try {
      await mentorApi.post(
        `/mentor/live-classes/${item.id}/start/`
      );

      toast.success(
        "Meeting opened. Class status follows its scheduled time and duration."
      );
    } catch (error) {
      // The meeting is already open, so do not hide that fact.
      toast.warning(
        `Meeting opened, but the server could not record the start: ${errorMessage(error)}`
      );
    } finally {
      setActionId(null);
      setClockNow(Date.now());
    }
  };

  const joinClass = (item) => {
    if (!item.meeting_url) {
      toast.error("No meeting link has been added to this class.");
      return;
    }

    const newWindow = window.open(
      item.meeting_url,
      "_blank",
      "noopener,noreferrer"
    );

    if (!newWindow) {
      toast.error(
        "The meeting window was blocked. Allow pop-ups and try again."
      );
      return;
    }

    toast.success("Opening the live class meeting.");
  };

  return (
    <>
      <Toaster position="top-right" richColors closeButton />

      <main className="lc-page">
        <header className="lc-heading">
          <div>
            <span className="lc-eyebrow">
              <Video size={14} />
              TEACHING SPACE
            </span>

            <h1>Live Classes</h1>

            <p>
              Plan sessions, manage schedules and connect with your students.
            </p>
          </div>

          <div className="lc-heading-actions">
            <button
              type="button"
              className="lc-button lc-button-secondary"
              onClick={() => loadClasses(true, true)}
              disabled={refreshing || loading}
            >
              <RefreshCw
                size={16}
                className={refreshing ? "lc-spin" : ""}
              />
              Refresh
            </button>

            <button
              type="button"
              className="lc-button lc-button-primary"
              onClick={openCreateModal}
            >
              <Plus size={18} />
              Schedule class
            </button>
          </div>
        </header>

        <section className="lc-stats">
          <article className="lc-stat-card">
            <span className="lc-stat-icon lc-stat-purple">
              <Video size={20} />
            </span>
            <div>
              <span>Total classes</span>
              <strong>{loading ? "—" : stats.total}</strong>
              <small>All your sessions</small>
            </div>
          </article>

          <article className="lc-stat-card">
            <span className="lc-stat-icon lc-stat-blue">
              <CalendarDays size={20} />
            </span>
            <div>
              <span>Upcoming</span>
              <strong>{loading ? "—" : stats.upcoming}</strong>
              <small>Classes not yet started</small>
            </div>
          </article>

          <article className="lc-stat-card">
            <span className="lc-stat-icon lc-stat-green">
              <Radio size={20} />
            </span>
            <div>
              <span>Live now</span>
              <strong>{loading ? "—" : stats.live}</strong>
              <small>Within their scheduled duration</small>
            </div>
          </article>

          <article className="lc-stat-card">
            <span className="lc-stat-icon lc-stat-orange">
              <CheckCircle2 size={20} />
            </span>
            <div>
              <span>Completed</span>
              <strong>{loading ? "—" : stats.completed}</strong>
              <small>Scheduled duration has ended</small>
            </div>
          </article>
        </section>

        <section className="lc-list-panel">
          <div className="lc-list-heading">
            <div>
              <h2>Your class schedule</h2>
              <p>
                View and manage classes for your assigned courses.
              </p>
            </div>

            <span className="lc-result-count">
              {filteredClasses.length}{" "}
              {filteredClasses.length === 1 ? "class" : "classes"}
            </span>
          </div>

          <div className="lc-toolbar">
            <label className="lc-search">
              <Search size={17} />
              <input
                type="search"
                placeholder="Search classes or courses..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className="lc-filter-wrap">
              <span className="lc-sr-only">
                Filter classes by status
              </span>

              <select
                value={activeFilter}
                onChange={(event) => setActiveFilter(event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <div className="lc-state">
              <span className="lc-loader" />
              <strong>Loading your live classes</strong>
              <p>Fetching your schedule from EduTrack.</p>
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className="lc-state">
              <span className="lc-empty-icon">
                <Video size={28} />
              </span>

              <strong>
                {search || activeFilter !== "all"
                  ? "No classes match your filters"
                  : "Your schedule is clear"}
              </strong>

              <p>
                {search || activeFilter !== "all"
                  ? "Try another search or status filter."
                  : "Schedule your first live class for an assigned course."}
              </p>

              {!search && activeFilter === "all" && (
                <button
                  type="button"
                  className="lc-button lc-button-primary"
                  onClick={openCreateModal}
                >
                  <Plus size={17} />
                  Schedule your first class
                </button>
              )}
            </div>
          ) : (
            <div className="lc-class-list">
              {paginatedClasses.map((item) => {
                const status = getEffectiveStatus(item, clockNow);

                return (
                  <article className="lc-class-card" key={item.id}>
                    <div className="lc-class-avatar">
                      {getInitials(item.title)}
                    </div>

                    <div className="lc-class-main">
                      <div className="lc-class-title-row">
                        <h3>{item.title}</h3>

                        <span className={`lc-status lc-status-${status}`}>
                          {status === "live" && (
                            <span className="lc-live-dot" />
                          )}
                          {getStatusLabel(status)}
                        </span>
                      </div>

                      <div className="lc-course-name">
                        <BookOpen size={15} />
                        {item.course_name}
                      </div>

                      {item.description && (
                        <p className="lc-class-description">
                          {item.description}
                        </p>
                      )}

                      <div className="lc-class-meta">
                        <span>
                          <CalendarDays size={15} />
                          {formatDate(item.scheduled_at)}
                        </span>

                        <span>
                          <Clock3 size={15} />
                          {formatTime(item.scheduled_at)}
                        </span>

                        <span>
                          <Video size={15} />
                          {item.duration_minutes || 60} min
                        </span>
                      </div>
                    </div>

                    <div className="lc-class-actions">
                      {status === "scheduled" && (
                        <>
                          <button
                            type="button"
                            className="lc-icon-button"
                            title="Edit class"
                            aria-label={`Edit ${item.title}`}
                            onClick={() => openEditModal(item)}
                          >
                            <Pencil size={17} />
                          </button>

                          <button
                            type="button"
                            className="lc-icon-button lc-danger-icon"
                            title="Cancel class"
                            aria-label={`Cancel ${item.title}`}
                            disabled={actionId === item.id}
                            onClick={() => cancelClass(item)}
                          >
                            <X size={18} />
                          </button>

                          <button
                            type="button"
                            className="lc-button lc-button-primary lc-join-button"
                            disabled={actionId === item.id}
                            onClick={() => startClass(item)}
                          >
                            <Video size={16} />
                            {actionId === item.id
                              ? "Opening..."
                              : "Start class"}
                          </button>
                        </>
                      )}

                      {status === "live" && (
                        <button
                          type="button"
                          className="lc-button lc-button-live lc-join-button"
                          onClick={() => joinClass(item)}
                        >
                          <ExternalLink size={16} />
                          Join class
                        </button>
                      )}

                      {status === "completed" && (
                        <span className="lc-finished-label">
                          <CheckCircle2 size={16} />
                          Finished
                        </span>
                      )}

                      {status === "cancelled" && (
                        <span className="lc-finished-label">
                          Cancelled
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!loading && filteredClasses.length > 0 && (
            <div className="lc-pagination">
              <span className="lc-pagination-info">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredClasses.length)} of {filteredClasses.length} classes
              </span>
              <div className="lc-pagination-controls">
                <button
                  type="button"
                  className="lc-pagination-button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span className="lc-pagination-page">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="lc-pagination-button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        <footer className="lc-footer-note">
          <Users size={16} />
          <span>
            Only classes belonging to your authorized courses are shown.
          </span>
        </footer>

        {modalOpen && (
          <div
            className="lc-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !saving) {
                setModalOpen(false);
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
                <div className="lc-modal-heading-icon">
                  <Video size={21} />
                </div>

                <div>
                  <h2 id="lc-modal-title">
                    {editingClass
                      ? "Edit live class"
                      : "Schedule a live class"}
                  </h2>
                  <p>Set the session details for your students.</p>
                </div>

                <button
                  type="button"
                  className="lc-icon-button"
                  aria-label="Close modal"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                >
                  <X size={19} />
                </button>
              </div>

              <form className="lc-form" onSubmit={handleSubmit}>
                <label className="lc-field lc-field-full">
                  <span>Class title <i>*</i></span>
                  <input
                    name="title"
                    value={form.title}
                    onChange={updateField}
                    placeholder="e.g. React Hooks Masterclass"
                    maxLength={200}
                    required
                  />
                </label>

                <label className="lc-field lc-field-full">
                  <span>Assigned course <i>*</i></span>
                  <input
                    name="course_name"
                    value={form.course_name}
                    onChange={updateField}
                    placeholder="Enter the exact assigned course title"
                    maxLength={200}
                    required
                  />
                  <small>
                    Use the exact course title assigned to your mentor account.
                  </small>
                </label>

                <label className="lc-field lc-field-full">
                  <span>Description</span>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={updateField}
                    placeholder="What will students learn in this session?"
                    rows={3}
                  />
                </label>

                <label className="lc-field">
                  <span>Date and time <i>*</i></span>
                  <input
                    type="datetime-local"
                    name="scheduled_at"
                    value={form.scheduled_at}
                    onChange={updateField}
                    min={toLocalInput(
                      new Date(Date.now() + 60000).toISOString()
                    )}
                    required
                  />
                </label>

                <label className="lc-field">
                  <span>Duration</span>
                  <select
                    name="duration_minutes"
                    value={form.duration_minutes}
                    onChange={updateField}
                  >
                    {[30, 45, 60, 90, 120, 180].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} minutes
                      </option>
                    ))}
                  </select>
                </label>

                <label className="lc-field lc-field-full">
                  <span>Meeting link</span>
                  <div className="lc-input-with-icon">
                    <Link2 size={17} />
                    <input
                      type="url"
                      name="meeting_url"
                      value={form.meeting_url}
                      onChange={updateField}
                      placeholder="https://meet.google.com/..."
                    />
                  </div>
                  <small>
                    Paste your Google Meet, Zoom or other meeting URL.
                  </small>
                </label>

                <div className="lc-form-actions">
                  <button
                    type="button"
                    className="lc-button lc-button-secondary"
                    disabled={saving}
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="lc-button lc-button-primary"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <span className="lc-button-spinner" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Plus size={17} />
                        {editingClass ? "Save changes" : "Schedule class"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
