import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchMentors } from "../../api/adminDashboardApi";
import {
  FiBookOpen,
  FiPlus,
  FiSearch,
  FiRefreshCw,
  FiEdit2,
  FiTrash2,
  FiX,
  FiClock,
  FiLayers,
  FiCheckCircle,
  FiFileText,
} from "react-icons/fi";
import "../../styles/admin-courses.css";

const API_URL = `${import.meta.env.VITE_API_BASE_URL || "https://edutrack-7-rey4.onrender.com/api"}/courses/`;

const API_ORIGIN = "https://edutrack-7-rey4.onrender.com";

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "",
  mentor: "",
  duration: "",
  status: "draft",
  thumbnail: null,
};

function getToken() {
  return (
    localStorage.getItem("access") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token")
  );
}

function getImageUrl(thumbnail) {
  if (!thumbnail || typeof thumbnail !== "string") return "";

  if (/^https?:\/\//i.test(thumbnail)) {
    return thumbnail;
  }

  return `${API_ORIGIN}/${thumbnail.replace(/^\/+/, "")}`;
}

async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Your session may have expired. Please log in again."
      );
    }

    throw new Error(
      data?.detail ||
        data?.error ||
        Object.entries(data || {})
          .map(([key, value]) =>
            `${key}: ${Array.isArray(value) ? value.join(", ") : value}`
          )
          .join(" | ") ||
        `Request failed (${response.status})`
    );
  }

  return data;
}

function StatusBadge({ status }) {
  // The UI only supports Draft and Published statuses.
  const visibleStatus = status === "published" ? "published" : "draft";

  return (
    <span className={`ac-status ac-status-${visibleStatus}`}>
      {visibleStatus.charAt(0).toUpperCase() + visibleStatus.slice(1)}
    </span>
  );
}

function StatCard({ icon, label, value, detail }) {
  return (
    <article className="ac-stat-card">
      <div className="ac-stat-top">
        <span className="ac-stat-icon">{icon}</span>
        <span className="ac-stat-detail">{detail}</span>
      </div>
      <div className="ac-stat-value">{value}</div>
      <div className="ac-stat-label">{label}</div>
    </article>
  );
}

function CourseThumbnail({ thumbnail, title }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = getImageUrl(thumbnail);

  useEffect(() => {
    setImageFailed(false);
  }, [thumbnail]);

  if (!imageUrl || imageFailed) {
    return (
      <div
        className="ac-thumbnail ac-thumbnail-placeholder"
        aria-label="Course image unavailable"
      >
        <FiBookOpen />
      </div>
    );
  }

  return (
    <img
      className="ac-thumbnail"
      src={imageUrl}
      alt={`${title || "Course"} thumbnail`}
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  );
}

