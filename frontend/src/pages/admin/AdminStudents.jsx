import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import "../../styles/admin-students.css";

const API_URL = `${import.meta.env.VITE_API_BASE_URL || "https://edutrack-7-rey4.onrender.com/api"}/users/students/`;

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  pin_number: "",
  percentage: "",
  branch: "",
  section: "",
  phone_number: "",
};

const BRANCH_OPTIONS = ["CSE", "CSM", "AIML", "AI", "IT", "ECE", "EEE", "Mechanical", "Civil", "Other"];

const COUNTRY_CODES = [
  { country: "India", code: "+91" }, { country: "United States", code: "+1" },
  { country: "United Kingdom", code: "+44" }, { country: "Canada", code: "+1" },
  { country: "Australia", code: "+61" }, { country: "United Arab Emirates", code: "+971" },
  { country: "Singapore", code: "+65" }, { country: "Germany", code: "+49" },
  { country: "France", code: "+33" }, { country: "Japan", code: "+81" },
  { country: "China", code: "+86" }, { country: "Nepal", code: "+977" },
  { country: "Sri Lanka", code: "+94" }, { country: "Bangladesh", code: "+880" },
  { country: "Pakistan", code: "+92" }, { country: "Saudi Arabia", code: "+966" },
  { country: "South Africa", code: "+27" }, { country: "New Zealand", code: "+64" },
  { country: "Ireland", code: "+353" }, { country: "Netherlands", code: "+31" },
  { country: "Italy", code: "+39" }, { country: "Spain", code: "+34" },
  { country: "Brazil", code: "+55" }, { country: "Mexico", code: "+52" },
];

function splitPhoneNumber(value = "") {
  const normalized = String(value).trim();
  const match = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length)
    .find(({ code }) => normalized.startsWith(code));

  return match
    ? { code: match.code, number: normalized.slice(match.code.length).replace(/\D/g, "") }
    : { code: "+91", number: normalized.replace(/^\+?91/, "").replace(/\D/g, "") };
}

function getAccessToken() {
  return (
    localStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    sessionStorage.getItem("access_token") ||
    ""
  );
}

async function apiRequest(url, options = {}) {
  const token = getAccessToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof result === "object"
        ? result.detail ||
          result.message ||
          Object.entries(result)
            .map(([key, value]) => {
              const text = Array.isArray(value)
                ? value.join(", ")
                : String(value);
              return `${key}: ${text}`;
            })
            .join("\n")
        : result;

    throw new Error(message || `Request failed (${response.status})`);
  }

  return result;
}

function getStudentList(result) {
  if (Array.isArray(result)) return result;
  return result?.students || result?.data?.students || result?.results || [];
}

function getInitials(student) {
  const initials = `${student.first_name || ""} ${
    student.last_name || ""
  }`
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  return initials || "ST";
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  const loadStudents = useCallback(async (showSuccess = false) => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest(API_URL);
      setStudents(getStudentList(result));
      if (showSuccess) toast.success("Students refreshed successfully.");
    } catch (err) {
      const message = err.message || "Unable to load students.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const branches = useMemo(
    () =>
      [...new Set(students.map((student) => student.branch).filter(Boolean))].sort(),
    [students]
  );

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return students.filter((student) => {
      const searchable = [
        student.id,
        student.first_name,
        student.last_name,
        student.email,
        student.pin_number,
        student.branch,
        student.section,
        student.phone_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchable.includes(query);
      const matchesBranch =
        branchFilter === "all" || student.branch === branchFilter;
      return matchesSearch && matchesBranch;
    });
  }, [students, search, branchFilter]);

  const totalPages = Math.max(
  1,
  Math.ceil(filteredStudents.length / itemsPerPage)
);

const paginatedStudents = useMemo(() => {
  const startIndex = (currentPage - 1) * itemsPerPage;

  return filteredStudents.slice(
    startIndex,
    startIndex + itemsPerPage
  );
}, [filteredStudents, currentPage]);

const startRecord =
  filteredStudents.length === 0
    ? 0
    : (currentPage - 1) * itemsPerPage + 1;

const endRecord = Math.min(
  currentPage * itemsPerPage,
  filteredStudents.length
);

