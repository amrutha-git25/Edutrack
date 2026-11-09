import { useEffect, useMemo, useState } from "react";
import {
  FaBookOpen,
  FaClipboardCheck,
  FaTasks,
  FaChartLine,
  FaClock,
  FaArrowRight,
  FaPlay,
  FaFire,
  FaBullseye,
  FaGraduationCap,
  FaFileAlt,
} from "react-icons/fa";
import "./StudentDashboard.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com"
).replace(/\/+$/, "");

function getAccessToken() {
  // Supports the common token keys used by the EduTrack login flow.
  const directKeys = ["access", "access_token", "accessToken"];
  for (const key of directKeys) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token) return token;
  }

  // Supports projects that store the JWT pair as a JSON object.
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of ["tokens", "authTokens", "auth_tokens"]) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.access) return parsed.access;
        if (parsed?.access_token) return parsed.access_token;
      } catch {
        // Ignore non-JSON values and continue checking.
      }
    }
  }
  return "";
}

function getStoredStudentName() {
  const storedUser =
    localStorage.getItem("user") || sessionStorage.getItem("user");
  if (!storedUser) return "Student";
  try {
    const user = JSON.parse(storedUser);
    return (
      user.first_name ||
      user.full_name?.split(" ")[0] ||
      user.name?.split(" ")[0] ||
      user.email?.split("@")[0] ||
      "Student"
    );
  } catch {
    return "Student";
  }
}

