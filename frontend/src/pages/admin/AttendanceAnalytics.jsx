import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CircleX,
  Download,
  RefreshCw,
  Search,
  Users,
  TrendingUp,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import "./AttendanceAnalytics.css";
import { useAdminTheme } from "../../context/ThemeContext";
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

function getAccessToken() {
  return (
    localStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    sessionStorage.getItem("access_token")
  );
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getInitialDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);

  return {
    dateFrom: formatDate(start),
    dateTo: formatDate(end),
  };
}

function formatLabel(dateString) {
  if (!dateString) return "—";

  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function formatTimestamp(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({ icon: Icon, label, value, detail, type }) {
  return (
    <article className="attendance-stat-card">
      <div className={`attendance-stat-icon ${type}`}>
        <Icon size={21} />
      </div>

      <div className="attendance-stat-content">
        <p>{label}</p>
        <h2>{value}</h2>
        <span>{detail}</span>
      </div>
    </article>
  );
}

export default function AttendanceAnalytics() {
  const { theme } = useAdminTheme();
  const initialDates = useMemo(() => getInitialDates(), []);

  const [dateFrom, setDateFrom] = useState(initialDates.dateFrom);
  const [dateTo, setDateTo] = useState(initialDates.dateTo);
  const [courseFilter, setCourseFilter] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 3;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(
    async ({ showRefresh = false } = {}) => {
      const token = getAccessToken();

      if (!token) {
        setError("Your session was not found. Please log in again.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (dateFrom && dateTo && dateFrom > dateTo) {
        setError("Start date cannot be later than the end date.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setError("");

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();

        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        if (courseFilter.trim()) {
          params.set("course", courseFilter.trim());
        }

        const response = await fetch(
          `${API_BASE}/reports/admin/attendance/?${params.toString()}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false) {
          if (response.status === 401) {
            throw new Error("Session expired. Please log in again.");
          }

          if (response.status === 403) {
            throw new Error(
              "Access denied. Sign in with an Admin account."
            );
          }

          throw new Error(
            result.message ||
              result.detail ||
              "Unable to load attendance analytics."
          );
        }

        setData(result.data ?? result);
      } catch (err) {
        setError(
          err.message ||
            "Unable to connect to the server. Check your backend."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateFrom, dateTo, courseFilter]
  );

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const summary = data?.summary ?? {};
  const dailyTrend = data?.daily_trend ?? [];
  const courseBreakdown = data?.course_breakdown ?? [];
  const recentRecords = data?.recent_records ?? [];

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return recentRecords;

    return recentRecords.filter((record) =>
      [
        record.student_name,
        record.student_email,
        record.course,
        record.class_title,
        record.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [recentRecords, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / ITEMS_PER_PAGE));
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRecords, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const exportCsv = () => {
    const rows = [
      [
        "Student",
        "Email",
        "Class",
        "Course",
        "Status",
        "Joined At",
        "Recorded At",
      ],
      ...filteredRecords.map((record) => [
        record.student_name,
        record.student_email,
        record.class_title,
        record.course,
        record.status,
        record.joined_at ?? "",
        record.recorded_at ?? "",
      ]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const safeValue = String(value ?? "").replace(/"/g, '""');
            return `"${safeValue}"`;
          })
          .join(",")
      )
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "edutrack-attendance.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  // Read the same live theme state used by AdminLayout.
  // The ThemeContext stores one of: "dark", "light", or "yellow".
  const normalizedTheme = String(theme || "light").toLowerCase();

  const themeClass = normalizedTheme.includes("yellow")
    ? "theme-yellow"
    : normalizedTheme.includes("dark")
      ? "theme-dark"
      : "theme-light";

  return (
    <section className={`attendance-page ${themeClass}`}>
      <div className="attendance-heading">
        <div>
          <div className="attendance-eyebrow">
            <Activity size={15} />
            REPORTS & ANALYTICS
          </div>

          <h1>Attendance Analytics</h1>

          <p>
            Track student participation, attendance trends and course
            engagement.
          </p>
        </div>

        <button
          type="button"
          className="attendance-refresh-btn"
          onClick={() => fetchAnalytics({ showRefresh: true })}
          disabled={loading || refreshing}
        >
          <RefreshCw
            size={16}
            className={refreshing ? "attendance-spinning" : ""}
          />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="attendance-filters">
        <label>
          <span>From date</span>
          <div className="attendance-filter-input">
            <CalendarDays size={17} />
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
        </label>

        <label>
          <span>To date</span>
          <div className="attendance-filter-input">
            <CalendarDays size={17} />
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </label>

        <label className="attendance-course-filter">
          <span>Course</span>
          <div className="attendance-filter-input">
            <BookOpen size={17} />
            <input
              type="text"
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
              placeholder="Search course name"
              onKeyDown={(event) => {
                if (event.key === "Enter") fetchAnalytics();
              }}
            />
          </div>
        </label>

        <button
          type="button"
          className="attendance-apply-btn"
          onClick={() => fetchAnalytics()}
          disabled={loading || refreshing}
        >
          Apply filters
        </button>
      </div>

      {error && (
        <div className="attendance-error" role="alert">
          <AlertCircle size={19} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchAnalytics({ showRefresh: true })}
          >
            Retry
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="attendance-loading">
          <span className="attendance-loader" />
          <p>Loading attendance analytics...</p>
        </div>
      ) : (
        <>
          <div className="attendance-stats-grid">
            <StatCard
              icon={Users}
              label="Total Records"
              value={summary.total_records ?? 0}
              detail="Attendance entries in selected period"
              type="blue"
            />

            <StatCard
              icon={CheckCircle2}
              label="Present"
              value={summary.present ?? 0}
              detail="Marked present"
              type="green"
            />

            <StatCard
              icon={CircleX}
              label="Absent"
              value={summary.absent ?? 0}
              detail="Marked absent"
              type="red"
            />

            <StatCard
              icon={TrendingUp}
              label="Attendance Rate"
              value={`${summary.attendance_percentage ?? 0}%`}
              detail="Present ÷ total records"
              type="purple"
            />
          </div>

          <div className="attendance-chart-grid">
            <article className="attendance-panel attendance-trend-panel">
              <div className="attendance-panel-heading">
                <div>
                  <h2>Attendance Trend</h2>
                  <p>Daily present and absent records</p>
                </div>
                <span className="attendance-panel-icon">
                  <Activity size={18} />
                </span>
              </div>

              {dailyTrend.length === 0 ? (
                <div className="attendance-empty-chart">
                  No attendance data for this period.
                </div>
              ) : (
                <div className="attendance-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={dailyTrend}
                      margin={{
                        top: 12,
                        right: 12,
                        left: -18,
                        bottom: 4,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--attendance-grid)"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatLabel}
                        tick={{ fill: "var(--attendance-muted)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: "var(--attendance-muted)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        labelFormatter={(label) => formatLabel(label)}
                        contentStyle={{
                          background: "var(--attendance-card)",
                          border: "1px solid var(--attendance-border)",
                          borderRadius: 10,
                          color: "var(--attendance-text)",
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="present"
                        name="Present"
                        stroke="#16a34a"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="absent"
                        name="Absent"
                        stroke="#ef4444"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="attendance-panel">
              <div className="attendance-panel-heading">
                <div>
                  <h2>Course Breakdown</h2>
                  <p>Attendance records by course</p>
                </div>
                <span className="attendance-panel-icon">
                  <BookOpen size={18} />
                </span>
              </div>

              {courseBreakdown.length === 0 ? (
                <div className="attendance-empty-chart">
                  No course statistics available.
                </div>
              ) : (
                <div className="attendance-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={courseBreakdown}
                      margin={{
                        top: 12,
                        right: 8,
                        left: -18,
                        bottom: 8,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--attendance-grid)"
                      />
                      <XAxis
                        dataKey="course"
                        tick={{
                          fill: "var(--attendance-muted)",
                          fontSize: 11,
                        }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={55}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{
                          fill: "var(--attendance-muted)",
                          fontSize: 12,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--attendance-card)",
                          border: "1px solid var(--attendance-border)",
                          borderRadius: 10,
                          color: "var(--attendance-text)",
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="present"
                        name="Present"
                        fill="#16a34a"
                        radius={[5, 5, 0, 0]}
                      />
                      <Bar
                        dataKey="absent"
                        name="Absent"
                        fill="#ef4444"
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>
          </div>

          <article className="attendance-panel attendance-course-table-panel">
            <div className="attendance-panel-heading">
              <div>
                <h2>Course Statistics</h2>
                <p>Detailed attendance percentage by course</p>
              </div>
            </div>

            <div className="attendance-table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Total Records</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Attendance Rate</th>
                  </tr>
                </thead>

                <tbody>
                  {courseBreakdown.map((item, index) => (
                    <tr key={`${item.course}-${index}`}>
                      <td className="attendance-course-name">
                        {item.course || "Unassigned"}
                      </td>
                      <td>{item.total}</td>
                      <td className="attendance-present-value">
                        {item.present}
                      </td>
                      <td className="attendance-absent-value">
                        {item.absent}
                      </td>
                      <td>
                        <div className="attendance-progress-cell">
                          <div className="attendance-progress-track">
                            <div
                              className="attendance-progress-fill"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    Number(item.attendance_percentage) || 0
                                  )
                                )}%`,
                              }}
                            />
                          </div>
                          <strong>
                            {item.attendance_percentage ?? 0}%
                          </strong>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {courseBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={5} className="attendance-empty-table">
                        No course records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="attendance-panel attendance-records-panel">
            <div className="attendance-panel-heading attendance-records-heading">
              <div>
                <h2>Recent Attendance Records</h2>
                <p>
                  Showing {filteredRecords.length} of {recentRecords.length}{" "}
                  recent records
                </p>
              </div>

              <button
                type="button"
                className="attendance-export-btn"
                onClick={exportCsv}
                disabled={filteredRecords.length === 0}
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>

            <div className="attendance-record-toolbar">
              <div className="attendance-search">
                <Search size={17} />
                <input
                  type="search"
                  placeholder="Search student, course or class..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            <div className="attendance-table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Course</th>
                    <th>Status</th>
                    <th>Joined At</th>
                    <th>Recorded At</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedRecords.map((record) => {
                    const isPresent =
                      String(record.status).toLowerCase() === "present";

                    return (
                      <tr key={record.id}>
                        <td>
                          <div className="attendance-student-cell">
                            <div className="attendance-avatar">
                              {(record.student_name || "S")
                                .trim()
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div>
                              <strong>
                                {record.student_name || "Unknown student"}
                              </strong>
                              <span>
                                {record.student_email || "No email"}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>{record.class_title || "—"}</td>
                        <td>{record.course || "—"}</td>

                        <td>
                          <span
                            className={`attendance-status ${
                              isPresent ? "present" : "absent"
                            }`}
                          >
                            {isPresent ? (
                              <CheckCircle2 size={14} />
                            ) : (
                              <CircleX size={14} />
                            )}
                            {record.status || "Unknown"}
                          </span>
                        </td>

                        <td>{formatTimestamp(record.joined_at)}</td>
                        <td>{formatTimestamp(record.recorded_at)}</td>
                      </tr>
                    );
                  })}

                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} className="attendance-empty-table">
                        No attendance records match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredRecords.length > 0 && (
              <div className="attendance-pagination">
                <span className="attendance-pagination-info">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="attendance-pagination-controls">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <button
                      type="button"
                      key={page}
                      className={currentPage === page ? "active" : ""}
                      onClick={() => setCurrentPage(page)}
                      aria-current={currentPage === page ? "page" : undefined}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </article>
        </>
      )}
    </section>
  );
}