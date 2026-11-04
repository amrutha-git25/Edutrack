
import { useEffect, useRef, useState } from "react";
import {
  FiBookOpen,
  FiSearch,
  FiUsers,
  FiLayers,
  FiArrowUpRight,
  FiRefreshCw,
  FiX,
  FiCheckCircle,
  FiAlertCircle,
  FiInfo,
} from "react-icons/fi";
import "./MyCourses.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

function getAccessToken() {
  return (
    localStorage.getItem("access") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token")
  );
}

async function requestCourses(path, signal) {
  const token = getAccessToken();

  if (!token) {
    throw new Error("Your session has expired. Please log in again.");
  }

  const response = await fetch(`${API_BASE}/mentor/courses/${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Please log in again.");
    }

    if (response.status === 403) {
      throw new Error(
        result.message ||
          result.detail ||
          "You don't have permission to access these courses."
      );
    }

    throw new Error(
      result.message ||
        result.detail ||
        "Unable to load your assigned courses."
    );
  }

  return result;
}

function formatStatus(status) {
  if (!status) return "Assigned";

  return String(status)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Toast({ toast, onClose }) {
  if (!toast) return null;

  const toastTypes = {
    success: {
      icon: <FiCheckCircle />,
      color: "#16a34a",
      background: "#f0fdf4",
      border: "#bbf7d0",
    },
    error: {
      icon: <FiAlertCircle />,
      color: "#dc2626",
      background: "#fef2f2",
      border: "#fecaca",
    },
    info: {
      icon: <FiInfo />,
      color: "#2563eb",
      background: "#eff6ff",
      border: "#bfdbfe",
    },
  };

  const style = toastTypes[toast.type] || toastTypes.info;

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      style={{
        position: "fixed",
        top: "22px",
        right: "22px",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "min(390px, calc(100vw - 32px))",
        padding: "15px 16px",
        border: `1px solid ${style.border}`,
        borderLeft: `4px solid ${style.color}`,
        borderRadius: "12px",
        background: style.background,
        color: "#1f2937",
        boxShadow: "0 12px 35px rgba(0,0,0,0.16)",
        animation: "mcToastEnter 0.25s ease",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          color: style.color,
          fontSize: "21px",
          flexShrink: 0,
        }}
      >
        {style.icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <strong
          style={{
            display: "block",
            fontSize: "13px",
            marginBottom: "3px",
          }}
        >
          {toast.title}
        </strong>

        <p
          style={{
            margin: 0,
            fontSize: "12px",
            lineHeight: 1.5,
            overflowWrap: "anywhere",
          }}
        >
          {toast.message}
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        style={{
          display: "grid",
          placeItems: "center",
          border: 0,
          background: "transparent",
          color: "#6b7280",
          cursor: "pointer",
          fontSize: "17px",
          padding: "4px",
          flexShrink: 0,
        }}
      >
        <FiX />
      </button>

      <style>
        {`
          @keyframes mcToastEnter {
            from {
              opacity: 0;
              transform: translateX(16px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}
      </style>
    </div>
  );
}

export default function MyCourses() {
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);

  const toastTimer = useRef(null);
  const hasLoadedSuccessfully = useRef(false);

  function showToast(message, type = "info", title) {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }

    const titles = {
      success: "Success",
      error: "Something went wrong",
      info: "Information",
    };

    setToast({
      id: Date.now(),
      message,
      type,
      title: title || titles[type] || "Notification",
    });

    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 4000);
  }

  function dismissToast() {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }

    setToast(null);
  }

  function retryCourses() {
    setError("");
    setRefreshKey((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();

        if (search.trim()) {
          params.set("search", search.trim());
        }

        const suffix = params.toString()
          ? `?${params.toString()}`
          : "";

        const result = await requestCourses(
          suffix,
          controller.signal
        );

        const courseList = Array.isArray(result.courses)
          ? result.courses
          : Array.isArray(result.results)
            ? result.results
            : [];

        setCourses(courseList);

        if (!hasLoadedSuccessfully.current) {
          hasLoadedSuccessfully.current = true;
          showToast(
            courseList.length
              ? `${courseList.length} assigned ${
                  courseList.length === 1 ? "course" : "courses"
                } loaded successfully.`
              : "Your courses were loaded. No courses are assigned yet.",
            "success",
            "Courses loaded"
          );
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          const message =
            err.message || "Unable to load your assigned courses.";

          setError(message);
          showToast(message, "error", "Unable to load courses");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, refreshKey]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  async function openCourse(course) {
    setSelectedCourse(course);
    setDetailLoading(true);

    try {
      const result = await requestCourses(`${course.id}/`);

      if (result.course) {
        setSelectedCourse((current) =>
          current?.id === course.id ? result.course : current
        );
      }

      showToast(
        "Course details loaded successfully.",
        "success",
        "Course details"
      );
    } catch (err) {
      if (err.name !== "AbortError") {
        const message =
          err.message || "Unable to load course details.";

        showToast(message, "error", "Course details failed");
      }
    } finally {
      setDetailLoading(false);
    }
  }

  const totalStudents = courses.reduce(
    (total, course) =>
      total +
      (Number(
        course.enrolled_students ?? course.student_count
      ) || 0),
    0
  );

  const totalTopics = courses.reduce(
    (total, course) =>
      total +
      (Number(
        course.topics_count ?? course.module_count
      ) || 0),
    0
  );

  return (
    <main className="mentor-courses-page">
      <Toast toast={toast} onClose={dismissToast} />

      <header className="mc-page-header">
        <div>
          <span className="mc-eyebrow">
            LEARNING MANAGEMENT
          </span>

          <h1>My Courses</h1>

          <p>
            View your assigned courses and explore their learning
            content.
          </p>
        </div>

        <div className="mc-header-icon" aria-hidden="true">
          <FiBookOpen />
        </div>
      </header>

      <section className="mc-stats" aria-label="Course summary">
        <article className="mc-stat-card">
          <span className="mc-stat-icon">
            <FiBookOpen />
          </span>

          <div>
            <span className="mc-stat-label">
              Assigned Courses
            </span>
            <strong>{loading ? "—" : courses.length}</strong>
          </div>
        </article>

        <article className="mc-stat-card">
          <span className="mc-stat-icon">
            <FiUsers />
          </span>

          <div>
            <span className="mc-stat-label">
              Enrolled Students
            </span>
            <strong>{loading ? "—" : totalStudents}</strong>
          </div>
        </article>

        <article className="mc-stat-card">
          <span className="mc-stat-icon">
            <FiLayers />
          </span>

          <div>
            <span className="mc-stat-label">
              Course Topics
            </span>
            <strong>{loading ? "—" : totalTopics}</strong>
          </div>
        </article>
      </section>

      <section className="mc-course-section">
        <div className="mc-section-heading">
          <div>
            <h2>Your Assigned Courses</h2>
            <p>
              Courses assigned to you by the EduTrack administrator.
            </p>
          </div>

          <span className="mc-result-count">
            {courses.length}{" "}
            {courses.length === 1 ? "course" : "courses"}
          </span>
        </div>

        <label className="mc-search">
          <FiSearch aria-hidden="true" />

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by course name or description..."
            aria-label="Search assigned courses"
          />

          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <FiX />
            </button>
          )}
        </label>

        {error && (
          <div className="mc-error" role="alert">
            <span>{error}</span>

            <button
              type="button"
              onClick={retryCourses}
              disabled={loading}
            >
              <FiRefreshCw
                className={loading ? "mc-spin" : ""}
              />
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="mc-state">
            <span className="mc-spinner" />
            <p>Loading your assigned courses...</p>
          </div>
        ) : !error && courses.length === 0 ? (
          <div className="mc-state mc-empty">
            <span className="mc-empty-icon">
              <FiBookOpen />
            </span>

            <h3>
              {search
                ? "No matching courses"
                : "No courses assigned yet"}
            </h3>

            <p>
              {search
                ? "Try another search term."
                : "Courses assigned to you by the administrator will appear here."}
            </p>

            {!search && (
              <button
                type="button"
                className="mc-secondary-button"
                onClick={retryCourses}
              >
                <FiRefreshCw /> Refresh courses
              </button>
            )}
          </div>
        ) : (
          <div className="mc-course-grid">
            {courses.map((course) => (
              <article
                className="mc-course-card"
                key={course.id}
              >
                <div className="mc-course-cover">
                  {course.image ? (
                    <img
                      src={course.image}
                      alt={course.title || "Course"}
                    />
                  ) : (
                    <div className="mc-cover-placeholder">
                      <FiBookOpen />
                      <span>EDUTRACK COURSE</span>
                    </div>
                  )}

                  <span className="mc-course-status">
                    {formatStatus(course.status)}
                  </span>
                </div>

                <div className="mc-course-body">
                  <div className="mc-course-category">
                    {course.category || "Learning Programme"}
                  </div>

                  <h3>
                    {course.title ||
                      course.name ||
                      "Untitled Course"}
                  </h3>

                  <p className="mc-course-description">
                    {course.description ||
                      "Explore the topics and learning materials for this course."}
                  </p>

                  <div className="mc-course-meta">
                    <span>
                      <FiUsers />{" "}
                      {course.enrolled_students ??
                        course.student_count ??
                        "—"}{" "}
                      students
                    </span>

                    <span>
                      <FiLayers />{" "}
                      {course.topics_count ??
                        course.module_count ??
                        "—"}{" "}
                      topics
                    </span>
                  </div>

                  <button
                    type="button"
                    className="mc-open-button"
                    onClick={() => openCourse(course)}
                  >
                    View Course Details <FiArrowUpRight />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedCourse && (
        <div
          className="mc-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedCourse(null);
            }
          }}
        >
          <section
            className="mc-course-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mc-modal-title"
          >
            <header className="mc-modal-header">
              <div>
                <span className="mc-eyebrow">
                  COURSE OVERVIEW
                </span>

                <h2 id="mc-modal-title">
                  {selectedCourse.title ||
                    selectedCourse.name ||
                    "Course Details"}
                </h2>
              </div>

              <button
                type="button"
                className="mc-modal-close"
                onClick={() => setSelectedCourse(null)}
                aria-label="Close course details"
              >
                <FiX />
              </button>
            </header>

            {detailLoading ? (
              <div className="mc-state">
                <span className="mc-spinner" />
                <p>Loading course details...</p>
              </div>
            ) : (
              <>
                <p className="mc-modal-description">
                  {selectedCourse.description ||
                    "No course description provided."}
                </p>

                <div className="mc-modal-facts">
                  <div>
                    <span>Status</span>
                    <strong>
                      {formatStatus(selectedCourse.status)}
                    </strong>
                  </div>

                  <div>
                    <span>Students</span>
                    <strong>
                      {selectedCourse.enrolled_students ??
                        selectedCourse.student_count ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Topics</span>
                    <strong>
                      {selectedCourse.topics_count ??
                        selectedCourse.module_count ??
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Category</span>
                    <strong>
                      {selectedCourse.category || "—"}
                    </strong>
                  </div>
                </div>

                <p className="mc-modal-note">
                  Topic and learning-material management is available
                  through the Mentor Topics &amp; Materials module.
                </p>
              </>
            )}

            <footer className="mc-modal-footer">
              <button
                type="button"
                className="mc-secondary-button"
                onClick={() => setSelectedCourse(null)}
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
