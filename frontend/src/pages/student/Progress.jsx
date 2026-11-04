import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  GraduationCap,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import "./Progress.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

function getAccessToken() {
  return (
    sessionStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    ""
  );
}

function formatDate(value) {
  if (!value) return "Recently enrolled";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently enrolled";
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStatus(status, progress) {
  if (String(status).toLowerCase() === "cancelled") {
    return { label: "Cancelled", className: "cancelled" };
  }

  if (
    String(status).toLowerCase() === "completed" ||
    Number(progress) >= 100
  ) {
    return { label: "Completed", className: "completed" };
  }

  return { label: "In progress", className: "active" };
}

function Progress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProgress = useCallback(async (showToast = false) => {
    setLoading(true);
    setError("");

    try {
      const token = getAccessToken();

      if (!token) {
        throw new Error(
          "Your login session was not found. Please log in again."
        );
      }

      const response = await fetch(
        `${API_BASE_URL}/courses/student/progress/`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.message ||
            result.detail ||
            `Unable to load progress (HTTP ${response.status}).`
        );
      }

      if (result.success === false) {
        throw new Error(
          result.message || "Unable to load your progress."
        );
      }

      const payload = result.data || result;

      setData({
        overview: payload.overview || {},
        courses: Array.isArray(payload.courses)
          ? payload.courses
          : [],
      });

      if (showToast) {
        toast.success("Your learning progress has been refreshed.");
      }
    } catch (err) {
      const message = err.message || "Something went wrong.";

      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const overview = data?.overview || {};
  const courses = data?.courses || [];

  const totalCourses = Number(overview.total_courses || 0);
  const activeCourses = Number(overview.active_courses || 0);
  const completedCourses = Number(overview.completed_courses || 0);

  const overallProgress = Math.max(
    0,
    Math.min(100, Number(overview.overall_progress || 0))
  );

  const stats = [
    {
      label: "Enrolled courses",
      value: totalCourses,
      note: "Your learning journey",
      icon: BookOpen,
      className: "blue",
    },
    {
      label: "In progress",
      value: activeCourses,
      note: "Courses you're learning",
      icon: Activity,
      className: "purple",
    },
    {
      label: "Completed",
      value: completedCourses,
      note: "Courses finished",
      icon: CheckCircle2,
      className: "green",
    },
    {
      label: "Overall progress",
      value: `${overallProgress}%`,
      note: "Average course completion",
      icon: TrendingUp,
      className: "orange",
    },
  ];

  const handleRefresh = () => {
    toast.info("Refreshing your learning progress...");
    loadProgress(true);
  };

  const handleRetry = () => {
    toast.info("Trying to load your progress again...");
    loadProgress(true);
  };

  return (
    <main className="student-progress-page">
      {/* Page header */}
      <header className="progress-page-header">
        <div>
          <div className="progress-eyebrow">
            <GraduationCap size={16} />
            STUDENT ANALYTICS
          </div>

          <h1>My Progress</h1>

          <p>
            Track your learning journey, course completion, and
            achievements in one place.
          </p>
        </div>

        <button
          type="button"
          className="progress-refresh-button"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={loading ? "progress-spinning" : ""}
          />

          {loading ? "Loading..." : "Refresh"}
        </button>
      </header>

      {/* Error message */}
      {error && (
        <section className="progress-error" role="alert">
          <div>
            <strong>Couldn't load your progress</strong>
            <p>{error}</p>
          </div>

          <button type="button" onClick={handleRetry}>
            Try again
          </button>
        </section>
      )}

      {/* Overall progress hero */}
      <section className="progress-hero">
        <div className="progress-hero-content">
          <span className="progress-hero-label">
            <Target size={16} />
            YOUR LEARNING OVERVIEW
          </span>

          <h2>Every step forward counts.</h2>

          <p>
            Keep learning consistently and build your skills one
            course at a time.
          </p>

          <div className="progress-hero-stats">
            <div>
              <strong>
                {loading && !data ? "—" : `${overallProgress}%`}
              </strong>
              <span>Overall completion</span>
            </div>

            <div className="progress-hero-divider" />

            <div>
              <strong>
                {loading && !data ? "—" : completedCourses}
              </strong>
              <span>Courses completed</span>
            </div>
          </div>
        </div>

        <div
          className="progress-ring"
          role="img"
          aria-label={`Overall progress ${overallProgress}%`}
          style={{
            "--progress-value": `${overallProgress}%`,
          }}
        >
          <div className="progress-ring-inner">
            <strong>
              {loading && !data ? "—" : `${overallProgress}%`}
            </strong>

            <span>Completed</span>
          </div>
        </div>
      </section>

      {/* Statistics cards */}
      <section className="progress-stat-grid">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <article
              className="progress-stat-card"
              key={stat.label}
            >
              <div className="progress-stat-top">
                <span className="progress-stat-label">
                  {stat.label}
                </span>

                <span
                  className={`progress-stat-icon ${stat.className}`}
                >
                  <Icon size={20} />
                </span>
              </div>

              <strong className="progress-stat-value">
                {loading && !data ? "—" : stat.value}
              </strong>

              <p>{stat.note}</p>
            </article>
          );
        })}
      </section>

      {/* Individual course progress */}
      <section className="progress-courses-section">
        <div className="progress-section-heading">
          <div>
            <span className="progress-section-kicker">
              LEARNING ACTIVITY
            </span>

            <h2>Course progress</h2>

            <p>
              View the completion percentage of each enrolled course.
            </p>
          </div>

          <span className="progress-course-count">
            <BookOpen size={15} />
            {loading && !data ? "—" : `${courses.length} courses`}
          </span>
        </div>

        {loading && !data ? (
          <div className="progress-course-grid">
            {[1, 2, 3].map((item) => (
              <div
                className="progress-course-skeleton"
                key={item}
              >
                <div className="progress-skeleton-line short" />
                <div className="progress-skeleton-line medium" />
                <div className="progress-skeleton-line" />
                <div className="progress-skeleton-line short" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="progress-empty-state">
            <Activity size={32} />

            <h3>Progress is temporarily unavailable</h3>

            <p>
              Refresh the page after checking your connection.
            </p>

            <button
              type="button"
              className="progress-refresh-button"
              onClick={handleRetry}
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="progress-empty-state">
            <BookOpen size={34} />

            <h3>No course progress yet</h3>

            <p>
              Your enrolled courses will appear here when they are
              available.
            </p>
          </div>
        ) : (
          <div className="progress-course-grid">
            {courses.map((course) => {
              const percentage = Math.max(
                0,
                Math.min(100, Number(course.progress || 0))
              );

              const status = getStatus(
                course.status,
                percentage
              );

              return (
                <article
                  className="progress-course-card"
                  key={course.id}
                >
                  <div className="progress-course-card-top">
                    <div className="progress-course-icon">
                      <BookOpen size={21} />
                    </div>

                    <span
                      className={`progress-status-badge ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <span className="progress-course-category">
                    {course.category || "COURSE"}
                  </span>

                  <h3>{course.title || "Untitled course"}</h3>

                  <div className="progress-course-meta">
                    <span>
                      <Clock3 size={14} />
                      {formatDate(course.enrolled_at)}
                    </span>

                    <strong>{percentage}%</strong>
                  </div>

                  <div
                    className="progress-bar-track"
                    role="progressbar"
                    aria-label={`${course.title || "Course"} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percentage}
                  >
                    <div
                      className={`progress-bar-fill ${
                        status.className === "completed"
                          ? "is-completed"
                          : ""
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <div className="progress-course-footer">
                    <span>
                      {percentage >= 100
                        ? "Course completed"
                        : `${100 - percentage}% remaining`}
                    </span>

                    <ArrowUpRight size={16} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="progress-page-footer">
        <CheckCircle2 size={16} />

        <span>
          Your progress reflects the latest information recorded
          for your enrolled courses.
        </span>
      </footer>
    </main>
  );
}

export default Progress;