export default function AdminCourses() {
  const [courses, setCourses] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [mentorsLoading, setMentorsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [deleteConfirmCourse, setDeleteConfirmCourse] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  const loadMentors = useCallback(async () => {
    setMentorsLoading(true);

    try {
      // Reuse the same API helper as the Admin Mentor Management page.
      // That helper already uses the project's real endpoint: /api/users/mentors/.
      const response = await fetchMentors();
      const rows = Array.isArray(response) ? response : [];

      const normalized = rows
        .map((item) => {
          const id = item?.id ?? item?.pk ?? item?.mentor_id ?? item?.user_id;
          const firstName = item?.first_name ?? item?.user?.first_name ?? "";
          const lastName = item?.last_name ?? item?.user?.last_name ?? "";
          const name =
            item?.full_name ||
            item?.mentor_name ||
            `${firstName} ${lastName}`.trim() ||
            item?.name ||
            item?.email ||
            item?.user?.email ||
            (id != null ? `Mentor #${id}` : "");

          if (id == null) return null;

          return {
            id: String(id),
            name: String(name),
            email: item?.email ?? item?.user?.email ?? "",
          };
        })
        .filter(Boolean);

      setMentors(normalized);
    } catch (error) {
      setMentors([]);
      console.error("Unable to load mentors:", error);
      toast.error(error?.message || "Unable to load mentors. Check the Admin Mentor API.");
    } finally {
      setMentorsLoading(false);
    }
  }, []);

  const loadCourses = useCallback(async (showSuccess = false) => {
    setLoading(true);

    try {
      const data = await apiRequest(API_URL);

      setCourses(
        Array.isArray(data)
          ? data
          : data?.courses || data?.results || []
      );

      if (showSuccess) {
        toast.success("Courses refreshed successfully.");
      }
    } catch (err) {
      toast.error(err.message || "Unable to load courses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
    loadMentors();
  }, [loadCourses, loadMentors]);

  const categories = useMemo(
    () => [
      ...new Set(
        courses.map((course) => course.category).filter(Boolean)
      ),
    ],
    [courses]
  );

  const filteredCourses = useMemo(() => {
    const term = search.trim().toLowerCase();

    return courses.filter((course) => {
      const searchableFields = [
        course.title,
        course.description,
        course.category,
        course.mentor_name,
      ];

      const matchesSearch =
        !term ||
        searchableFields
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(term)
          );

      return (
        matchesSearch &&
        (statusFilter === "all" ||
          course.status === statusFilter) &&
        (categoryFilter === "all" ||
          course.category === categoryFilter)
      );
    });
  }, [courses, search, statusFilter, categoryFilter]);

  const totalPages = Math.max(
  1,
  Math.ceil(filteredCourses.length / itemsPerPage)
);

const paginatedCourses = useMemo(() => {
  const startIndex = (currentPage - 1) * itemsPerPage;

  return filteredCourses.slice(
    startIndex,
    startIndex + itemsPerPage
  );
}, [filteredCourses, currentPage]);

const startRecord =
  filteredCourses.length === 0
    ? 0
    : (currentPage - 1) * itemsPerPage + 1;

const endRecord = Math.min(
  currentPage * itemsPerPage,
  filteredCourses.length
);

useEffect(() => {
  if (currentPage > totalPages) {
    setCurrentPage(totalPages);
  }
}, [currentPage, totalPages]);

  const stats = {
    total: courses.length,
    published: courses.filter(
      (course) => course.status === "published"
    ).length,
    draft: courses.filter(
      (course) => course.status !== "published"
    ).length,
  };

  function openCreate() {
    setEditingCourse(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  }

  function openEdit(course) {
    setEditingCourse(course);

    setForm({
      title: course.title || "",
      description: course.description || "",
      category: course.category || "",
      mentor:
        course.mentor != null
          ? String(
              typeof course.mentor === "object"
                ? course.mentor.user_id ?? course.mentor.id ?? ""
                : course.mentor
            )
          : "",
      duration: course.duration || "",
      status: course.status || "draft",
      thumbnail: null,
    });

    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditingCourse(null);
    setForm({ ...EMPTY_FORM });
  }

  function updateField(event) {
    const { name, value, files } = event.target;

    setForm((current) => ({
      ...current,
      [name]:
        name === "thumbnail"
          ? files?.[0] || null
          : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const title = form.title.trim();
    const description = form.description.trim();
    const category = form.category.trim();
    const duration = form.duration.trim();

    if (!title || !description || !category || !duration) {
      return;
    }

    setSaving(true);

    try {
      const editing = Boolean(editingCourse);
      const url = editing
        ? `${API_URL}${editingCourse.id}/`
        : API_URL;

      const hasFile =
        typeof File !== "undefined" &&
        form.thumbnail instanceof File;

      let body;
      const headers = {};

      if (hasFile) {
        body = new FormData();

        body.append("title", title);
        body.append("description", description);
        body.append("category", category);
        body.append("duration", duration);
        body.append("status", form.status);
        body.append("thumbnail", form.thumbnail);
        body.append("mentor", form.mentor || "");
      } else {
        body = JSON.stringify({
          title,
          description,
          category,
          mentor: form.mentor === "" ? null : Number(form.mentor),
          duration,
          status: form.status,
        });

        headers["Content-Type"] = "application/json";
      }

      await apiRequest(url, {
        method: editing ? "PATCH" : "POST",
        headers,
        body,
      });

      setModalOpen(false);
      setEditingCourse(null);
      setForm({ ...EMPTY_FORM });

      toast.success(
        editing
          ? "Course updated successfully!"
          : "Course created successfully!"
      );

      await loadCourses();
    } catch (err) {
      toast.error(err.message || "Unable to save course.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCourse() {
    if (!deleteConfirmCourse || deleting) return;

    setDeleting(true);
    try {
      await apiRequest(`${API_URL}${deleteConfirmCourse.id}/`, {
        method: "DELETE",
      });

    toast.success(`"${deleteConfirmCourse.title}" deleted successfully.`,{
        style: {
          background: "#fee2e2",
          color: "#b91c1c",
          border: "1px solid #fca5a5",
        },
      });
      setCourses((current) =>
        current.filter((course) => course.id !== deleteConfirmCourse.id)
      );
      setDeleteConfirmCourse(null);
    } catch (err) {
      toast.error(err.message || "Unable to delete course.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="ac-page admin-courses-page">
      <header className="ac-page-header">
        <div>
          <div className="ac-eyebrow">LEARNING MANAGEMENT</div>
          <h1>Courses</h1>
          <p>Manage course content, mentors, and publication status.</p>
        </div>

        <div className="ac-header-actions">
          <button
            type="button"
            className="ac-button ac-button-secondary"
            onClick={() => loadCourses(true)}
            disabled={loading}
          >
            <FiRefreshCw />
            {loading ? "Loading..." : "Refresh"}
          </button>

          <button
            type="button"
            className="ac-button ac-button-primary"
            onClick={openCreate}
          >
            <FiPlus />
            Create course
          </button>
        </div>
      </header>

      <section className="ac-stats">
        <StatCard
          icon={<FiBookOpen />}
          label="Total courses"
          value={stats.total}
          detail="All records"
        />
        <StatCard
          icon={<FiCheckCircle />}
          label="Published"
          value={stats.published}
          detail="Live courses"
        />
        <StatCard
          icon={<FiFileText />}
          label="Drafts"
          value={stats.draft}
          detail="In preparation"
        />
      </section>

      <section className="ac-panel">
        <div className="ac-toolbar">
          <div className="ac-search">
            <FiSearch />
            <input
              type="search"
              placeholder="Search courses..."
              value={search}
              onChange={(event) => {
  setSearch(event.target.value);
  setCurrentPage(1);
}}
              aria-label="Search courses"
            />
          </div>

          <div className="ac-filters">
            <select
              value={statusFilter}
              onChange={(event) => {
  setStatusFilter(event.target.value);
  setCurrentPage(1);
}}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(event) => {
  setCategoryFilter(event.target.value);
  setCurrentPage(1);
}}
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ac-table-heading">
          <div>
            <h2>Course library</h2>
            <p>
  Showing {startRecord}–{endRecord} of {filteredCourses.length} courses
</p>
          </div>
        </div>

        {loading ? (
          <div className="ac-state">Loading courses…</div>
        ) : filteredCourses.length === 0 ? (
          <div className="ac-empty">
            <div className="ac-empty-icon">
              <FiLayers />
            </div>

            <h3>
              {courses.length
                ? "No matching courses"
                : "Create your first course"}
            </h3>

            <p>
              {courses.length
                ? "Try changing your search or filters."
                : "Add a course to start building the EduTrack learning library."}
            </p>

            {!courses.length && (
              <button
                type="button"
                className="ac-button ac-button-primary"
                onClick={openCreate}
              >
                <FiPlus />
                Create course
              </button>
            )}
          </div>
        ) : (
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Category</th>
                  <th>Mentor</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginatedCourses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      <div className="ac-course-cell">
                        <CourseThumbnail
                          thumbnail={course.thumbnail}
                          title={course.title}
                        />

                        <div className="ac-course-copy">
                          <strong>{course.title}</strong>
                          <span>
                            {course.description || "No description"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>{course.category || "—"}</td>

                    <td>
                      {course.mentor_name ||
                        (course.mentor
                          ? `User #${course.mentor}`
                          : "Unassigned")}
                    </td>

                    <td>
                      <span className="ac-duration">
                        <FiClock />
                        {course.duration || "—"}
                      </span>
                    </td>

                    <td>
                      <StatusBadge status={course.status} />
                    </td>

                    <td>
                      {course.created_at
                        ? new Date(
                            course.created_at
                          ).toLocaleDateString("en-IN")
                        : "—"}
                    </td>

                    <td>
                      <div className="ac-row-actions">
                        <button
                          type="button"
                          className="ac-icon-button"
                          title="Edit course"
                          aria-label={`Edit ${course.title}`}
                          onClick={() => openEdit(course)}
                        >
                          <FiEdit2 />
                        </button>

                        <button
                          type="button"
                          className="ac-icon-button ac-icon-danger"
                          title="Delete course"
                          aria-label={`Delete ${course.title}`}
                          onClick={() => setDeleteConfirmCourse(course)}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ac-pagination">
  <span className="ac-pagination-info">
    Showing {startRecord}–{endRecord} of {filteredCourses.length} courses
  </span>

  <div className="ac-pagination-controls">
    <button
      type="button"
      className="ac-page-btn"
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
          className={`ac-page-btn ${
            currentPage === page ? "active" : ""
          }`}
          onClick={() => setCurrentPage(page)}
          aria-current={currentPage === page ? "page" : undefined}
        >
          {page}
        </button>
      );
    })}

    <button
      type="button"
      className="ac-page-btn"
      disabled={currentPage === totalPages}
      onClick={() => setCurrentPage((page) => page + 1)}
    >
      Next
    </button>
  </div>
</div>
          </div>
        )}
      </section>

      {modalOpen && (
        <div
          className="ac-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              closeModal();
            }
          }}
        >
          <section
            className="ac-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-modal-title"
          >
            <header className="ac-modal-header">
              <div>
                <div className="ac-eyebrow">
                  {editingCourse
                    ? "UPDATE COURSE"
                    : "NEW LEARNING CONTENT"}
                </div>

                <h2 id="course-modal-title">
                  {editingCourse ? "Edit course" : "Create course"}
                </h2>
              </div>

              <button
                type="button"
                className="ac-icon-button"
                onClick={closeModal}
                aria-label="Close dialog"
                disabled={saving}
              >
                <FiX />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="ac-form">
              <label className="ac-field">
                <span>Course title *</span>
                <input
                  name="title"
                  value={form.title}
                  onChange={updateField}
                  required
                  maxLength={200}
                />
              </label>

              <label className="ac-field">
                <span>Description *</span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  required
                  rows={4}
                />
              </label>

              <div className="ac-form-grid">
                <label className="ac-field">
                  <span>Category *</span>
                  <input
                    name="category"
                    value={form.category}
                    onChange={updateField}
                    required
                    maxLength={100}
                  />
                </label>

                <label className="ac-field">
                  <span>Duration *</span>
                  <input
                    name="duration"
                    value={form.duration}
                    onChange={updateField}
                    required
                    maxLength={100}
                    placeholder="e.g. 8 weeks"
                  />
                </label>

                <label className="ac-field">
                  <span>Assign mentor</span>
                  <select
                    name="mentor"
                    value={form.mentor}
                    onChange={updateField}
                    disabled={mentorsLoading}
                  >
                    <option value="">
                      {mentorsLoading ? "Loading mentors..." : "Unassigned"}
                    </option>
                    {mentors.map((mentor) => (
                      <option key={mentor.id} value={mentor.id}>
                        {mentor.name}{mentor.email ? ` (${mentor.email})` : ""}
                      </option>
                    ))}
                  </select>
                  {!mentorsLoading && mentors.length === 0 && (
                    <small className="ac-field-hint">
                      No mentors were returned by the mentor-list API. Check the backend endpoint.
                    </small>
                  )}
                </label>

                <label className="ac-field">
                  <span>Status</span>
                  <select
                    name="status"
                    value={form.status}
                    onChange={updateField}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                        </select>
                </label>
              </div>

              <label className="ac-field">
                <span>Thumbnail image (optional)</span>
                <input
                  name="thumbnail"
                  type="file"
                  accept="image/*"
                  onChange={updateField}
                />
                <small>
                  When editing, choose a new image only if you want
                  to replace the current thumbnail.
                </small>
              </label>

              {editingCourse?.thumbnail && !form.thumbnail && (
                <div className="ac-current-thumbnail">
                  <span>Current thumbnail</span>
                  <CourseThumbnail
                    thumbnail={editingCourse.thumbnail}
                    title={editingCourse.title}
                  />
                </div>
              )}

              <footer className="ac-modal-footer">
                <button
                  type="button"
                  className="ac-button ac-button-secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="ac-button ac-button-primary"
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : editingCourse
                      ? "Save changes"
                      : "Create course"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {deleteConfirmCourse && (
        <div
          className="ac-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) {
              setDeleteConfirmCourse(null);
            }
          }}
        >
          <section
            className="ac-modal ac-delete-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ac-delete-confirm-title"
            aria-describedby="ac-delete-confirm-description"
          >
            <header className="ac-modal-header ac-delete-confirm-header">
              <div className="ac-delete-confirm-icon">
                <FiTrash2 />
              </div>
              <button
                type="button"
                className="ac-icon-button"
                aria-label="Close confirmation"
                onClick={() => setDeleteConfirmCourse(null)}
                disabled={deleting}
              >
                <FiX />
              </button>
            </header>

            <div className="ac-delete-confirm-body">
              <h2 id="ac-delete-confirm-title">Are you sure?</h2>
              <p id="ac-delete-confirm-description">
                Are you sure you want to delete <strong>“{deleteConfirmCourse.title}”</strong>?
                This action cannot be undone.
              </p>
            </div>

            <footer className="ac-modal-footer ac-delete-confirm-footer">
              <button
                type="button"
                className="ac-button ac-button-secondary"
                onClick={() => setDeleteConfirmCourse(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ac-button ac-button-danger"
                onClick={deleteCourse}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}