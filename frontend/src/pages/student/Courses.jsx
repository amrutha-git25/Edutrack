import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Search,
  Play,
  Eye,
  Video,
  Clock3,
  GraduationCap,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import "./Courses.css";
import LearningMaterialPlayer from "./LearningMaterialPlayer";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com/api"
).replace(/\/+$/, "");

const API_PREFIX = "/student/courses/";
function accessToken() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of ["access", "access_token", "accessToken"]) {
      const token = storage.getItem(key);
      if (token) return token;
    }

    for (const key of ["tokens", "authTokens", "auth_tokens"]) {
      const raw = storage.getItem(key);
      if (!raw) continue;

      try {
        const value = JSON.parse(raw);
        if (value?.access) return value.access;
        if (value?.access_token) return value.access_token;
      } catch {
        // Continue to the next key.
      }
    }
  }

  return "";
}

async function apiGet(path, signal) {
  const token = accessToken();

  if (!token) {
    throw new Error("Your login token was not found. Please log in again.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session has expired. Please log in again.");
    }

    if (response.status === 403) {
      throw new Error("This page is available only to student accounts.");
    }

    throw new Error(
      body?.message ||
        body?.detail ||
        `Request failed (HTTP ${response.status}).`
    );
  }

  return body;
}

function resultsFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function displayDate(value) {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function isVideoMaterial(material) {
  const type = String(material.material_type || "").toLowerCase().trim();
  const fileUrl = String(material.file_url || material.file || "").toLowerCase();

  return (
    ["video", "mp4", "webm", "mov", "m4v"].includes(type) ||
    /\.(mp4|webm|mov|m4v)(\?.*)?$/.test(fileUrl)
  );
}

function LoadingCards() {
  return (
    <div className="mc-course-grid" aria-label="Loading courses">
      {[1, 2, 3].map((item) => (
        <div className="mc-skeleton-card" key={item}>
          <div />
          <span />
          <i />
        </div>
      ))}
    </div>
  );
}

function MaterialsModal({
  topic,
  materials,
  loading,
  error,
  onClose,
  onOpenMaterial,
}) {
  return (
    <div
      className="mc-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="mc-material-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mc-material-title"
      >
        <header className="mc-modal-header">
          <div className="mc-modal-heading-icon">
            <BookOpen size={21} />
          </div>

          <div>
            <span className="mc-eyebrow">TOPIC VIDEOS</span>
            <h2 id="mc-material-title">
              {topic?.name || "Course videos"}
            </h2>
          </div>

          <button
            type="button"
            className="mc-icon-button"
            onClick={onClose}
            aria-label="Close topic videos"
          >
            <X size={19} />
          </button>
        </header>

        {loading && (
          <div className="mc-inline-state">
            Loading course videos…
          </div>
        )}

        {error && (
          <div className="mc-alert mc-alert-error" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && materials.length === 0 && (
          <div className="mc-empty-state mc-empty-compact">
            <Video size={28} />
            <h3>No videos uploaded yet</h3>
            <p>
              Videos uploaded by your mentor for this topic will appear here.
            </p>
          </div>
        )}

        {!loading && !error && materials.length > 0 && (
          <div className="mc-material-list">
            {materials.map((material) => (
              <article className="mc-material-row" key={material.id}>
                <span className="mc-material-icon video">
                  <Video size={20} />
                </span>

                <div className="mc-material-copy">
                  <h3>{material.title || "Course video"}</h3>

                  {material.description && <p>{material.description}</p>}

                  {material.created_at && (
                    <small>
                      <Clock3 size={12} /> {displayDate(material.created_at)}
                    </small>
                  )}
                </div>

                {material.file_url ? (
                  <button
                    type="button"
                    className="mc-open-material"
                    onClick={() => onOpenMaterial(material)}
                    aria-label={`Watch ${material.title || "video"}`}
                  >
                    <Play size={16} />
                    <span>Watch video</span>
                  </button>
                ) : (
                  <span className="mc-no-link">Video URL unavailable</span>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState("");
  const [courseSearch, setCourseSearch] = useState("");

  const [currentCoursePage, setCurrentCoursePage] = useState(1);
  const COURSE_PAGE_SIZE = 3;

  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState("");
  const [topicSearch, setTopicSearch] = useState("");

  const [activeTopic, setActiveTopic] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCourses = useCallback(async (signal) => {
    setCoursesLoading(true);
    setCoursesError("");

    try {
      const [coursesResult, progressResult] = await Promise.allSettled([
        apiGet(API_PREFIX, signal),
        apiGet("/courses/student/progress/", signal),
      ]);

      if (coursesResult.status === "rejected") {
        throw coursesResult.reason;
      }

      const enrolledCourses = resultsFrom(coursesResult.value);

      const progressCourses =
        progressResult.status === "fulfilled"
          ? progressResult.value?.data?.courses || []
          : [];

      const progressMap = new Map(
        progressCourses.map((item) => [
          String(item.id),
          Number(item.progress ?? 0),
        ])
      );

      const updatedCourses = enrolledCourses.map((course) => {
        const calculatedProgress = progressMap.get(String(course.id));

        const progress =
          calculatedProgress !== undefined
            ? calculatedProgress
            : Number(
                course.progress_percentage ??
                  course.progress ??
                  0
              );

        return {
          ...course,
          progress: Math.max(0, Math.min(100, progress)),
          progress_percentage: Math.max(0, Math.min(100, progress)),
        };
      });

      setCourses(updatedCourses);
    } catch (error) {
      if (error.name !== "AbortError") {
        const message =
          error.message || "Unable to load enrolled courses.";

        setCoursesError(message);
        toast.error(message);
      }
    } finally {
      if (!signal?.aborted) {
        setCoursesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    loadCourses(controller.signal);

    return () => controller.abort();
  }, [loadCourses, refreshKey]);

  const visibleCourses = useMemo(() => {
    const search = courseSearch.trim().toLowerCase();

    if (!search) return courses;

    return courses.filter((course) =>
      [course.name, course.description, course.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [courses, courseSearch]);

  const totalCoursePages = Math.max(
    1,
    Math.ceil(visibleCourses.length / COURSE_PAGE_SIZE)
  );

  const paginatedCourses = useMemo(() => {
    const startIndex = (currentCoursePage - 1) * COURSE_PAGE_SIZE;

    return visibleCourses.slice(
      startIndex,
      startIndex + COURSE_PAGE_SIZE
    );
  }, [visibleCourses, currentCoursePage]);

  useEffect(() => {
    if (currentCoursePage > totalCoursePages) {
      setCurrentCoursePage(totalCoursePages);
    }
  }, [currentCoursePage, totalCoursePages]);

  const visibleTopics = useMemo(() => {
    const search = topicSearch.trim().toLowerCase();

    if (!search) return topics;

    return topics.filter((topic) =>
      [topic.name, topic.description, topic.course_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [topics, topicSearch]);

  async function openCourse(course) {
    setSelectedCourse(course);
    setTopicSearch("");
    setTopics([]);
    setTopicsError("");
    setTopicsLoading(true);

    try {
      const payload = await apiGet(`${API_PREFIX}${course.id}/topics/`);

      setTopics(resultsFrom(payload));

      toast.success(`Opened ${course.name || "course"} successfully.`);
    } catch (error) {
      const message = error.message || "Unable to load topics.";

      setTopicsError(message);
      toast.error(message);
    } finally {
      setTopicsLoading(false);
    }
  }

  async function openMaterials(topic) {
    if (!selectedCourse) {
      toast.error("Please select a course first.");
      return;
    }

    setActiveTopic(topic);
    setMaterials([]);
    setMaterialsError("");
    setMaterialsLoading(true);

    try {
      const payload = await apiGet(
        `${API_PREFIX}${selectedCourse.id}/topics/${topic.id}/materials/`
      );

      const topicMaterials = resultsFrom(payload);
      const videosOnly = topicMaterials.filter(isVideoMaterial);

      setMaterials(videosOnly);

      toast.success(
        `${videosOnly.length} video${
          videosOnly.length === 1 ? "" : "s"
        } found for ${topic.name || "this topic"}.`
      );
    } catch (error) {
      const message =
        error.message || "Unable to load learning materials.";

      setMaterialsError(message);
      toast.error(message);
    } finally {
      setMaterialsLoading(false);
    }
  }

  function refreshCourses() {
    setRefreshKey((key) => key + 1);
    toast.info("Refreshing your enrolled courses...");
  }

  function backToCourses() {
    setSelectedCourse(null);
    setTopics([]);
    setTopicsError("");
    setTopicSearch("");
    setActiveTopic(null);
    setMaterials([]);
    setMaterialsError("");
  }

  return (
    <main className="my-courses-page">
      <section className="mc-page-hero">
        <div className="mc-hero-copy">
          <span className="mc-eyebrow">
            <GraduationCap size={15} /> MY LEARNING SPACE
          </span>

          <h1>
            {selectedCourse
              ? selectedCourse.name
              : "My Learning Journey"}
          </h1>

          <p>
            {selectedCourse
              ? "Explore course topics and watch the videos shared by your mentor."
              : "Pick up where you left off and keep moving forward, one topic at a time."}
          </p>
        </div>

        <div className="mc-hero-art" aria-hidden="true">
          <BookOpen size={45} />
        </div>
      </section>

      {selectedCourse ? (
        <section className="mc-content-section">
          <div className="mc-section-top">
            <div>
              <span className="mc-eyebrow">COURSE CONTENT</span>
              <h2>Topics & videos</h2>
              <p>
                {selectedCourse.name} · {topics.length}{" "}
                {topics.length === 1 ? "topic" : "topics"}
              </p>
            </div>

            <button
              type="button"
              className="mc-back-button"
              onClick={backToCourses}
            >
              <ArrowLeft size={17} /> Back to courses
            </button>
          </div>

          <label className="mc-search">
            <Search size={18} />

            <input
              type="search"
              value={topicSearch}
              onChange={(event) => setTopicSearch(event.target.value)}
              placeholder="Search topics..."
              aria-label="Search topics"
            />

            {topicSearch && (
              <button
                type="button"
                onClick={() => setTopicSearch("")}
                aria-label="Clear topic search"
              >
                <X size={15} />
              </button>
            )}
          </label>

          {topicsError && (
            <div className="mc-alert mc-alert-error" role="alert">
              <span>{topicsError}</span>

              <button
                type="button"
                onClick={() => openCourse(selectedCourse)}
              >
                Retry
              </button>
            </div>
          )}

          {topicsLoading && (
            <div className="mc-inline-state">Loading course topics…</div>
          )}

          {!topicsLoading && !topicsError && (
            <div className="mc-table-wrap">
              <table className="mc-topics-table">
                <thead>
                  <tr>
                    <th>SNo</th>
                    <th>Course Name</th>
                    <th>Topic</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleTopics.map((topic, index) => (
                    <tr key={topic.id}>
                      <td>{index + 1}</td>

                      <td>{topic.course_name || selectedCourse.name}</td>

                      <td>
                        <div className="mc-topic-name">
                          <span className="mc-topic-icon">
                            <BookOpen size={16} />
                          </span>

                          <span>
                            <strong>{topic.name}</strong>

                            {topic.description && (
                              <small>{topic.description}</small>
                            )}
                          </span>
                        </div>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="mc-eye-button"
                          onClick={() => openMaterials(topic)}
                          aria-label={`View videos for ${topic.name}`}
                          title="View topic videos"
                        >
                          <Eye size={17} />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}

                  {visibleTopics.length === 0 && (
                    <tr>
                      <td colSpan="4">
                        <div className="mc-table-empty">
                          {topicSearch
                            ? "No topics match your search."
                            : "No topics have been added to this course yet."}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="mc-content-section">
          <div className="mc-section-top">
            <div>
              <span className="mc-eyebrow">YOUR ENROLLMENTS</span>
              <h2>Your Enrolled Courses</h2>
              <p>
                {courses.length}{" "}
                {courses.length === 1 ? "course" : "courses"} available in
                your learning journey
              </p>
            </div>

            <button
              type="button"
              className="mc-refresh-button"
              onClick={refreshCourses}
              aria-label="Refresh courses"
              disabled={coursesLoading}
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>

          <label className="mc-search">
            <Search size={18} />

            <input
              type="search"
              value={courseSearch}
              onChange={(event) => {
                setCourseSearch(event.target.value);
                setCurrentCoursePage(1);
              }}
              placeholder="Search your courses..."
              aria-label="Search enrolled courses"
            />

            {courseSearch && (
              <button
                type="button"
                onClick={() => {
                  setCourseSearch("");
                  setCurrentCoursePage(1);
                }}
                aria-label="Clear course search"
              >
                <X size={15} />
              </button>
            )}
          </label>

          {coursesError && (
            <div className="mc-alert mc-alert-error" role="alert">
              <span>{coursesError}</span>

              <button type="button" onClick={refreshCourses}>
                Retry
              </button>
            </div>
          )}

          {coursesLoading && <LoadingCards />}

          {/* COURSE CARDS + PAGINATION */}
          {!coursesLoading &&
            !coursesError &&
            visibleCourses.length > 0 && (
              <>
                <div className="mc-course-grid">
                  {paginatedCourses.map((course, index) => (
                    <article className="mc-course-card" key={course.id}>
                      <div className={`mc-course-image-wrap tone-${index % 4}`}>
                        {course.image_url ? (
                          <img
                            src={course.image_url}
                            alt={`${course.name} course`}
                            className="mc-course-image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="mc-course-image-placeholder">
                            <BookOpen size={40} />
                            <span>EduTrack course</span>
                          </div>
                        )}

                        <span className="mc-course-chip">
                          {course.category || "Enrolled course"}
                        </span>
                      </div>

                      <div className="mc-course-card-body">
                        <div className="mc-course-card-topline">
                          <span className="mc-course-label">MY COURSE</span>

                          {course.progress_percentage !== undefined && (
                            <span className="mc-course-progress">
                              {Math.max(
                                0,
                                Math.min(
                                  100,
                                  Number(course.progress_percentage) || 0
                                )
                              )}
                              % progress
                            </span>
                          )}
                        </div>

                        <h3>{course.name}</h3>

                        {course.description ? (
                          <p>{course.description}</p>
                        ) : (
                          <p className="mc-course-muted">
                            Open the course to explore topics and watch
                            mentor-uploaded videos.
                          </p>
                        )}

                        <div className="mc-course-card-footer">
                          <span className="mc-enrollment-status">
                            <span />
                            {course.enrollment_status || "Enrolled"}
                          </span>

                          <button
                            type="button"
                            className="mc-play-button"
                            onClick={() => openCourse(course)}
                            aria-label={`Open ${course.name}`}
                            title="Open course topics"
                          >
                            <Play size={16} fill="currentColor" />
                            <span>Open course</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {/* PAGINATION */}
                {visibleCourses.length > COURSE_PAGE_SIZE && (
                  <div className="mc-course-pagination">
                    <span className="mc-pagination-info">
                      Showing {(currentCoursePage - 1) * COURSE_PAGE_SIZE + 1}–
                      {Math.min(
                        currentCoursePage * COURSE_PAGE_SIZE,
                        visibleCourses.length
                      )}{" "}
                      of {visibleCourses.length} courses
                    </span>

                    <div className="mc-pagination-controls">
                      <button
                        type="button"
                        className="mc-pagination-button"
                        onClick={() =>
                          setCurrentCoursePage((page) =>
                            Math.max(1, page - 1)
                          )
                        }
                        disabled={currentCoursePage === 1}
                      >
                        Previous
                      </button>

                      <span className="mc-pagination-page">
                        Page {currentCoursePage} of {totalCoursePages}
                      </span>

                      <button
                        type="button"
                        className="mc-pagination-button"
                        onClick={() =>
                          setCurrentCoursePage((page) =>
                            Math.min(totalCoursePages, page + 1)
                          )
                        }
                        disabled={currentCoursePage === totalCoursePages}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

          {!coursesLoading &&
            !coursesError &&
            visibleCourses.length === 0 && (
              <div className="mc-empty-state">
                <div className="mc-empty-icon">
                  <BookOpen size={30} />
                </div>

                <h3>
                  {courseSearch
                    ? "No matching courses"
                    : "No enrolled courses yet"}
                </h3>

                <p>
                  {courseSearch
                    ? "Try a different search term."
                    : "Courses enrolled or assigned to your student account will appear here."}
                </p>

                {courseSearch && (
                  <button
                    type="button"
                    className="mc-back-button"
                    onClick={() => {
                      setCourseSearch("");
                      setCurrentCoursePage(1);
                    }}
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}
        </section>
      )}

      {activeTopic && !selectedMaterial && (
        <MaterialsModal
          topic={activeTopic}
          materials={materials}
          loading={materialsLoading}
          error={materialsError}
          onClose={() => setActiveTopic(null)}
          onOpenMaterial={(material) => {
            setSelectedMaterial(material);
            toast.info("Opening course video...");
          }}
        />
      )}

      {selectedMaterial && (
        <LearningMaterialPlayer
          material={selectedMaterial}
          courseId={selectedCourse?.id}
          onClose={() => {
            setSelectedMaterial(null);
            toast.success("Returned to topic videos.");
          }}
        />
      )}
    </main>
  );
}