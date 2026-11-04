
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import mentorApi from "../../api/mentorApi";
import "./LiveAttendance.css";

const EMPTY_SUMMARY = {
  classes: 0,
  present: 0,
  absent: 0,
  attendance_percentage: 0,
};

function getErrorMessage(error) {
  const data = error?.response?.data;

  if (typeof data?.message === "string") return data.message;
  if (typeof data?.detail === "string") return data.detail;

  if (data && typeof data === "object") {
    const messages = Object.entries(data)
      .map(([key, value]) => {
        if (typeof value === "string") return `${key}: ${value}`;
        if (Array.isArray(value)) return `${key}: ${value.join(" ")}`;
        return "";
      })
      .filter(Boolean);

    if (messages.length) return messages.join(" ");
  }

  return error?.message || "Something went wrong. Please try again.";
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNameInitials(name) {
  return String(name || "Student")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function normalizeClasses(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeStudents(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) {
    return payload.data.results;
  }
  if (Array.isArray(payload?.students)) return payload.students;
  if (Array.isArray(payload?.data?.students)) {
    return payload.data.students;
  }
  return [];
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  return value === "present" || value === "absent" ? value : "";
}

export default function LiveAttendance() {
  const [classes, setClasses] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});

  const [search, setSearch] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const [classStatusFilter, setClassStatusFilter] = useState("all");
  const [attendanceFilter, setAttendanceFilter] = useState("all");

  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadClasses = useCallback(async (showToast = false) => {
    setLoadingClasses(true);

    try {
      const response = await mentorApi.get("/mentor/attendance/");
      const payload = response.data;
      const items = normalizeClasses(payload);

      setClasses(items);
      setSummary(
        payload?.summary ||
        payload?.data?.summary ||
        EMPTY_SUMMARY
      );

      setSelectedClassId((current) => {
        if (
          current &&
          items.some((item) => String(item.id) === String(current))
        ) {
          return current;
        }
        return "";
      });

      if (showToast) {
        toast.success("Attendance classes refreshed successfully.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: "Unable to load your assigned classes.",
      });
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const loadClassStudents = useCallback(async (classId) => {
    if (!classId) {
      setStudents([]);
      setAttendance({});
      return;
    }

    setLoadingStudents(true);

    try {
      const response = await mentorApi.get(
        `/mentor/attendance/${classId}/`
      );

      const items = normalizeStudents(response.data);
      setStudents(items);

      const initialAttendance = {};

      items.forEach((student) => {
        initialAttendance[String(student.student_id)] =
          normalizeStatus(student.status);
      });

      setAttendance(initialAttendance);
    } catch (error) {
      setStudents([]);
      setAttendance({});

      toast.error(getErrorMessage(error), {
        description: "Unable to load the students for this class.",
      });
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    loadClassStudents(selectedClassId);
  }, [selectedClassId, loadClassStudents]);

  const selectedClass = useMemo(
    () =>
      classes.find(
        (item) => String(item.id) === String(selectedClassId)
      ) || null,
    [classes, selectedClassId]
  );

  const filteredClasses = useMemo(() => {
    const term = classSearch.trim().toLowerCase();

    return classes.filter((item) => {
      const matchesSearch = [
        item.title,
        item.course_name,
        item.status,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(term)
        );

      const matchesStatus =
        classStatusFilter === "all" ||
        String(item.status || "").toLowerCase() === classStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [classes, classSearch, classStatusFilter]);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();

    return students.filter((student) => {
      const matchesSearch = [
        student.student_name,
        student.student_email,
        student.student_id,
      ]
        .filter((value) => value !== undefined && value !== null)
        .some((value) =>
          String(value).toLowerCase().includes(term)
        );

      const status = attendance[String(student.student_id)] || "";

      const matchesStatus =
        attendanceFilter === "all" ||
        (attendanceFilter === "unmarked"
          ? !status
          : status === attendanceFilter);

      return matchesSearch && matchesStatus;
    });
  }, [students, search, attendance, attendanceFilter]);

  const presentCount = students.filter(
    (student) =>
      attendance[String(student.student_id)] === "present"
  ).length;

  const absentCount = students.filter(
    (student) =>
      attendance[String(student.student_id)] === "absent"
  ).length;

  const unmarkedCount = Math.max(
    0,
    students.length - presentCount - absentCount
  );

  const markedCount = presentCount + absentCount;

  const currentRate = markedCount
    ? Math.round((presentCount / markedCount) * 100)
    : 0;

  function updateAttendance(studentId, value) {
    setAttendance((current) => ({
      ...current,
      [String(studentId)]: value,
    }));
  }

  function markAll(value) {
    if (!students.length) {
      toast.error("There are no students to mark.");
      return;
    }

    setAttendance((current) => {
      const next = { ...current };

      students.forEach((student) => {
        next[String(student.student_id)] = value;
      });

      return next;
    });

    toast.success(
      value === "present"
        ? "All students marked present."
        : "All students marked absent."
    );
  }

  async function saveAttendance() {
    if (!selectedClassId || !selectedClass) {
      toast.error("Select a class before saving attendance.");
      return;
    }

    if (!students.length) {
      toast.error(
        "There are no assigned students to mark for this class."
      );
      return;
    }

    const unmarked = students.filter(
      (student) => !attendance[String(student.student_id)]
    );

    if (unmarked.length) {
      toast.error(
        `Mark attendance for all students first.`,
        {
          description: `${unmarked.length} student(s) remain unmarked.`,
        }
      );
      return;
    }

    setSaving(true);

    try {
      const records = students.map((student) => ({
        student_id: student.student_id,
        status: attendance[String(student.student_id)],
      }));

      await mentorApi.post(
        `/mentor/attendance/${selectedClassId}/`,
        { records }
      );

      toast.success("Attendance saved successfully.", {
        description: `Attendance for ${selectedClass.title} has been submitted.`,
      });

      await Promise.all([
        loadClassStudents(selectedClassId),
        loadClasses(),
      ]);
    } catch (error) {
      toast.error(getErrorMessage(error), {
        description: "Attendance could not be saved. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    if (!students.length || !selectedClass) {
      toast.error(
        "Select a class with students before exporting attendance."
      );
      return;
    }

    const escapeCsv = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = [
      [
        "Student ID",
        "Student Name",
        "Email",
        "Course",
        "Class",
        "Date",
        "Status",
      ],
      ...students.map((student) => [
        student.student_id,
        student.student_name,
        student.student_email,
        selectedClass.course_name,
        selectedClass.title,
        formatDate(selectedClass.scheduled_at),
        attendance[String(student.student_id)] || "Unmarked",
      ]),
    ];

    const csv = rows
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `attendance-class-${selectedClass.id}.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    toast.success("Attendance CSV exported successfully.");
  }

  async function refreshAttendance() {
    await loadClasses(true);

    if (selectedClassId) {
      await loadClassStudents(selectedClassId);
    }
  }

  return (
    <>
      <Toaster position="top-right" richColors closeButton />

      <main className="la-page">
        <header className="la-heading">
          <div>
            <div className="la-eyebrow">
              <Activity size={15} />
              MENTOR WORKSPACE / CLASS MANAGEMENT
            </div>

            <h1>Attendance</h1>

            <p>
              Track student participation and manage attendance for your
              assigned classes.
            </p>
          </div>

          <button
            type="button"
            className="la-button la-button-secondary"
            onClick={refreshAttendance}
            disabled={loadingClasses || loadingStudents}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </header>

        <section className="la-stats" aria-label="Attendance summary">
          <article className="la-stat-card">
            <div className="la-stat-icon la-icon-purple">
              <CalendarDays size={20} />
            </div>
            <div>
              <span>Assigned Classes</span>
              <strong>{summary.classes ?? classes.length}</strong>
              <small>Authorized live classes</small>
            </div>
          </article>

          <article className="la-stat-card">
            <div className="la-stat-icon la-icon-green">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <span>Present</span>
              <strong>
                {selectedClass
                  ? presentCount
                  : summary.present ?? 0}
              </strong>
              <small>
                {selectedClass ? "Selected class" : "Saved records"}
              </small>
            </div>
          </article>

          <article className="la-stat-card">
            <div className="la-stat-icon la-icon-red">
              <X size={20} />
            </div>
            <div>
              <span>Absent</span>
              <strong>
                {selectedClass
                  ? absentCount
                  : summary.absent ?? 0}
              </strong>
              <small>
                {selectedClass ? "Selected class" : "Saved records"}
              </small>
            </div>
          </article>

          <article className="la-stat-card">
            <div className="la-stat-icon la-icon-blue">
              <Activity size={20} />
            </div>
            <div>
              <span>Attendance Rate</span>
              <strong>
                {selectedClass
                  ? `${currentRate}%`
                  : `${summary.attendance_percentage ?? 0}%`}
              </strong>
              <small>Present ÷ marked records</small>
            </div>
          </article>
        </section>

        <div className="la-main-grid">
          <section className="la-panel la-classes-panel">
            <div className="la-panel-heading">
              <div>
                <h2>Your Classes</h2>
                <p>Select a class to record attendance.</p>
              </div>

              <span className="la-count-badge">
                {filteredClasses.length}
              </span>
            </div>

            <div className="la-search">
              <Search size={17} />
              <input
                type="search"
                placeholder="Search classes or courses..."
                value={classSearch}
                onChange={(event) =>
                  setClassSearch(event.target.value)
                }
              />
            </div>

            <label className="la-select-label">
              Filter by class status
              <span className="la-select-wrap">
                <select
                  value={classStatusFilter}
                  onChange={(event) =>
                    setClassStatusFilter(event.target.value)
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <ChevronDown size={15} />
              </span>
            </label>

            {loadingClasses ? (
              <div className="la-empty">
                <RefreshCw className="la-spin" size={22} />
                <span>Loading your classes...</span>
              </div>
            ) : filteredClasses.length === 0 ? (
              <div className="la-empty">
                <CalendarDays size={27} />
                <strong>No classes found</strong>
                <span>
                  Classes assigned to your mentor account will appear here.
                </span>
              </div>
            ) : (
              <div className="la-class-list">
                {filteredClasses.map((item) => {
                  const isSelected =
                    String(item.id) === String(selectedClassId);

                  const status = String(
                    item.status || "scheduled"
                  ).toLowerCase();

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`la-class-item ${
                        isSelected ? "is-selected" : ""
                      }`}
                      onClick={() =>
                        setSelectedClassId(String(item.id))
                      }
                    >
                      <div className="la-class-top">
                        <span className="la-class-icon">
                          <ClipboardCheck size={18} />
                        </span>

                        <span className={`la-status la-status-${status}`}>
                          {status}
                        </span>
                      </div>

                      <strong className="la-class-title">
                        {item.title || "Untitled class"}
                      </strong>

                      <span className="la-course-name">
                        {item.course_name || "Course not specified"}
                      </span>

                      <div className="la-class-meta">
                        <span>
                          <CalendarDays size={14} />
                          {formatDate(item.scheduled_at)}
                        </span>

                        {formatTime(item.scheduled_at) && (
                          <span>{formatTime(item.scheduled_at)}</span>
                        )}
                      </div>

                      <div className="la-class-footer">
                        <span>
                          <Users size={14} />
                          {item.total_marked ?? 0} marked
                        </span>

                        <span>
                          {item.present_count ?? 0} present
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="la-panel la-roster-panel">
            {!selectedClass ? (
              <div className="la-roster-placeholder">
                <div className="la-placeholder-icon">
                  <ClipboardCheck size={28} />
                </div>

                <h2>Select a class</h2>

                <p>
                  Choose one of your assigned classes to view students and
                  record attendance.
                </p>
              </div>
            ) : (
              <>
                <div className="la-panel-heading la-roster-heading">
                  <div>
                    <div className="la-eyebrow">
                      ATTENDANCE REGISTER
                    </div>

                    <h2>{selectedClass.title}</h2>

                    <p>
                      {selectedClass.course_name || "Assigned course"}
                    </p>

                    <div className="la-selected-meta">
                      <span>
                        <CalendarDays size={14} />
                        {formatDate(selectedClass.scheduled_at)}
                      </span>

                      <span
                        className={`la-status la-status-${String(
                          selectedClass.status || "scheduled"
                        ).toLowerCase()}`}
                      >
                        {selectedClass.status || "scheduled"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="la-icon-button"
                    onClick={() =>
                      loadClassStudents(selectedClassId)
                    }
                    disabled={loadingStudents}
                    aria-label="Reload students"
                    title="Reload students"
                  >
                    <RefreshCw
                      size={17}
                      className={loadingStudents ? "la-spin" : ""}
                    />
                  </button>
                </div>

                <div className="la-roster-summary">
                  <div>
                    <span>Students</span>
                    <strong>{students.length}</strong>
                  </div>

                  <div>
                    <span>Present</span>
                    <strong className="la-text-green">
                      {presentCount}
                    </strong>
                  </div>

                  <div>
                    <span>Absent</span>
                    <strong className="la-text-red">
                      {absentCount}
                    </strong>
                  </div>

                  <div>
                    <span>Unmarked</span>
                    <strong className="la-text-muted">
                      {unmarkedCount}
                    </strong>
                  </div>
                </div>

                <div className="la-roster-toolbar">
                  <div className="la-search la-roster-search">
                    <Search size={17} />
                    <input
                      type="search"
                      placeholder="Search student name, email or ID..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>

                  <label className="la-filter-label">
                    <span className="la-sr-only">
                      Filter attendance
                    </span>

                    <select
                      value={attendanceFilter}
                      onChange={(event) =>
                        setAttendanceFilter(event.target.value)
                      }
                    >
                      <option value="all">All students</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="unmarked">Unmarked</option>
                    </select>
                  </label>
                </div>

                <div className="la-bulk-actions">
                  <span>
                    {markedCount} of {students.length} marked
                  </span>

                  <div>
                    <button
                      type="button"
                      className="la-text-button"
                      onClick={() => markAll("present")}
                      disabled={!students.length || loadingStudents}
                    >
                      <Check size={15} />
                      Mark all present
                    </button>

                    <button
                      type="button"
                      className="la-text-button la-text-button-danger"
                      onClick={() => markAll("absent")}
                      disabled={!students.length || loadingStudents}
                    >
                      <X size={15} />
                      Mark all absent
                    </button>
                  </div>
                </div>

                {loadingStudents ? (
                  <div className="la-empty la-roster-empty">
                    <RefreshCw className="la-spin" size={22} />
                    <span>Loading enrolled students...</span>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="la-empty la-roster-empty">
                    <Users size={26} />
                    <strong>No students found</strong>
                    <span>
                      Check course assignments or change your search/filter.
                    </span>
                  </div>
                ) : (
                  <div className="la-table-wrap">
                    <table className="la-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredStudents.map((student) => {
                          const studentId = String(student.student_id);
                          const value = attendance[studentId] || "";

                          return (
                            <tr key={studentId}>
                              <td>
                                <div className="la-student-cell">
                                  <div className="la-avatar">
                                    {getNameInitials(student.student_name)}
                                  </div>

                                  <div className="la-student-info">
                                    <strong>
                                      {student.student_name ||
                                        "Unnamed student"}
                                    </strong>

                                    <span>
                                      {student.student_email ||
                                        `Student ID: ${studentId}`}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              <td>
                                <div className="la-attendance-options">
                                  <button
                                    type="button"
                                    className={`la-mark-button la-mark-present ${
                                      value === "present" ? "is-active" : ""
                                    }`}
                                    onClick={() =>
                                      updateAttendance(studentId, "present")
                                    }
                                    aria-pressed={value === "present"}
                                    title="Mark present"
                                  >
                                    <Check size={15} />
                                    Present
                                  </button>

                                  <button
                                    type="button"
                                    className={`la-mark-button la-mark-absent ${
                                      value === "absent" ? "is-active" : ""
                                    }`}
                                    onClick={() =>
                                      updateAttendance(studentId, "absent")
                                    }
                                    aria-pressed={value === "absent"}
                                    title="Mark absent"
                                  >
                                    <X size={15} />
                                    Absent
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <footer className="la-register-footer">
                  <div className="la-save-hint">
                    {unmarkedCount > 0 ? (
                      <>
                        <AlertCircle size={16} />
                        {unmarkedCount} student(s) still need a status.
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        All students have been marked.
                      </>
                    )}
                  </div>

                  <div className="la-footer-actions">
                    <button
                      type="button"
                      className="la-button la-button-secondary"
                      onClick={exportCsv}
                      disabled={!students.length}
                    >
                      <Download size={16} />
                      Export CSV
                    </button>

                    <button
                      type="button"
                      className="la-button la-button-primary"
                      onClick={saveAttendance}
                      disabled={
                        saving || loadingStudents || !students.length
                      }
                    >
                      {saving ? (
                        <RefreshCw className="la-spin" size={16} />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}

                      {saving ? "Saving..." : "Save Attendance"}
                    </button>
                  </div>
                </footer>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
