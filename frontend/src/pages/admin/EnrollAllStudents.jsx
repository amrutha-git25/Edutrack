import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBookOpen,
  FaCheckCircle,
  FaUsers,
  FaUserPlus,
  FaSyncAlt,
  FaGraduationCap,
  FaTimes,
  FaArrowRight,
  FaShieldAlt,
} from "react-icons/fa";
import { Toaster, toast } from "sonner";
import "./EnrollAllStudents.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com/api"
).replace(/\/+$/, "");

function getToken() {
  return (
    localStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    sessionStorage.getItem("access_token")
  );
}

function unwrapList(payload, keys = []) {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;

  return [];
}

function getCourseName(course) {
  return course?.title || course?.name || `Course ${course?.id}`;
}

function getCourseId(course) {
  return String(course?.id ?? course?.pk ?? "");
}

function getErrorMessage(error, fallback) {
  const data = error?.data;

  if (typeof data?.message === "string") return data.message;
  if (typeof data?.detail === "string") return data.detail;

  if (data && typeof data === "object") {
    for (const value of Object.values(data)) {
      if (typeof value === "string") return value;

      if (Array.isArray(value) && value.length > 0) {
        const firstMessage = value.find(
          (item) => typeof item === "string"
        );

        if (firstMessage) return firstMessage;
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
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

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw { status: response.status, data };
  }

  return data;
}

export default function EnrollAllStudents() {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [search, setSearch] = useState("");

  const selectedCourse = useMemo(
    () =>
      courses.find(
        (course) => getCourseId(course) === selectedCourseId
      ) || null,
    [courses, selectedCourseId]
  );

  const loadCourses = useCallback(async (showSuccessToast = false) => {
    setLoadingCourses(true);

    const toastId = showSuccessToast
      ? toast.loading("Refreshing courses...")
      : null;

    try {
      const payload = await apiRequest("/courses/");
      const list = unwrapList(payload, ["courses"]);

      setCourses(list);

      setSelectedCourseId((current) => {
        if (list.some((course) => getCourseId(course) === current)) {
          return current;
        }

        return list.length ? getCourseId(list[0]) : "";
      });

      if (list.length === 0) {
        if (toastId) {
          toast.dismiss(toastId);
        }

        toast.info("No courses are currently available.");
      } else if (toastId) {
        toast.success(`Courses refreshed successfully. ${list.length} course(s) found.`, {
          id: toastId,
        });
      }
    } catch (err) {
      const message = getErrorMessage(
        err,
        "Could not load courses. Check the backend and your admin login."
      );

      if (toastId) {
        toast.error(message, { id: toastId });
      } else {
        toast.error(message);
      }
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  useEffect(() => {
    loadCourses(false);
  }, [loadCourses]);

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return courses;

    return courses.filter((course) =>
      [
        getCourseName(course),
        course?.category,
        course?.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [courses, search]);

  function handleCourseSelect(course) {
    const id = getCourseId(course);

    if (selectedCourseId === id) {
      toast.info(`${getCourseName(course)} is already selected.`);
      return;
    }

    setSelectedCourseId(id);
    setResult(null);

    toast.success(`${getCourseName(course)} selected successfully.`);
  }

  function openConfirmation() {
    if (loadingCourses) {
      toast.warning("Please wait while courses are loading.");
      return;
    }

    if (!courses.length) {
      toast.error("No courses are available for enrollment.");
      return;
    }

    if (!selectedCourseId || !selectedCourse) {
      toast.warning("Please select a course before continuing.");
      return;
    }

    setConfirmOpen(true);
    toast.info("Review the course details before confirming enrollment.");
  }

  function cancelConfirmation() {
    if (submitting) return;

    setConfirmOpen(false);
    toast.info("Bulk enrollment cancelled. No changes were made.");
  }

  async function handleBulkEnroll() {
    if (submitting) return;

    if (!selectedCourseId || !selectedCourse) {
      toast.error("Please select a valid course before enrolling students.");
      return;
    }

    setSubmitting(true);
    setResult(null);

    const courseName = getCourseName(selectedCourse);
    const toastId = toast.loading(
      `Enrolling eligible students in ${courseName}...`
    );

    try {
      const payload = await apiRequest("/courses/enrollments/bulk/", {
        method: "POST",
        body: JSON.stringify({
          course_id: Number(selectedCourseId),
        }),
      });

      setResult(payload);
      setConfirmOpen(false);

      const enrolledCount = Number(payload?.enrolled_count ?? 0);
      const skippedCount = Number(payload?.skipped_count ?? 0);

      const successMessage =
        payload?.message ||
        `Bulk enrollment completed. ${enrolledCount} new enrollment(s) created.`;

      toast.success(successMessage, {
        id: toastId,
        duration: 5000,
      });

      if (skippedCount > 0) {
        toast.info(
          `${skippedCount} student(s) were skipped because they were already enrolled or were not eligible.`,
          { duration: 5000 }
        );
      }

      if (enrolledCount === 0 && skippedCount === 0) {
        toast.info("Enrollment completed, but the API reported no enrollment changes.");
      }
    } catch (err) {
      const message = getErrorMessage(
        err,
        "Bulk enrollment failed. Please try again."
      );

      toast.error(message, {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const resultCards = result
    ? [
        {
          label: "Active students",
          value: result.total_active_students ?? 0,
          icon: FaUsers,
        },
        {
          label: "New enrollments",
          value: result.enrolled_count ?? 0,
          icon: FaUserPlus,
        },
        {
          label: "Already enrolled / skipped",
          value: result.skipped_count ?? 0,
          icon: FaCheckCircle,
        },
      ]
    : [];

  return (
    <main className="enroll-all-page">
      <Toaster
        position="top-right"
        duration={3500}
        richColors
        closeButton
        visibleToasts={4}
      />

      <header className="enroll-page-heading">
        <div>
          <div className="enroll-eyebrow">
            <FaGraduationCap />
            STUDENT MANAGEMENT
          </div>

          <h1>Enroll All Students</h1>

          <p>
            Enroll every active student into a selected published course
            from one place.
          </p>
        </div>

        <button
          type="button"
          className="enroll-secondary-button"
          onClick={() => loadCourses(true)}
          disabled={loadingCourses || submitting}
        >
          <FaSyncAlt className={loadingCourses ? "enroll-spin" : ""} />
          {loadingCourses ? "Refreshing..." : "Refresh courses"}
        </button>
      </header>

      <section className="enroll-info-strip">
        <div className="enroll-info-icon">
          <FaShieldAlt />
        </div>

        <div>
          <strong>Safe bulk enrollment</strong>
          <p>
            Existing enrollments are skipped. Only active students are
            considered, and this action is intended for administrators.
          </p>
        </div>
      </section>

      <section className="enroll-stats-grid">
        <article className="enroll-stat-card">
          <div className="enroll-stat-icon purple">
            <FaBookOpen />
          </div>

          <div>
            <span>Available courses</span>
            <strong>{loadingCourses ? "—" : courses.length}</strong>
            <small>Returned by the courses API</small>
          </div>
        </article>

        <article className="enroll-stat-card">
          <div className="enroll-stat-icon green">
            <FaUsers />
          </div>

          <div>
            <span>Selected course</span>
            <strong>{selectedCourse ? "1" : "0"}</strong>
            <small>
              {selectedCourse
                ? getCourseName(selectedCourse)
                : "Select a course below"}
            </small>
          </div>
        </article>

        <article className="enroll-stat-card">
          <div className="enroll-stat-icon yellow">
            <FaUserPlus />
          </div>

          <div>
            <span>New enrollments</span>
            <strong>{result?.enrolled_count ?? "—"}</strong>
            <small>
              {result
                ? "From the latest operation"
                : "Appears after bulk enrollment"}
            </small>
          </div>
        </article>
      </section>

      <section className="enroll-workspace">
        <div className="enroll-section-heading">
          <div>
            <h2>Choose a course</h2>
            <p>Select the published course for bulk enrollment.</p>
          </div>

          <span className="enroll-step-label">STEP 01</span>
        </div>

        <div className="enroll-course-toolbar">
          <div className="enroll-search">
            <span aria-hidden="true">⌕</span>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search courses or categories..."
              aria-label="Search courses"
            />
          </div>

          <span className="enroll-course-count">
            {filteredCourses.length} course
            {filteredCourses.length === 1 ? "" : "s"}
          </span>
        </div>

        {loadingCourses ? (
          <div className="enroll-empty-state">
            <span className="enroll-loader" />
            <strong>Loading courses...</strong>
            <p>Getting course information from EduTrack.</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="enroll-empty-state">
            <FaBookOpen />
            <strong>No courses available</strong>
            <p>
              The API returned no courses. Check that courses exist and
              that the logged-in admin can access them.
            </p>

            <button
              type="button"
              className="enroll-secondary-button"
              onClick={() => loadCourses(true)}
              disabled={loadingCourses}
            >
              Try again
            </button>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="enroll-empty-state">
            <FaBookOpen />
            <strong>No matching courses</strong>
            <p>Try a different course name or category.</p>
          </div>
        ) : (
          <div className="enroll-course-grid">
            {filteredCourses.map((course) => {
              const id = getCourseId(course);
              const selected = selectedCourseId === id;

              return (
                <button
                  type="button"
                  key={id}
                  className={`enroll-course-card ${
                    selected ? "selected" : ""
                  }`}
                  onClick={() => handleCourseSelect(course)}
                  aria-pressed={selected}
                  disabled={submitting}
                >
                  <div className="enroll-course-card-top">
                    <div className="enroll-course-symbol">
                      <FaBookOpen />
                    </div>

                    <span
                      className={`enroll-radio ${
                        selected ? "checked" : ""
                      }`}
                    >
                      {selected ? <FaCheckCircle /> : null}
                    </span>
                  </div>

                  <h3>{getCourseName(course)}</h3>

                  <p>{course?.category || "General course"}</p>

                  <div className="enroll-course-card-bottom">
                    <span>{course?.status || "Available"}</span>

                    <span className="enroll-course-arrow">
                      <FaArrowRight />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="enroll-action-panel">
        <div className="enroll-action-copy">
          <div className="enroll-action-icon">
            <FaUsers />
          </div>

          <div>
            <h2>Ready to enroll students?</h2>
            <p>
              {selectedCourse
                ? `Selected course: ${getCourseName(selectedCourse)}`
                : "Choose a course above to continue."}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="enroll-primary-button"
          onClick={openConfirmation}
          disabled={!selectedCourse || loadingCourses || submitting}
        >
          Enroll all students
          <FaArrowRight />
        </button>
      </section>

      {result && (
        <section className="enroll-results">
          <div className="enroll-section-heading">
            <div>
              <h2>Latest enrollment results</h2>
              <p>{result.course_title || "Selected course"}</p>
            </div>

            <span className="enroll-result-badge">
              <FaCheckCircle /> Completed
            </span>
          </div>

          <div className="enroll-result-grid">
            {resultCards.map((card) => {
              const Icon = card.icon;

              return (
                <article className="enroll-result-card" key={card.label}>
                  <Icon />
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {confirmOpen && (
        <div
          className="enroll-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !submitting
            ) {
              cancelConfirmation();
            }
          }}
        >
          <section
            className="enroll-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="enroll-confirm-title"
          >
            <button
              type="button"
              className="enroll-modal-close"
              aria-label="Close confirmation"
              onClick={cancelConfirmation}
              disabled={submitting}
            >
              <FaTimes />
            </button>

            <div className="enroll-confirm-icon">
              <FaUsers />
            </div>

            <h2 id="enroll-confirm-title">
              Confirm bulk enrollment
            </h2>

            <p>
              You are about to enroll all eligible active students in:
            </p>

            <div className="enroll-confirm-course">
              <FaBookOpen />
              <strong>
                {getCourseName(selectedCourse)}
              </strong>
            </div>

            <p className="enroll-confirm-note">
              Students who already have an enrollment will be skipped.
              This action will affect multiple student accounts.
            </p>

            <div className="enroll-modal-actions">
              <button
                type="button"
                className="enroll-secondary-button"
                onClick={cancelConfirmation}
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="enroll-primary-button"
                onClick={handleBulkEnroll}
                disabled={submitting}
              >
                {submitting
                  ? "Enrolling..."
                  : "Confirm enrollment"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