useEffect(() => {
  if (currentPage > totalPages) {
    setCurrentPage(totalPages);
  }
}, [currentPage, totalPages]);

  const activeCount = students.filter(
    (student) => student.is_active !== false
  ).length;

  const averagePercentage = students.length
    ? (
        students.reduce(
          (total, student) => total + Number(student.percentage || 0),
          0
        ) / students.length
      ).toFixed(2)
    : "0.00";

  function openCreateModal() {
    setEditingStudent(null);
    setForm(emptyForm);
    setShowPassword(false);
    setCountryCode("+91");
    setPhoneDigits("");
    setError("");
    setModalOpen(true);
  }

  function openEditModal(student) {
    setEditingStudent(student);
    setForm({
      ...emptyForm,
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      email: student.email || "",
      pin_number: student.pin_number || "",
      percentage: student.percentage ?? "",
      branch: student.branch || "",
      section: student.section || "",
      phone_number: "",
    });

    const parsedPhone = splitPhoneNumber(student.phone_number || "");
    setCountryCode(parsedPhone.code);
    setPhoneDigits(parsedPhone.number);
    setShowPassword(false);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingStudent(null);
    setForm(emptyForm);
    setShowPassword(false);
    setCountryCode("+91");
    setPhoneDigits("");
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      pin_number: form.pin_number.trim(),
      percentage: Number(form.percentage),
      branch: form.branch.trim(),
      section: form.section.trim(),
      phone_number: `${countryCode}${phoneDigits.replace(/\D/g, "")}`,
    };

    if (!editingStudent) {
      payload.password = form.password;
    }

    try {
      if (editingStudent) {
        await apiRequest(`${API_URL}${editingStudent.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Student details updated successfully.");
      } else {
        await apiRequest(API_URL, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Student created successfully.");
      }

      setModalOpen(false);
      setEditingStudent(null);
      setForm(emptyForm);
      setShowPassword(false);
      setCountryCode("+91");
      setPhoneDigits("");
      await loadStudents();
    } catch (err) {
      const message = err.message || "Unable to save student.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!studentToDelete) return;

    const studentName =
      [studentToDelete.first_name, studentToDelete.last_name]
        .filter(Boolean)
        .join(" ") || "Student";

    try {
      await apiRequest(`${API_URL}${studentToDelete.id}/`, {
        method: "DELETE",
      });

      setStudents((current) =>
        current.filter((student) => student.id !== studentToDelete.id)
      );
      setStudentToDelete(null);
      // Use the red toast style requested for successful deletion.
      toast.error("Student deleted successfully.");
    } catch (err) {
      toast.error(err.message || "Unable to delete student.");
    }
  }

  function exportCSV() {
    const columns = [
      ["ID", "id"],
      ["First Name", "first_name"],
      ["Last Name", "last_name"],
      ["Email", "email"],
      ["PIN Number", "pin_number"],
      ["Percentage", "percentage"],
      ["Branch", "branch"],
      ["Section", "section"],
      ["Phone Number", "phone_number"],
      ["Joined Date", "joined_at"],
    ];

    const escapeCSV = (value) => {
      const text =
        value === null || value === undefined
          ? ""
          : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const rows = [
      columns.map(([heading]) => escapeCSV(heading)).join(","),
      ...filteredStudents.map((student) =>
        columns
          .map(([heading, key]) => {
            let value = student[key];

            if (key === "is_active") {
              value = student.is_active === false ? "Inactive" : "Active";
            }
            if (key === "joined_at") value = formatDate(value);

            return escapeCSV(value);
          })
          .join(",")
      ),
    ];

    const blob = new Blob(["\uFEFF" + rows.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "edutrack_students.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Student CSV exported successfully.");
  }

  function exportPDF() {
    window.print();
  }

  async function refreshStudents() {
    await loadStudents(true);
  }

  return (
    <div className="admin-students-page">
      <div className="students-page-header">
        <div>
          <span className="students-eyebrow">EDUTRACK / ADMINISTRATION</span>
          <h1>Student Management</h1>
          <p>Manage student profiles, academic details and account status.</p>
        </div>

        <div className="students-header-actions">
          <button
            type="button"
            className="students-btn students-btn-secondary"
            onClick={exportCSV}
            disabled={!filteredStudents.length}
          >
            <span aria-hidden="true">↓</span> Export CSV
          </button>
          <button
            type="button"
            className="students-btn students-btn-secondary"
            onClick={exportPDF}
            disabled={!filteredStudents.length}
          >
            <span aria-hidden="true">▤</span> Export PDF
          </button>
          <button
            type="button"
            className="students-btn students-btn-primary"
            onClick={openCreateModal}
          >
            <span aria-hidden="true">＋</span> Add Student
          </button>
        </div>
      </div>

      <section className="students-stat-grid" aria-label="Student statistics">
        <article className="students-stat-card">
          <div className="students-stat-icon students-icon-purple">♙</div>
          <div>
            <span>Total Students</span>
            <strong>{students.length}</strong>
            <small>All student records</small>
          </div>
        </article>

        <article className="students-stat-card">
          <div className="students-stat-icon students-icon-green">✓</div>
          <div>
            <span>Active Students</span>
            <strong>{activeCount}</strong>
            <small>Currently active accounts</small>
          </div>
        </article>

        <article className="students-stat-card">
          <div className="students-stat-icon students-icon-blue">%</div>
          <div>
            <span>Average Percentage</span>
            <strong>{averagePercentage}%</strong>
            <small>Across all student records</small>
          </div>
        </article>

        <article className="students-stat-card">
          <div className="students-stat-icon students-icon-orange">⌘</div>
          <div>
            <span>Branches</span>
            <strong>{branches.length}</strong>
            <small>Distinct branches represented</small>
          </div>
        </article>
      </section>

      <section className="students-table-card">
        <div className="students-table-heading">
          <div>
            <h2>All Students</h2>
            <p>
              Showing {filteredStudents.length} of {students.length} students
            </p>
          </div>
          <button
            type="button"
            className="students-btn students-btn-secondary students-refresh-btn"
            onClick={refreshStudents}
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </div>

        <div className="students-filters">
          <label className="students-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
  setSearch(event.target.value);
  setCurrentPage(1);
}}
              placeholder="Search name, PIN, email or phone..."
              aria-label="Search students"
            />
          </label>

          <select
            value={branchFilter}
            onChange={(event) => {
  setBranchFilter(event.target.value);
  setCurrentPage(1);
}}
            aria-label="Filter by branch"
          >
            <option value="all">All branches</option>
            {branches.map((branch) => (
              <option value={branch} key={branch}>
                {branch}
              </option>
            ))}
          </select>
        </div>

        <div className="students-table-wrap">
          <table className="students-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>PIN Number</th>
                <th>Branch / Section</th>
                <th>Percentage</th>
                <th>Joined Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="students-empty-state">
                    <span className="students-loader" />
                    Loading students...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="students-empty-state">
                    <span className="students-empty-icon">♙</span>
                    <strong>No students found</strong>
                    <span>
                      {students.length
                        ? "Try changing your search or filters."
                        : "Add your first student to get started."}
                    </span>
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="students-person">
                        <div className="students-avatar">
                          {getInitials(student)}
                        </div>
                        <div className="students-person-info">
                          <strong>
                            {[student.first_name, student.last_name]
                              .filter(Boolean)
                              .join(" ") || "Unnamed Student"}
                          </strong>
                          <span>{student.email || "No email"}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="students-pin">
                        {student.pin_number || "—"}
                      </span>
                    </td>
                    <td>
                      <div className="students-branch">
                        <strong>{student.branch || "—"}</strong>
                        <span>Section {student.section || "—"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="students-percentage">
                        <strong>{Number(student.percentage || 0).toFixed(2)}%</strong>
                        <div className="students-progress-track">
                          <span
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, Number(student.percentage || 0))
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>{formatDate(student.joined_at)}</td>
                    <td>
                      <div className="students-row-actions">
                        <button
                          type="button"
                          className="students-icon-btn"
                          title="Edit student"
                          aria-label={`Edit ${
                            student.first_name || "student"
                          }`}
                          onClick={() => openEditModal(student)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="students-icon-btn students-delete-btn"
                          title="Delete student"
                          aria-label={`Delete ${student.first_name || "student"}`}
                          onClick={() => setStudentToDelete(student)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="students-table-footer">
  <span className="students-pagination-info">
    Showing {startRecord}–{endRecord} of {filteredStudents.length} students
  </span>

  <div className="students-pagination-controls">
    <button
      type="button"
      className="students-page-btn"
      disabled={currentPage === 1}
      onClick={() => setCurrentPage((page) => page - 1)}
    >
      Previous
    </button>

    {Array.from({ length: totalPages }, (_, index) => {
      const page = index + 1;

      return (
        <button
          key={page}
          type="button"
          className={`students-page-btn ${
            currentPage === page ? "active" : ""
          }`}
          onClick={() => setCurrentPage(page)}
        >
          {page}
        </button>
      );
    })}

    <button
      type="button"
      className="students-page-btn"
      disabled={currentPage === totalPages}
      onClick={() => setCurrentPage((page) => page + 1)}
    >
      Next
    </button>
  </div>
</div>
      </section>

      {modalOpen && (
        <div
          className="students-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="students-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="students-modal-title"
          >
            <div className="students-modal-header">
              <div>
                <span className="students-eyebrow">STUDENT RECORD</span>
                <h2 id="students-modal-title">
                  {editingStudent ? "Edit Student" : "Add New Student"}
                </h2>
                <p>
                  {editingStudent
                    ? "Update the student's information below."
                    : "Enter the student's account and academic details."}
                </p>
              </div>
              <button
                type="button"
                className="students-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="students-form-grid">
                <label>
                  First Name <span>*</span>
                  <input
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    required
                    maxLength={150}
                    autoComplete="given-name"
                  />
                </label>

                <label>
                  Last Name <span>*</span>
                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    required
                    maxLength={150}
                    autoComplete="family-name"
                  />
                </label>

                <label className="students-form-full">
                  Email Address <span>*</span>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    autoComplete="email"
                  />
                </label>

                {!editingStudent && (
                  <label className="students-form-full">
                    Initial Password <span>*</span>
                    <div className="students-password-wrap">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="students-password-toggle"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <small>At least 8 characters. The backend hashes this password.</small>
                  </label>
                )}

                <label>
                  PIN Number <span>*</span>
                  <input
                    name="pin_number"
                    value={form.pin_number}
                    onChange={handleChange}
                    required
                    maxLength={30}
                  />
                </label>

                <label>
                  Percentage <span>*</span>
                  <input
                    type="number"
                    name="percentage"
                    value={form.percentage}
                    onChange={handleChange}
                    required
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </label>

                <label>
                  Branch <span>*</span>
                  <select
                    name="branch"
                    value={form.branch}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select branch</option>
                    {BRANCH_OPTIONS.map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                    {form.branch && !BRANCH_OPTIONS.includes(form.branch) && (
                      <option value={form.branch}>{form.branch}</option>
                    )}
                  </select>
                </label>

                <label>
                  Section <span>*</span>
                  <input
                    name="section"
                    value={form.section}
                    onChange={handleChange}
                    required
                    maxLength={20}
                    placeholder="e.g. A"
                  />
                </label>

                <label className="students-form-full">
                  Phone Number <span>*</span>
                  <div className="students-phone-wrap">
                    <select
                      value={countryCode}
                      onChange={(event) => setCountryCode(event.target.value)}
                      aria-label="Country calling code"
                      className="students-country-code"
                    >
                      {COUNTRY_CODES.map((country) => (
                        <option
                          key={`${country.country}-${country.code}`}
                          value={country.code}
                        >
                          {country.code}
                        </option>
                      ))}
                    </select>

                    <input
                      type="tel"
                      value={phoneDigits}
                      onChange={(event) => setPhoneDigits(event.target.value.replace(/[^0-9]/g, ""))}
                      required
                      inputMode="numeric"
                      minLength={6}
                      maxLength={15}
                      pattern="[0-9]{6,15}"
                      title="Enter 6 to 15 digits without the country code."
                      placeholder="Enter phone number"
                      autoComplete="tel-national"
                    />
                  </div>
                  <small>The selected country code is included automatically when saving.</small>
                </label>
              </div>

              {error && (
                <div className="students-alert students-alert-error" role="alert">
                  {error}
                </div>
              )}

              <div className="students-modal-footer">
                <button
                  type="button"
                  className="students-btn students-btn-secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="students-btn students-btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingStudent
                    ? "Save Changes"
                    : "Create Student"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {studentToDelete && (
        <div className="students-modal-backdrop">
          <section
            className="students-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="students-confirm-title"
          >
            <div className="students-confirm-icon">!</div>
            <h2 id="students-confirm-title">Delete Student?</h2>
            <p>
              Are you sure you want to delete{" "}
              <strong>
                {[studentToDelete.first_name, studentToDelete.last_name]
                  .filter(Boolean)
                  .join(" ")}
              </strong>
              ? This action will permanently remove the student record and cannot be undone.
            </p>
            <div className="students-modal-footer">
              <button
                type="button"
                className="students-btn students-btn-secondary"
                onClick={() => {
                  setStudentToDelete(null);
                  toast("Deletion cancelled.");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="students-btn students-btn-danger"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}