function normalizeDashboard(payload) {
  // Backend response shape: { success: true, data: { student, summary, courses, tasks, study_activity } }
  const data = payload?.data ?? payload ?? {};
  const summary = data.summary ?? {};
  const courses = Array.isArray(data.courses) ? data.courses : [];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const studyActivity = Array.isArray(data.study_activity)
    ? data.study_activity
    : [];

  return {
    student: data.student ?? {},
    summary: {
      enrolled_courses: Number(summary.enrolled_courses ?? courses.length),
      completed_lessons: Number(summary.completed_lessons ?? 0),
      overall_progress: Number(summary.overall_progress ?? 0),
      pending_tasks: Number(summary.pending_tasks ?? tasks.length),
      study_hours: Number(summary.study_hours ?? 0),
      active_days: Number(summary.active_days ?? 0),
      current_streak: Number(summary.current_streak ?? 0),
    },
    courses: courses.map((course, index) => ({
      id: course.id ?? `${course.title ?? "course"}-${index}`,
      title: course.title ?? course.name ?? "Untitled course",
      category: course.category ?? course.category_name ?? "Course",
      progress: clampPercent(course.progress ?? course.progress_percentage ?? 0),
      status: course.status ?? "Active",
      totalLessons: Number(course.total_lessons ?? course.lesson_count ?? 0),
      nextLesson: course.next_lesson ?? "",
      description: course.description ?? "",
      color: ["violet", "blue", "orange", "green"][index % 4],
    })),
    tasks: tasks.map((task, index) => ({
      id: task.id ?? `task-${index}`,
      title: task.title ?? task.name ?? "Assignment",
      course: task.course ?? task.course_title ?? "Course",
      dueDate: task.due_date ?? task.deadline ?? null,
      status: task.status ?? "Pending",
    })),
    studyActivity: studyActivity.map((day) => ({
      date: day.date,
      hours: Math.max(0, Number(day.hours ?? 0)),
    })),
  };
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function ProgressBar({ value, color = "violet" }) {
  const safeValue = clampPercent(value);
  return (
    <div
      className="student-progress-track"
      role="progressbar"
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${safeValue}% complete`}
    >
      <span
        className={`student-progress-fill ${color}`}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, detail, color }) {
  return (
    <article className="student-stat-card">
      <div className={`student-stat-icon ${color}`}>
        <Icon />
      </div>
      <div className="student-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function formatStudyDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDueDate(dateString) {
  if (!dateString) return "No due date";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return String(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const difference = Math.round((due - today) / 86400000);
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference < 0) return "Overdue";
  return due.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function getHeatLevel(hours) {
  if (hours <= 0) return 0;
  if (hours < 1) return 1;
  if (hours < 2) return 2;
  if (hours < 3.5) return 3;
  return 4;
}

function StudyHeatmap({ activity }) {
  const normalizedActivity = useMemo(() => {
    const byDate = new Map(activity.map((item) => [item.date, item.hours]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - 364);

    return Array.from({ length: 365 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const dateString = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
      return {
        date: dateString,
        hours: Number(byDate.get(dateString) ?? 0),
      };
    });
  }, [activity]);

  const totalHours = normalizedActivity.reduce((sum, day) => sum + day.hours, 0);
  const activeDays = normalizedActivity.filter((day) => day.hours > 0).length;

  const weeks = useMemo(() => {
    const firstDate = new Date(`${normalizedActivity[0].date}T00:00:00`);
    firstDate.setDate(firstDate.getDate() - ((firstDate.getDay() + 6) % 7));
    const grouped = [];

    for (let week = 0; week < 53; week += 1) {
      const days = [];
      for (let day = 0; day < 7; day += 1) {
        const date = new Date(firstDate);
        date.setDate(firstDate.getDate() + week * 7 + day);
        const dateString = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");
        const record = normalizedActivity.find((item) => item.date === dateString);
        days.push({
          date: dateString,
          hours: record?.hours ?? 0,
          inRange: Boolean(record),
        });
      }
      grouped.push(days);
    }
    return grouped;
  }, [normalizedActivity]);

  const monthLabels = useMemo(() => {
    const labels = [];
    let previousMonth = -1;
    weeks.forEach((week, index) => {
      const firstActiveDay = week.find((day) => day.inRange);
      if (!firstActiveDay) return;
      const month = new Date(`${firstActiveDay.date}T00:00:00`).getMonth();
      if (month !== previousMonth) {
        labels.push({
          week: index,
          label: new Date(`${firstActiveDay.date}T00:00:00`).toLocaleDateString(
            "en-IN",
            { month: "short" }
          ),
        });
        previousMonth = month;
      }
    });
    return labels;
  }, [weeks]);

  const currentStreak = useMemo(() => {
    let streak = 0;
    for (let index = normalizedActivity.length - 1; index >= 0; index -= 1) {
      if (normalizedActivity[index].hours <= 0) break;
      streak += 1;
    }
    return streak;
  }, [normalizedActivity]);

  return (
    <section className="student-panel student-heatmap-panel">
      <div className="student-panel-heading student-heatmap-heading">
        <div>
          <span className="student-section-kicker">YOUR CONSISTENCY</span>
          <h2>Study activity</h2>
          <p>Your recorded learning activity over the last year.</p>
        </div>
        <span className="student-heatmap-badge"><FaFire /> Learning history</span>
      </div>

      <div className="student-heatmap-stats">
        <div><strong>{totalHours.toFixed(1)}h</strong><span>Study hours</span></div>
        <div><strong>{activeDays}</strong><span>Active days</span></div>
        <div><strong>{currentStreak}</strong><span>Current streak</span></div>
        <div><strong>{Math.round((activeDays / 365) * 100)}%</strong><span>Consistency</span></div>
      </div>

      <div className="student-heatmap-scroll">
        <div className="student-heatmap-months" aria-hidden="true">
          {monthLabels.map((item) => (
            <span key={`${item.week}-${item.label}`} style={{ gridColumn: item.week + 1 }}>
              {item.label}
            </span>
          ))}
        </div>
        <div className="student-heatmap-body">
          <div className="student-heatmap-weekdays" aria-hidden="true">
            <span>Mon</span><span>Wed</span><span>Fri</span>
          </div>
          <div className="student-heatmap-grid" role="group" aria-label="Daily study activity for the last year">
            {weeks.map((week, weekIndex) => (
              <div className="student-heatmap-week" key={weekIndex}>
                {week.map((day) => (
                  <span
                    key={day.date}
                    className={`student-heatmap-cell level-${getHeatLevel(day.hours)} ${day.inRange ? "" : "out-of-range"}`}
                    title={day.inRange ? `${formatStudyDate(day.date)} · ${day.hours} study hours` : ""}
                    aria-label={day.inRange ? `${formatStudyDate(day.date)}: ${day.hours} study hours` : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="student-heatmap-legend">
        <span>{formatStudyDate(normalizedActivity[0]?.date)}</span>
        <div className="student-heatmap-legend-scale">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} className={`student-heatmap-cell level-${level}`} />
          ))}
          <span>More</span>
        </div>
        <span>Today</span>
      </div>
      {activeDays === 0 && (
        <p className="student-heatmap-note">
          No study sessions have been recorded yet. The heatmap will fill in as the API receives study-session data.
        </p>
      )}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="student-dashboard-state" role="status">
      Loading your dashboard…
    </div>
  );
}

export default function StudentDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError("");

      const token = getAccessToken();
      if (!token) {
        setError("Your login token was not found. Please log in again.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/student/dashboard/`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Your session has expired. Please log in again.");
          }
          if (response.status === 403) {
            throw new Error("This dashboard is available only to student accounts.");
          }
          throw new Error(
            payload?.detail ||
              payload?.message ||
              `Could not load dashboard (HTTP ${response.status}).`
          );
        }

        setDashboard(normalizeDashboard(payload));
      } catch (fetchError) {
        if (fetchError.name !== "AbortError") {
          setError(
            fetchError.message ||
              "Unable to connect to EduTrack. Check that the Django server is running."
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDashboard();
    return () => controller.abort();
  }, [reloadKey]);

  const studentName =
    dashboard?.student?.name ||
    dashboard?.student?.first_name ||
    getStoredStudentName();

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (loading && !dashboard) {
    return <div className="student-dashboard"><LoadingState /></div>;
  }

  if (error && !dashboard) {
    return (
      <div className="student-dashboard">
        <section className="student-panel student-dashboard-error" role="alert">
          <h2>Couldn't load your dashboard</h2>
          <p>{error}</p>
          <button
            className="student-continue-btn"
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Try again
          </button>
        </section>
      </div>
    );
  }

  const summary = dashboard?.summary ?? {};
  const courses = dashboard?.courses ?? [];
  const tasks = dashboard?.tasks ?? [];
  const studyActivity = dashboard?.studyActivity ?? [];

  return (
    <div className="student-dashboard">
      {error && <p className="student-dashboard-inline-error" role="alert">{error}</p>}

      <section className="student-welcome">
        <div className="student-welcome-copy">
          <span className="student-eyebrow">
            <FaGraduationCap /> YOUR LEARNING SPACE
          </span>
          <h1>Welcome back, {studentName}!</h1>
          <p>
            Keep your momentum going. A little progress every day adds up to
            something amazing.
          </p>
          <div className="student-welcome-meta">
            <span><FaClock /> {today}</span>
            <span><FaFire /> Keep your learning streak alive</span>
          </div>
        </div>
        <div className="student-welcome-art" aria-hidden="true">
          <div className="student-art-orbit orbit-one" />
          <div className="student-art-orbit orbit-two" />
          <div className="student-art-book"><FaBookOpen /></div>
          <span className="student-art-star star-one">✦</span>
          <span className="student-art-star star-two">✧</span>
        </div>
      </section>

      <section
        aria-label="AI Resume Builder"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "18px",
          flexWrap: "wrap",
          margin: "0 0 22px",
          padding: "20px 22px",
          border: "1px solid var(--student-border, #e8e5f0)",
          borderRadius: "16px",
          background: "linear-gradient(115deg, rgba(118,85,217,.13), rgba(118,85,217,.035))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
          <span style={{
            display: "grid", placeItems: "center", flex: "0 0 44px",
            width: "44px", height: "44px", borderRadius: "13px",
            background: "rgba(118,85,217,.15)", color: "#7655d9", fontSize: "20px"
          }}>
            <FaFileAlt />
          </span>
          <div>
            <span style={{ color: "#7655d9", fontSize: "10px", fontWeight: 800, letterSpacing: "1px" }}>
              CAREER DEVELOPMENT · AI POWERED
            </span>
            <h2 style={{ margin: "4px 0", fontSize: "17px" }}>Build your professional resume</h2>
            <p style={{ margin: 0, color: "var(--student-muted, #77748b)", fontSize: "12px", lineHeight: 1.5 }}>
              Create an ATS-friendly resume, improve your content with AI and export it as a PDF.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="student-continue-btn"
          onClick={() => { window.location.href = "/student/resume-builder"; }}
          style={{ flexShrink: 0 }}
        >
          Open AI Resume Builder <FaArrowRight />
        </button>
      </section>

      <section className="student-stats-grid" aria-label="Learning overview">
        <StatCard icon={FaBookOpen} label="Enrolled courses" value={summary.enrolled_courses ?? courses.length} detail="Courses in your learning plan" color="purple" />
        <StatCard icon={FaClipboardCheck} label="Lessons completed" value={summary.completed_lessons ?? 0} detail="Across your courses" color="blue" />
        <StatCard icon={FaChartLine} label="Overall progress" value={`${clampPercent(summary.overall_progress ?? 0)}%`} detail="Average course completion" color="green" />
        <StatCard icon={FaBullseye} label="Pending tasks" value={summary.pending_tasks ?? tasks.length} detail="Assignments and assessments" color="orange" />
      </section>

      <StudyHeatmap activity={studyActivity} />

      <div className="student-dashboard-columns">
        <section className="student-panel student-courses-panel">
          <div className="student-panel-heading">
            <div>
              <span className="student-section-kicker">KEEP GOING</span>
              <h2>Continue learning</h2>
              <p>Pick up where you last left off.</p>
            </div>
            <button className="student-text-link" type="button" onClick={() => { window.location.href = "/student/courses"; }}>
              All courses <FaArrowRight />
            </button>
          </div>

          <div className="student-course-list">
            {courses.length ? courses.map((course) => (
              <article className="student-course-card" key={course.id}>
                <div className={`student-course-symbol ${course.color}`}><FaBookOpen /></div>
                <div className="student-course-main">
                  <div className="student-course-title-row">
                    <div>
                      <span className="student-course-category">{course.category}</span>
                      <h3>{course.title}</h3>
                    </div>
                    <strong className="student-course-percent">{course.progress}%</strong>
                  </div>
                  <ProgressBar value={course.progress} color={course.color} />
                  <div className="student-course-footer">
                    <span>{course.status}</span>
                    <span>{course.totalLessons > 0 ? `${course.totalLessons} lessons` : course.description || "Course enrolled"}</span>
                  </div>
                  <button type="button" className="student-continue-btn" onClick={() => { window.location.href = "/student/courses"; }}>
                    <FaPlay /> Continue course
                  </button>
                </div>
              </article>
            )) : (
              <div className="student-empty-state">
                <FaBookOpen />
                <h3>No enrolled courses yet</h3>
                <p>Courses assigned to your student account will appear here.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="student-panel student-tasks-panel">
          <div className="student-panel-heading">
            <div>
              <span className="student-section-kicker">STAY ON TRACK</span>
              <h2>Upcoming tasks</h2>
              <p>What needs your attention.</p>
            </div>
            <FaTasks className="student-heading-icon" />
          </div>

          <div className="student-task-list">
            {tasks.length ? tasks.map((task, index) => {
              const dueLabel = formatDueDate(task.dueDate);
              const statusClass = String(task.status).toLowerCase().replace(/[^a-z0-9]+/g, "-");
              return (
                <article className="student-task-item" key={task.id}>
                  <span className={`student-task-marker task-${(index % 3) + 1}`} />
                  <div className="student-task-content">
                    <h3>{task.title}</h3>
                    <p>{task.course}</p>
                    <div className="student-task-meta">
                      <span><FaClock /> {dueLabel}</span>
                      <span className={`student-task-status status-${(index % 3) + 1}`} title={task.status}>
                        {task.status}
                      </span>
                    </div>
                  </div>
                </article>
              );
            }) : (
              <div className="student-empty-state">
                <FaClipboardCheck />
                <h3>You're all caught up</h3>
                <p>New assignments will show up here when they're available.</p>
              </div>
            )}
          </div>

          <button type="button" className="student-view-tasks-btn" onClick={() => { window.location.href = "/student/assignments"; }}>
            View all tasks <FaArrowRight />
          </button>
        </aside>
      </div>

      <section className="student-goal-banner">
        <div className="student-goal-icon"><FaBullseye /></div>
        <div className="student-goal-copy">
          <span>THIS WEEK'S FOCUS</span>
          <h2>Make time for one lesson every day.</h2>
          <p>Consistency beats cramming. Keep building your skills, one step at a time.</p>
        </div>
        <div className="student-goal-progress">
          <strong>{Math.min(7, summary.active_days ?? 0)} <small>/ 7 days</small></strong>
          <ProgressBar value={Math.min(100, ((summary.active_days ?? 0) / 7) * 100)} color="green" />
          <span>Weekly learning goal</span>
        </div>
      </section>
    </div>
  );
}
