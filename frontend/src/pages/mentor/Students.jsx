import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  Users,
  UserCheck,
  UserX,
  BookOpen,
  RefreshCw,
  Eye,
  X,
  Mail,
  Phone,
  GraduationCap,
  Hash,
  CalendarDays,
  Filter,
} from "lucide-react";
import mentorApi from "../../api/mentorApi";
import { Toaster, toast } from "sonner";
import "./Students.css";

const initialFilters = {
  search: "",
  branch: "",
  section: "",
  status: "",
  course: "",
};

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function getInitials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "ST"
  );
}

export default function Students() {
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState({
    total_students: 0,
    active_students: 0,
    inactive_students: 0,
    total_courses: 0,
  });

  const [availableFilters, setAvailableFilters] = useState({
    branches: [],
    sections: [],
    courses: [],
  });

  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 3;

  // Load student directory
  const loadStudents = useCallback(
    async (showSuccessToast = false) => {
      setLoading(true);

      try {
        const params = {};

        Object.entries(filters).forEach(([key, value]) => {
          if (value.trim()) {
            params[key] = value.trim();
          }
        });

        const response = await mentorApi.get("mentor/students/", {
          params,
        });

        const data = response.data;

        setStudents(Array.isArray(data.students) ? data.students : []);

        setSummary(
          data.summary || {
            total_students: 0,
            active_students: 0,
            inactive_students: 0,
            total_courses: 0,
          }
        );

        setAvailableFilters(
          data.filters || {
            branches: [],
            sections: [],
            courses: [],
          }
        );

        if (showSuccessToast) {
          toast.success("Student directory refreshed successfully.");
        }
      } catch (err) {
        console.error("Mentor students error:", err);

        if (err.response?.status === 401) {
          toast.error("Your session has expired.", {
            description: "Please log in again to view students.",
          });
        } else if (err.response?.status === 403) {
          toast.error("Access denied.", {
            description:
              "Only authorized Mentor accounts can access this page.",
          });
        } else {
          toast.error("Unable to load students.", {
            description:
              err.response?.data?.message ||
              "Please check the backend connection and try again.",
          });
        }

        setStudents([]);

        setSummary({
          total_students: 0,
          active_students: 0,
          inactive_students: 0,
          total_courses: 0,
        });
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadStudents();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [loadStudents]);

  // Update a filter
  const updateFilter = (name, value) => {
    setCurrentPage(1);
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  // Clear filters
  const resetFilters = () => {
    setCurrentPage(1);
    setFilters({ ...initialFilters });
    toast.success("Filters cleared.", {
      description: "The student directory filters have been reset.",
    });
  };

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters]
  );

  // Pagination: show only 3 student records per page.
  const totalPages = Math.max(1, Math.ceil(students.length / recordsPerPage));
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * recordsPerPage;
    return students.slice(startIndex, startIndex + recordsPerPage);
  }, [students, currentPage]); 

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  // Open student details and show a success toast
  const viewStudent = async (student) => {
    try {
      const response = await mentorApi.get(
        `mentor/students/${student.id}/`
      );

      const studentDetails = response.data?.student || student;

      setSelectedStudent(studentDetails);

      toast.success("Student details opened successfully.", {
        description: `Viewing the profile of ${studentDetails.name || student.name}.`,
      });
    } catch (err) {
      console.error("Student details error:", err);

      if (err.response?.status === 401) {
        toast.error("Your session has expired.", {
          description: "Please log in again.",
        });
      } else if (err.response?.status === 403) {
        toast.error("Access denied.", {
          description: "You are not authorized to view these details.",
        });
      } else {
        toast.error("Unable to load student details.", {
          description:
            err.response?.data?.message ||
            "Please try again in a moment.",
        });
      }
    }
  };

  // Close student details and show a success toast
  const closeStudentDetails = () => {
    if (!selectedStudent) return;

    const studentName = selectedStudent.name;

    setSelectedStudent(null);

    toast.success("Student profile closed.", {
      description: studentName
        ? `Finished viewing ${studentName}'s profile.`
        : "You have finished viewing the student profile.",
    });
  };

  return (
    <main className="mentor-students-page">
      <Toaster position="top-right" richColors closeButton />

      {/* Page heading */}
      <header className="ms-heading">
        <div>
          <div className="ms-eyebrow">
            <Users size={15} />
            MENTOR WORKSPACE
          </div>

          <h1>Students</h1>

          <p>
            View students assigned to your courses and check their learning
            profiles.
          </p>
        </div>

        <button
          className="ms-button ms-button-secondary"
          type="button"
          onClick={() => loadStudents(true)}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "ms-spin" : ""} />
          Refresh
        </button>
      </header>

      {/* Student summary cards */}
      <section className="ms-stats" aria-label="Student summary">
        <article className="ms-stat-card">
          <span className="ms-stat-icon ms-purple">
            <Users size={21} />
          </span>

          <div>
            <p>Total students</p>
            <strong>{loading ? "—" : summary.total_students}</strong>
            <small>Within your assigned courses</small>
          </div>
        </article>

        <article className="ms-stat-card">
          <span className="ms-stat-icon ms-green">
            <UserCheck size={21} />
          </span>

          <div>
            <p>Active students</p>
            <strong>{loading ? "—" : summary.active_students}</strong>
            <small>Active student profiles</small>
          </div>
        </article>

        <article className="ms-stat-card">
          <span className="ms-stat-icon ms-red">
            <UserX size={21} />
          </span>

          <div>
            <p>Inactive students</p>
            <strong>{loading ? "—" : summary.inactive_students}</strong>
            <small>Inactive student profiles</small>
          </div>
        </article>

        <article className="ms-stat-card">
          <span className="ms-stat-icon ms-blue">
            <BookOpen size={21} />
          </span>

          <div>
            <p>Assigned courses</p>
            <strong>{loading ? "—" : summary.total_courses}</strong>
            <small>Courses linked to your students</small>
          </div>
        </article>
      </section>

      {/* Student directory */}
      <section className="ms-panel">
        <div className="ms-panel-heading">
          <div>
            <h2>Student directory</h2>
            <p>Search and view the students assigned to you.</p>
          </div>

          <button
            className={`ms-button ms-button-secondary ${
              showFilters ? "ms-filter-active" : ""
            }`}
            type="button"
            onClick={() => setShowFilters((value) => !value)}
          >
            <Filter size={16} />
            Filters

            {activeFilterCount > 0 && (
              <span className="ms-filter-count">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="ms-toolbar">
          <label className="ms-search">
            <Search size={18} />

            <input
              type="search"
              value={filters.search}
              onChange={(event) =>
                updateFilter("search", event.target.value)
              }
              placeholder="Search name, email or student PIN..."
              aria-label="Search students"
            />
          </label>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="ms-filters">
            <label>
              Branch

              <select
                value={filters.branch}
                onChange={(event) =>
                  updateFilter("branch", event.target.value)
                }
              >
                <option value="">All branches</option>

                {availableFilters.branches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Section

              <select
                value={filters.section}
                onChange={(event) =>
                  updateFilter("section", event.target.value)
                }
              >
                <option value="">All sections</option>

                {availableFilters.sections.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Course

              <select
                value={filters.course}
                onChange={(event) =>
                  updateFilter("course", event.target.value)
                }
              >
                <option value="">All courses</option>

                {availableFilters.courses.map((course) => (
                  <option key={course.id} value={String(course.id)}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Status

              <select
                value={filters.status}
                onChange={(event) =>
                  updateFilter("status", event.target.value)
                }
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <button
              className="ms-clear-filters"
              type="button"
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Table status */}
        <div className="ms-table-topline">
          <span>
            {loading
              ? "Loading students..."
              : `${students.length} student${
                  students.length === 1 ? "" : "s"
                } found`}
          </span>

          <span>Student information is read-only</span>
        </div>

        {/* Student table */}
        <div className="ms-table-wrap">
          <table className="ms-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Student PIN</th>
                <th>Branch / Section</th>
                <th>Assigned courses</th>
                <th>Status</th>
                <th>Joined date</th>
                <th>Details</th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                paginatedStudents.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="ms-student-cell">
                        <span className="ms-avatar">
                          {getInitials(student.name)}
                        </span>

                        <span className="ms-student-info">
                          <strong>{student.name}</strong>
                          <small>
                            {student.email || "No email available"}
                          </small>
                        </span>
                      </div>
                    </td>

                    <td>{student.pin_number || "—"}</td>

                    <td>
                      <span className="ms-branch">
                        {student.branch || "—"}
                      </span>

                      <small className="ms-secondary-line">
                        Section {student.section || "—"}
                      </small>
                    </td>

                    <td>
                      <div className="ms-course-list">
                        {(student.courses || [])
                          .slice(0, 2)
                          .map((course) => (
                            <span
                              className="ms-course-chip"
                              key={course.id}
                            >
                              {course.title}
                            </span>
                          ))}

                        {(student.courses || []).length > 2 && (
                          <span className="ms-course-chip">
                            +{student.courses.length - 2} more
                          </span>
                        )}

                        {!student.courses?.length && "—"}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`ms-status ${
                          student.is_active ? "is-active" : "is-inactive"
                        }`}
                      >
                        {student.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td>{formatDate(student.joined_at)}</td>

                    <td>
                      <button
                        className="ms-view-button"
                        type="button"
                        onClick={() => viewStudent(student)}
                        aria-label={`View ${student.name}`}
                      >
                        <Eye size={16} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}

              {!loading && students.length === 0 && (
                <tr>
                  <td colSpan="7">
                    <div className="ms-empty">
                      <span className="ms-empty-icon">
                        <Users size={24} />
                      </span>

                      <strong>No students found</strong>

                      <p>
                        {activeFilterCount
                          ? "Try changing your search or filters."
                          : "Students assigned to your courses will appear here."}
                      </p>

                      {activeFilterCount > 0 && (
                        <button
                          className="ms-button ms-button-secondary"
                          type="button"
                          onClick={resetFilters}
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan="7">
                    <div className="ms-loading">
                      Loading student directory…
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && students.length > 0 && (
          <div className="ms-pagination">
            <span className="ms-pagination-info">
              Showing {(currentPage - 1) * recordsPerPage + 1}–
              {Math.min(currentPage * recordsPerPage, students.length)} of {students.length} students
            </span>
            <div className="ms-pagination-controls">
              <button
                className="ms-page-button"
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="ms-page-number">
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="ms-page-button"
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
      </section>

      {/* Student details modal */}
      {selectedStudent && (
        <div
          className="ms-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeStudentDetails();
            }
          }}
        >
          <section
            className="ms-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ms-detail-title"
          >
            <header className="ms-modal-header">
              <div>
                <span className="ms-eyebrow">STUDENT PROFILE</span>
                <h2 id="ms-detail-title">Student details</h2>
              </div>

              <button
                className="ms-close-button"
                type="button"
                aria-label="Close student details"
                onClick={closeStudentDetails}
              >
                <X size={19} />
              </button>
            </header>

            {/* Profile summary */}
            <div className="ms-profile-top">
              <span className="ms-profile-avatar">
                {getInitials(selectedStudent.name)}
              </span>

              <div>
                <h3>{selectedStudent.name}</h3>
                <p>{selectedStudent.email || "No email available"}</p>

                <span
                  className={`ms-status ${
                    selectedStudent.is_active ? "is-active" : "is-inactive"
                  }`}
                >
                  {selectedStudent.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            {/* Profile information */}
            <div className="ms-detail-grid">
              <div>
                <Hash size={17} />
                <span>
                  <small>Student PIN</small>
                  <strong>{selectedStudent.pin_number || "—"}</strong>
                </span>
              </div>

              <div>
                <GraduationCap size={17} />
                <span>
                  <small>Branch / Section</small>
                  <strong>
                    {selectedStudent.branch || "—"} /{" "}
                    {selectedStudent.section || "—"}
                  </strong>
                </span>
              </div>

              <div>
                <Mail size={17} />
                <span>
                  <small>Email</small>
                  <strong>{selectedStudent.email || "—"}</strong>
                </span>
              </div>

              <div>
                <Phone size={17} />
                <span>
                  <small>Phone</small>
                  <strong>{selectedStudent.phone_number || "—"}</strong>
                </span>
              </div>

              <div>
                <CalendarDays size={17} />
                <span>
                  <small>Joined date</small>
                  <strong>{formatDate(selectedStudent.joined_at)}</strong>
                </span>
              </div>

              <div>
                <GraduationCap size={17} />
                <span>
                  <small>Percentage</small>
                  <strong>
                    {selectedStudent.percentage ?? "—"}
                    {selectedStudent.percentage != null ? "%" : ""}
                  </strong>
                </span>
              </div>
            </div>

            {/* Assigned courses */}
            <div className="ms-modal-courses">
              <h3>Assigned courses</h3>

              {selectedStudent.courses?.length ? (
                selectedStudent.courses.map((course) => (
                  <div className="ms-modal-course" key={course.id}>
                    <span className="ms-modal-course-icon">
                      <BookOpen size={17} />
                    </span>

                    <span>
                      <strong>{course.title}</strong>
                      <small>{course.category || "Course"}</small>
                    </span>
                  </div>
                ))
              ) : (
                <p>No course details available.</p>
              )}
            </div>

            {/* Modal footer */}
            <footer className="ms-modal-footer">
              <span>Profile details are view-only.</span>

              <button
                className="ms-button ms-button-primary"
                type="button"
                onClick={closeStudentDetails}
              >
                Done
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}