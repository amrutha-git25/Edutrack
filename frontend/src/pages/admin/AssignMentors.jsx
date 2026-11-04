import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Users,
  BookOpen,
  GraduationCap,
  Pencil,
  Trash2,
  RefreshCw,
  X,
  UserRoundCheck,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import "./AssignMentors.css";

const API_BASE = "http://127.0.0.1:8000/api";

function getToken() {
  return (
    localStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    sessionStorage.getItem("access_token")
  );
}

async function apiRequest(path, options = {}) {
  const token = getToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      data?.message ||
      data?.detail ||
      data?.error ||
      (typeof data === "string" ? data : "Request failed.");

    throw new Error(message);
  }

  return data;
}

function fullName(person) {
  return (
    [person?.first_name, person?.last_name].filter(Boolean).join(" ") ||
    person?.name ||
    person?.full_name ||
    person?.email ||
    "Unnamed"
  );
}

function unwrapList(data, keys) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

function getStudentLabel(student) {
  return (
    student.student_name ||
    fullName(student.user || student) ||
    student.pin_number ||
    `Student ${student.id}`
  );
}

function getMentorLabel(mentor) {
  return fullName(mentor);
}

function getErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : "Something went wrong.";
}

export default function AssignMentors() {
  const [students, setStudents] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState({
    student: "",
    course: "",
    mentor: "",
  });

  // Load students, mentors, courses and assignments.
  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [studentData, mentorData, courseData, assignmentData] =
        await Promise.all([
          apiRequest("/users/students/"),
          apiRequest("/users/mentors/"),
          apiRequest("/courses/"),
          apiRequest("/courses/mentor-assignments/"),
        ]);

      setStudents(
        unwrapList(studentData, ["students", "results"]).filter(
          (item) => item.is_active !== false
        )
      );

      setMentors(
        unwrapList(mentorData, ["mentors", "results"]).filter(
          (item) => item.is_active !== false
        )
      );

      setCourses(
        unwrapList(courseData, ["courses", "results"]).filter(
          (item) => item.status !== "archived"
        )
      );

      setAssignments(
        unwrapList(assignmentData, ["assignments", "results"])
      );

      return true;
    } catch (error) {
      toast.error(
        `${getErrorMessage(error)} Check the backend, admin login, and API endpoints.`
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Search assignments.
  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return assignments;

    return assignments.filter((item) => {
      const text = [
        item.student_name,
        item.student_pin,
        item.subject_name,
        item.mentor_name,
        item.mentor_email,
        item.course_title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(query);
    });
  }, [assignments, search]);

  // Pagination: display 3 assignments per page.
  const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / itemsPerPage));
  const paginatedAssignments = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAssignments.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAssignments, currentPage]);

  const startRecord = filteredAssignments.length === 0
    ? 0
    : (currentPage - 1) * itemsPerPage + 1;
  const endRecord = Math.min(currentPage * itemsPerPage, filteredAssignments.length);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Dashboard statistics.
  const stats = useMemo(
    () => [
      {
        label: "Total assignments",
        value: assignments.length,
        icon: UserRoundCheck,
      },
      {
        label: "Active students",
        value: students.length,
        icon: GraduationCap,
      },
      {
        label: "Available mentors",
        value: mentors.length,
        icon: Users,
      },
      {
        label: "Subjects",
        value: courses.length,
        icon: BookOpen,
      },
    ],
    [assignments, students, mentors, courses]
  );

  function openCreateModal() {
    setEditing(null);
    setForm({ student: "", course: "", mentor: "" });
    setModalOpen(true);
  }

  function openEditModal(assignment) {
    setEditing(assignment);

    setForm({
      student: String(assignment.student ?? ""),
      course: String(assignment.course ?? ""),
      mentor: String(assignment.mentor ?? ""),
    });

    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditing(null);
    setForm({ student: "", course: "", mentor: "" });
  }

  function updateForm(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  // Create or update an assignment.
  async function handleSubmit(event) {
    event.preventDefault();

    if (saving) return;

    if (!form.student || !form.course || !form.mentor) {
      toast.error("Please select a student, subject, and mentor.");
      return;
    }

    const payload = {
      student: Number(form.student),
      course: Number(form.course),
      mentor: Number(form.mentor),
    };

    setSaving(true);

    try {
      const isEditing = Boolean(editing);

      const path = isEditing
        ? `/courses/mentor-assignments/${editing.id}/`
        : "/courses/mentor-assignments/";

      const data = await apiRequest(path, {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });

      setModalOpen(false);
      setEditing(null);
      setForm({ student: "", course: "", mentor: "" });

      toast.success(
        data?.message ||
          (isEditing
            ? "Mentor assignment updated successfully."
            : "Mentor assigned successfully.")
      );

      // Refresh the table without replacing the success toast.
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  // Delete an assignment.
  async function handleDelete() {
    if (!deleteTarget || deleting) return;

    setDeleting(true);

    try {
      await apiRequest(
        `/courses/mentor-assignments/${deleteTarget.id}/`,
        { method: "DELETE" }
      );

      setDeleteTarget(null);
      toast.success("Mentor assignment deleted successfully.");

      await loadData();
    } catch (error) {
      toast.error(
        `Unable to delete the assignment: ${getErrorMessage(error)}`
      );
    } finally {
      setDeleting(false);
    }
  }

  function cancelDelete() {
    if (deleting) return;

    setDeleteTarget(null);
    toast.info("Assignment deletion cancelled.");
  }

  async function handleRefresh() {
    if (loading) return;

    const refreshed = await loadData();

    if (refreshed) {
      toast.success("Assignments refreshed successfully.");
    }
  }

  function findStudent(assignment) {
    return (
      students.find(
        (item) => String(item.id) === String(assignment.student)
      ) || null
    );
  }

  function findMentor(assignment) {
    return (
      mentors.find(
        (item) => String(item.id) === String(assignment.mentor)
      ) || null
    );
  }

  function findCourse(assignment) {
    return (
      courses.find(
        (item) => String(item.id) === String(assignment.course)
      ) || null
    );
  }

  return (
    <main className="assign-mentors-page">
      {/* Toast notification container */}
      <Toaster
        position="top-right"
        duration={3000}
        richColors
        closeButton
        visibleToasts={4}
      />

      {/* Page heading */}
      <section className="am-heading">
        <div>
          <p className="am-eyebrow">
            ADMINISTRATION / ACADEMICS
          </p>

          <h1>Assign Mentors</h1>

          <p className="am-subtitle">
            Connect each student with the right mentor for each subject.
          </p>
        </div>

        <div className="am-heading-actions">
          <button
            type="button"
            className="am-button am-button-secondary"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Refresh
          </button>

          <button
            type="button"
            className="am-button am-button-primary"
            onClick={openCreateModal}
          >
            <Plus size={18} />
            Assign mentor
          </button>
        </div>
      </section>

      {/* Statistics */}
      <section className="am-stats">
        {stats.map(({ label, value, icon: Icon }) => (
          <article className="am-stat-card" key={label}>
            <div className="am-stat-icon">
              <Icon size={21} />
            </div>

            <div>
              <p>{label}</p>
              <strong>{loading ? "—" : value}</strong>
            </div>
          </article>
        ))}
      </section>

      {/* Assignments table */}
      <section className="am-table-card">
        <div className="am-table-header">
          <div>
            <h2>Student mentor assignments</h2>
            <p>
              Manage the mentor assigned to each student and subject.
            </p>
          </div>

          <label className="am-search">
            <Search size={18} />

            <input
              type="search"
              placeholder="Search student, subject, mentor..."
              value={search}
             onChange={(event) => {
  setSearch(event.target.value);
  setCurrentPage(1);
}}
              aria-label="Search assignments"
            />
          </label>
        </div>

        <div className="am-table-wrap">
          <table className="am-table">
            <thead>
              <tr>
                <th>STUDENT</th>
                <th>SUBJECT</th>
                <th>ASSIGNED MENTOR</th>
                <th>ASSIGNED ON</th>
                <th className="am-actions-heading">ACTIONS</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="am-empty">
                    Loading assignments...
                  </td>
                </tr>
              ) : filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="am-empty">
                    <div className="am-empty-icon">
                      <Users size={27} />
                    </div>

                    <strong>No assignments found</strong>

                    <p>
                      {search
                        ? "Try another search term."
                        : "Create your first student mentor assignment."}
                    </p>

                    {!search && (
                      <button
                        type="button"
                        className="am-button am-button-primary"
                        onClick={openCreateModal}
                      >
                        <Plus size={17} />
                        Create assignment
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedAssignments.map((assignment) => {
                  const student = findStudent(assignment);
                  const mentor = findMentor(assignment);
                  const course = findCourse(assignment);

                  const studentName =
                    assignment.student_name ||
                    getStudentLabel(student || {});

                  const mentorName =
                    assignment.mentor_name ||
                    getMentorLabel(mentor || {});

                  return (
                    <tr key={assignment.id}>
                      <td>
                        <div className="am-person">
                          <div className="am-avatar am-avatar-student">
                            {studentName.charAt(0).toUpperCase()}
                          </div>

                          <div>
                            <strong>{studentName}</strong>
                            <span>
                              PIN:{" "}
                              {assignment.student_pin ||
                                student?.pin_number ||
                                "—"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="am-subject">
                          <BookOpen size={15} />

                          {assignment.subject_name ||
                            assignment.course_title ||
                            course?.title ||
                            "Subject"}
                        </span>
                      </td>

                      <td>
                        <div className="am-person">
                          <div className="am-avatar am-avatar-mentor">
                            {mentorName.charAt(0).toUpperCase()}
                          </div>

                          <div>
                            <strong>{mentorName}</strong>
                            <span>
                              {assignment.mentor_email ||
                                mentor?.email ||
                                mentor?.specialization ||
                                "Mentor"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        {assignment.assigned_at
                          ? new Date(
                              assignment.assigned_at
                            ).toLocaleDateString()
                          : "—"}
                      </td>

                      <td>
                        <div className="am-row-actions">
                          <button
                            type="button"
                            className="am-icon-button am-edit-button"
                            title="Edit assignment"
                            aria-label="Edit assignment"
                            onClick={() => openEditModal(assignment)}
                          >
                            <Pencil size={17} />
                          </button>

                          <button
                            type="button"
                            className="am-icon-button am-delete-button"
                            title="Delete assignment"
                            aria-label="Delete assignment"
                            onClick={() => setDeleteTarget(assignment)}
                          >
                            <Trash2 size={17} />
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

        <div className="am-table-footer am-pagination-footer">
          <span className="am-pagination-info">
            {loading
              ? "Loading assignments..."
              : `Showing ${startRecord}-${endRecord} of ${filteredAssignments.length} assignments`}
          </span>

          {!loading && filteredAssignments.length > 0 && (
            <div className="am-pagination-controls" aria-label="Assignments pagination">
              <button
                type="button"
                className="am-page-button"
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
                  className={`am-page-button ${currentPage === page ? "active" : ""}`}
                  onClick={() => setCurrentPage(page)}
                  aria-current={currentPage === page ? "page" : undefined}
                  aria-label={`Page ${page}`}
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                className="am-page-button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Create/Edit assignment modal */}
      {modalOpen && (
        <div
          className="am-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="am-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="am-modal-title"
          >
            <div className="am-modal-header">
              <div>
                <p className="am-eyebrow">STUDENT LEARNING</p>

                <h2 id="am-modal-title">
                  {editing ? "Edit assignment" : "Assign a mentor"}
                </h2>

                <p>
                  Choose the student, subject, and mentor for this assignment.
                </p>
              </div>

              <button
                type="button"
                className="am-modal-close"
                aria-label="Close modal"
                onClick={closeModal}
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>

            <form className="am-form" onSubmit={handleSubmit}>
              <label>
                Student

                <select
                  value={form.student}
                  onChange={(event) =>
                    updateForm("student", event.target.value)
                  }
                  required
                >
                  <option value="">Select a student</option>

                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {getStudentLabel(student)}
                      {student.pin_number
                        ? ` (${student.pin_number})`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Subject

                <select
                  value={form.course}
                  onChange={(event) =>
                    updateForm("course", event.target.value)
                  }
                  required
                >
                  <option value="">Select a subject</option>

                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Mentor

                <select
                  value={form.mentor}
                  onChange={(event) =>
                    updateForm("mentor", event.target.value)
                  }
                  required
                >
                  <option value="">Select a mentor</option>

                  {mentors.map((mentor) => (
                    <option key={mentor.id} value={mentor.id}>
                      {getMentorLabel(mentor)}
                      {mentor.specialization
                        ? ` — ${mentor.specialization}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>

              {students.length === 0 && (
                <p className="am-form-hint">
                  No active students were returned by the students API.
                </p>
              )}

              {courses.length === 0 && (
                <p className="am-form-hint">
                  No subjects were returned. Create courses first.
                </p>
              )}

              {mentors.length === 0 && (
                <p className="am-form-hint">
                  No active mentors were returned by the mentors API.
                </p>
              )}

              <div className="am-modal-actions">
                <button
                  type="button"
                  className="am-button am-button-secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="am-button am-button-primary"
                  disabled={
                    saving ||
                    students.length === 0 ||
                    courses.length === 0 ||
                    mentors.length === 0
                  }
                >
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Save changes"
                      : "Assign mentor"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="am-modal-overlay">
          <section
            className="am-modal am-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="am-delete-title"
          >
            <div className="am-confirm-icon">
              <Trash2 size={24} />
            </div>

            <h2 id="am-delete-title">
              Delete this assignment?
            </h2>

            <p>
              This removes the mentor assignment for{" "}
              <strong>
                {deleteTarget.student_name || "this student"}
              </strong>{" "}
              in{" "}
              <strong>
                {deleteTarget.subject_name ||
                  deleteTarget.course_title ||
                  "this subject"}
              </strong>
              . This action cannot be undone.
            </p>

            <div className="am-modal-actions">
              <button
                type="button"
                className="am-button am-button-secondary"
                onClick={cancelDelete}
                disabled={deleting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="am-button am-button-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 size={17} />
                {deleting ? "Deleting..." : "Delete assignment"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}