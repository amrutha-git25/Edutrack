
import { useEffect, useState } from "react";
import {
  BookOpen, Users, Video, ClipboardCheck, CalendarDays,
  ArrowRight, Clock, FolderOpen, AlertCircle, RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getMentorDashboard } from "../../api/mentorApi";
import "./MentorDashboard.css";

function StatCard({ title, value, subtitle, icon: Icon, color }) {
  return (
    <article className="md-stat-card">
      <div className={`md-stat-icon ${color}`}>
        <Icon size={19} />
      </div>
      <p>{title}</p>
      <strong className="md-stat-value">{value}</strong>
      <span>{subtitle}</span>
    </article>
  );
}

function Panel({ title, subtitle, action, onAction, children }) {
  return (
    <section className="md-panel">
      <div className="md-panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && (
          <button onClick={onAction}>
            {action} <ArrowRight size={13} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="md-empty">
      <Icon size={25} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export default function MentorDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await getMentorDashboard();

      // API helpers sometimes return response.data and sometimes return the
      // Axios response itself. Support both, including nested DRF envelopes.
      let payload = response?.data ?? response;
      for (let i = 0; i < 3; i += 1) {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) break;
        if (payload.data && typeof payload.data === "object") {
          payload = payload.data;
          continue;
        }
        if (payload.dashboard && typeof payload.dashboard === "object") {
          payload = payload.dashboard;
          continue;
        }
        if (payload.results && typeof payload.results === "object" && !Array.isArray(payload.results)) {
          payload = payload.results;
          continue;
        }
        break;
      }

      const list = (...values) => values.find(Array.isArray) || [];
      const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

      const normalized = {
        ...payload,
        mentor: {
          ...(payload?.mentor || {}),
          name: firstDefined(
            payload?.mentor?.name,
            payload?.mentor_name,
            payload?.profile?.name,
            payload?.user?.full_name,
            payload?.user?.first_name,
            payload?.name
          ) || "Mentor",
        },
        stats: {
          ...(payload?.stats || payload?.statistics || {}),
          assigned_courses: firstDefined(
            payload?.stats?.assigned_courses,
            payload?.statistics?.assigned_courses,
            payload?.assigned_courses_count,
            payload?.total_courses
          ),
          students: firstDefined(
            payload?.stats?.students,
            payload?.statistics?.students,
            payload?.student_count,
            payload?.total_students
          ),
          upcoming_live_classes: firstDefined(
            payload?.stats?.upcoming_live_classes,
            payload?.statistics?.upcoming_live_classes,
            payload?.upcoming_classes_count,
            payload?.live_class_count
          ),
          pending_activities: firstDefined(
            payload?.stats?.pending_activities,
            payload?.statistics?.pending_activities,
            payload?.pending_activities_count,
            payload?.pending_assignments_count
          ),
        },
        courses: list(payload?.courses, payload?.assigned_courses, payload?.data?.courses),
        upcoming_classes: list(
          payload?.upcoming_classes,
          payload?.upcoming_live_classes_list,
          payload?.classes
        ),
        recent_activities: list(
          payload?.recent_activities,
          payload?.activities,
          payload?.recent_activity
        ),
      };

      setData(normalized);
    } catch (err) {
      console.error("Mentor dashboard loading error:", err);
      setError(
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        "Unable to load the dashboard. Check your login and backend."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // Load once on mount. Refresh is handled by the refresh button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = data?.stats || {};
  const courses = data?.courses || [];
  const classes = data?.upcoming_classes || [];
  const activities = data?.recent_activities || [];
  const mentorName = data?.mentor?.name || "Mentor";

  if (loading) {
    return (
      <div className="md-message">
        <RefreshCw className="md-spin" size={24} />
        <p>Loading your mentor workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="md-message">
        <AlertCircle size={28} />
        <h2>Unable to load dashboard</h2>
        <p>{error}</p>
        <button className="md-primary" onClick={() => loadDashboard()} disabled={loading}>
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    );
  }

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const monthLength = new Date(
    now.getFullYear(), now.getMonth() + 1, 0
  ).getDate();

  return (
    <div className="md-dashboard">
      <section className="md-welcome">
        <div>
          <span className="md-eyebrow">LET'S INSPIRE GREAT LEARNING</span>
          <h1>Welcome back, {mentorName}!</h1>
          <p>Your courses, students, and teaching day — all in one place.</p>
        </div>
        <div className="md-welcome-actions">
          <button
            type="button"
            className="md-secondary"
            onClick={() => loadDashboard({ silent: true })}
            disabled={refreshing}
            title="Refresh dashboard data"
          >
            <RefreshCw size={15} className={refreshing ? "md-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh data"}
          </button>
          <button className="md-primary" onClick={() => navigate("/mentor/live-classes")}>
            <CalendarDays size={15} /> View Schedule
          </button>
        </div>
      </section>

      <section className="md-stats">
        <StatCard
          title="Assigned Courses"
          value={stats.assigned_courses ?? courses.length}
          subtitle="Your assigned courses"
          icon={BookOpen}
          color="gold"
        />
        <StatCard
          title="Students"
          value={stats.students ?? 0}
          subtitle="Across your courses"
          icon={Users}
          color="green"
        />
        <StatCard
          title="Upcoming Live Classes"
          value={stats.upcoming_live_classes ?? classes.length}
          subtitle="Scheduled sessions"
          icon={Video}
          color="purple"
        />
        <StatCard
          title="Pending Activities"
          value={stats.pending_activities ?? 0}
          subtitle="Awaiting your review"
          icon={ClipboardCheck}
          color="orange"
        />
      </section>

      <Panel
        title="Your Assigned Courses"
        subtitle="Everything you need to guide your students"
        action="View my courses"
        onAction={() => navigate("/mentor/courses")}
      >
        {courses.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No assigned courses yet"
            description="Courses assigned to your account will appear here."
          />
        ) : (
          <div className="md-course-grid">
            {courses.map((course) => (
              <article className="md-course" key={course.id}>
                <div className="md-course-icon"><BookOpen size={20} /></div>
                <div className="md-course-body">
                  <h3>{course.title || course.name}</h3>
                  <p>
                    {course.student_count ?? 0} students
                    {course.module_count != null
                      ? ` · ${course.module_count} modules`
                      : ""}
                  </p>
                  <span className="md-status">Assigned</span>
                  <button
                    className="md-secondary"
                    onClick={() => navigate(`/mentor/courses/${course.id}`)}
                  >
                    Manage Course
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <div className="md-columns">
        <div className="md-main-column">
          <Panel
            title="Upcoming Live Classes"
            action="View all"
            onAction={() => navigate("/mentor/classes")}
          >
            {classes.length === 0 ? (
              <EmptyState
                icon={Video}
                title="No upcoming classes"
                description="Your scheduled live classes will appear here."
              />
            ) : (
              <div className="md-class-list">
                {classes.map((item) => (
                  <article className="md-class" key={item.id}>
                    <div className="md-class-icon"><Video size={18} /></div>
                    <div className="md-class-info">
                      <h3>{item.title || item.name}</h3>
                      <p>{item.course_name || "Course session"}</p>
                      <span>
                        <Clock size={12} />
                        {item.start_time
                          ? new Date(item.start_time).toLocaleString()
                          : "Time to be announced"}
                      </span>
                    </div>
                    <button
                      className="md-secondary"
                      onClick={() => navigate(`/mentor/classes/${item.id}`)}
                    >
                      Details
                    </button>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Recent Activity"
            subtitle="Updates from your teaching workspace"
          >
            {activities.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="No recent activity"
                description="Your course and teaching activities will appear here."
              />
            ) : (
              <div className="md-activity-list">
                {activities.map((activity) => (
                  <article className="md-activity" key={activity.id}>
                    <div className="md-activity-icon">
                      <ClipboardCheck size={16} />
                    </div>
                    <div className="md-activity-body">
                      <h3>{activity.title}</h3>
                      <p>{activity.description || activity.activity_type}</p>
                    </div>
                    <time>
                      {activity.created_at
                        ? new Date(activity.created_at).toLocaleDateString()
                        : ""}
                    </time>
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <aside className="md-side-column">
          <Panel title="Your Calendar">
            <h3 className="md-calendar-month">
              {now.toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <div className="md-calendar">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <span className="md-weekday" key={index}>{day}</span>
              ))}
              {Array.from({ length: firstDay }, (_, index) => (
                <span key={`blank-${index}`} />
              ))}
              {Array.from({ length: monthLength }, (_, index) => {
                const day = index + 1;
                return (
                  <span
                    key={day}
                    className={day === now.getDate() ? "today" : ""}
                  >
                    {day}
                  </span>
                );
              })}
            </div>
          </Panel>

          <Panel title="Needs Your Attention">
            <p className="md-muted">
              Keep your students on track.
            </p>
            <div className="md-attention">
              <span className="md-attention-icon">
                <ClipboardCheck size={17} />
              </span>
              <div>
                <strong>Pending Activities</strong>
                <p>{stats.pending_activities ?? 0} items to review</p>
              </div>
            </div>
            <button
              className="md-primary md-full"
              onClick={() => navigate("/mentor/assignments")}
            >
              Review Assignments <ArrowRight size={14} />
            </button>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
