
import { useEffect, useState } from "react";
import {
  FaUsers,
  FaBookOpen,
  FaChalkboardTeacher,
  FaWallet,
  FaArrowUp,
  FaUserGraduate,
  FaCircle,
  FaSyncAlt,
} from "react-icons/fa";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "../../styles/admin-dashboard.css";
import { fetchAdminOverview } from "../../api/adminDashboardApi";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const number = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value) || 0);

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const result = await fetchAdminOverview();
      setData(result);
    } catch (err) {
      setError(err.message || "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const students = data?.students ?? {};
  const courses = data?.courses ?? {};
  const mentors = data?.mentors ?? {};
  const revenue = data?.revenue ?? {};

  const cards = [
    {
      label: "Total Students",
      value: number(students.total),
      note:
        students.new_this_month != null
          ? `${number(students.new_this_month)} enrolled this month`
          : "Student accounts",
      icon: FaUsers,
      tone: "yellow",
    },
    {
      label: "Active Courses",
      value: number(courses.active),
      note: "Courses currently active",
      icon: FaBookOpen,
      tone: "purple",
    },
    {
      label: "Mentors",
      value: number(mentors.total),
      note: "Registered mentor accounts",
      icon: FaChalkboardTeacher,
      tone: "green",
    },
    {
      label: "Monthly Revenue",
      value: money(revenue.monthly),
      note: "Revenue data from backend",
      icon: FaWallet,
      tone: "orange",
    },
  ];

  const trend = data?.enrollment_trend ?? [];
  const coursesData = data?.students_by_course ?? [];
  const enrollments = data?.recent_enrollments ?? [];
  const activities = data?.recent_activity ?? [];
  const status = data?.data_status ?? {};

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">YOUR INSTITUTE, AT A GLANCE</p>
          <h1>Admin Dashboard</h1>
          <p className="heading-subtitle">
            Welcome back! Here's what's happening across EduTrack.
          </p>
        </div>

        <button
          type="button"
          className="refresh-button"
          onClick={loadDashboard}
          disabled={loading}
        >
          <FaSyncAlt />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="dashboard-error" role="alert">
          <div>
            <strong>Dashboard couldn't load</strong>
            <p>{error}</p>
          </div>
          <button type="button" onClick={loadDashboard}>
            Try again
          </button>
        </div>
      )}

      <div className="stat-grid">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <article className="stat-card" key={card.label}>
              <div className="stat-card-top">
                <span>{card.label}</span>
                <span className={`stat-icon ${card.tone}`}>
                  <Icon />
                </span>
              </div>
              <strong className="stat-value">
                {loading && !data ? "—" : card.value}
              </strong>
              <p className={`stat-note ${card.tone}`}>
                {card.note}
              </p>
            </article>
          );
        })}
      </div>

      <div className="dashboard-grid">
        <section className="panel enrollment-panel">
          <div className="panel-heading">
            <div>
              <h2>Student Enrollment Trend</h2>
              <p>Cumulative enrollments over time</p>
            </div>
            <span className="panel-tag">
              {trend.length} data points
            </span>
          </div>

          <div className="chart-area">
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trend}
                  margin={{ top: 12, right: 12, bottom: 4, left: -14 }}
                >
                  <CartesianGrid
                    stroke="var(--chart-grid)"
                    strokeDasharray="3 4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      color: "var(--text)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="students"
                    name="Students"
                    stroke="var(--accent)"
                    strokeWidth={3}
                    dot={{ r: 3, fill: "var(--accent)" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">
                <FaArrowUp />
                <strong>
                  {loading ? "Loading enrollment data..." : "No trend data yet"}
                </strong>
                <p>
                  {status.enrollments === "pending_model_integration"
                    ? "Connect the enrollment model to populate this chart."
                    : "Enrollment data will appear here when available."}
                </p>
              </div>
            )}
          </div>
          <div className="chart-legend">
            <FaCircle />
            <span>Student enrollments</span>
          </div>
        </section>

        <section className="panel courses-panel">
          <div className="panel-heading">
            <div>
              <h2>Students by Course</h2>
              <p>Enrollment distribution</p>
            </div>
          </div>

          {coursesData.length > 0 ? (
            <div className="course-bars">
              {coursesData.map((course, index) => {
                const max = Math.max(
                  ...coursesData.map((item) => Number(item.students) || 0),
                  1
                );
                const count = Number(course.students) || 0;

                return (
                  <div className="course-bar-item" key={course.id ?? course.name}>
                    <div className="course-bar-label">
                      <span>{course.name}</span>
                      <strong>{number(count)}</strong>
                    </div>
                    <div className="progress-track">
                      <div
                        className={`progress-fill color-${index % 4}`}
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state compact">
              <FaBookOpen />
              <strong>No course statistics yet</strong>
              <p>
                {status.enrollments === "pending_model_integration"
                  ? "Course enrollment data has not been connected."
                  : "Course statistics will appear here when available."}
              </p>
            </div>
          )}
        </section>

        <section className="panel recent-enrollments-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent Enrollments</h2>
              <p>The latest additions to your learning community</p>
            </div>
            <button
              type="button"
              className="text-action"
              onClick={() => {
                window.location.href = "/admin/students";
              }}
            >
              View all students →
            </button>
          </div>

          <div className="table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>COURSE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((item, index) => (
                  <tr key={item.id ?? `${item.email}-${index}`}>
                    <td>
                      <div className="student-cell">
                        <span className="student-avatar">
                          {(item.name || "S")
                            .split(" ")
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </span>
                        <div>
                          <strong>{item.name || "Student"}</strong>
                          <small>{item.date || ""}</small>
                        </div>
                      </div>
                    </td>
                    <td>{item.course || "—"}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          String(item.status).toLowerCase() === "inactive"
                            ? "inactive"
                            : "active-status"
                        }`}
                      >
                        {item.status || "Active"}
                      </span>
                    </td>
                  </tr>
                ))}

                {!loading && enrollments.length === 0 && (
                  <tr>
                    <td colSpan="3" className="table-empty">
                      No recent enrollments available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel activity-panel">
          <div className="activity-heading">
            <div className="activity-heading-copy">
              <span className="activity-heading-mark"><FaCircle /></span>
              <div>
                <p className="activity-kicker">LIVE FEED</p>
                <h2>Recent Activity</h2>
                <p className="activity-heading-subtitle">A pulse on what's happening in EduTrack</p>
              </div>
            </div>
            <div className="activity-heading-count">
              <strong>{activities.length.toString().padStart(2, "0")}</strong>
              <span>EVENTS</span>
            </div>
          </div>

          {activities.length > 0 ? (
            <div className="activity-list">
              {activities.slice(0, 3).map((activity, index) => (
                <article className="activity-item" key={activity.id ?? index}>
                  <div className={`activity-index tone-${index % 4}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="activity-main">
                    <div className="activity-topline">
                      <strong>{activity.title || activity.message || "Platform update"}</strong>
                    </div>
                    {activity.description && (
                      <p className="activity-description">{activity.description}</p>
                    )}
                    <div className="activity-meta">
                      <span className={`activity-status-dot tone-${index % 4}`} />
                      <span>{activity.type || activity.category || "Platform update"}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="activity-empty">
              <div className="activity-empty-art">
                <span className="activity-empty-orbit orbit-one" />
                <span className="activity-empty-orbit orbit-two" />
                <FaUserGraduate />
              </div>
              <strong>All quiet for now</strong>
              <p>
                {status.activity === "pending_model_integration"
                  ? "Connect the activity source to see platform updates here."
                  : "New activity will show up here as students and mentors use EduTrack."}
              </p>
            </div>
          )}
          <div className="activity-footer">
            <span><span className="activity-live-dot" /> Activity stream</span>
            <span>Most recent first</span>
          </div>
        </section>
      </div>

    </div>
  );
}
