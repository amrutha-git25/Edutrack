import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  CirclePlay,
  CheckCircle2,
  Circle,
  Eye,
  FileText,
  GraduationCap,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import "./MyCourses.css";

const API_ORIGIN = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com"
)
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

const API_BASE = `${API_ORIGIN}/api/student/courses/`;

function getAccessToken() {
  const directKeys = ["access", "access_token", "accessToken"];

  for (const key of directKeys) {
    const token =
      localStorage.getItem(key) || sessionStorage.getItem(key);

    if (token) return token;
  }

  for (const storage of [localStorage, sessionStorage]) {
    for (const key of ["tokens", "authTokens", "auth_tokens"]) {
      const raw = storage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (parsed?.access) return parsed.access;
        if (parsed?.access_token) return parsed.access_token;
      } catch {
        // Continue checking other token keys.
      }
    }
  }

  return "";
}

function normalizeApiUrl(url) {
  return String(url).replace(/\/api\/api(?=\/)/g, "/api");
}

async function apiGet(url) {
  const token = getAccessToken();

  if (!token) {
    throw new Error("Please log in to access your learning materials.");
  }

  const response = await fetch(normalizeApiUrl(url), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : {};

  if (!response.ok) {
    throw new Error(
      data.message ||
        data.detail ||
        `Request failed with status ${response.status}.`
    );
  }

  if (data.success === false) {
    throw new Error(data.message || "Unable to load learning materials.");
  }

  return data;
}

async function apiPost(url, payload) {
  const token = getAccessToken();

  if (!token) {
    throw new Error("Please log in again to save your progress.");
  }

  const response = await fetch(normalizeApiUrl(url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : {};

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message ||
        data.detail ||
        `Unable to save progress (${response.status}).`
    );
  }

  return data;
}

function isVideoMaterial(material) {
  const type = String(material?.material_type || material?.type || "").toLowerCase();
  const file = String(
    material?.file_url || material?.supabase_url || material?.file || material?.storage_path || ""
  ).toLowerCase();
  return /video|\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(`${type} ${file}`);
}

function isViewableMaterial(material) {
  const type = String(material?.material_type || material?.type || "").toLowerCase();
  const file = String(
    material?.file_url || material?.supabase_url || material?.file || material?.storage_path || ""
  ).toLowerCase();
  const combined = `${type} ${file}`;
  return Boolean(file) && /video|audio|document|pdf|note|ppt|presentation|word|docx?|xlsx?|text|material|\.(mp4|webm|ogg|mov|m4v|mp3|wav|m4a|pdf|txt|png|jpe?g|gif|webp)(\?|#|$)/i.test(combined);
}

function getList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data?.results)) return data.data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}


// Reusable loading state for courses, topics, and materials.
const LoadingState = () => {
  return (
    <div className="ml-loading-state" role="status" aria-live="polite">
      <LoaderCircle size={32} className="ml-spinner" />
      <p>Loading your learning content...</p>
    </div>
  );
};

// Reusable empty state when a list has no matching records.
const EmptyState = ({ icon, title, message }) => {
  return (
    <div className="ml-empty-state">
      <div className="ml-empty-state-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
};

function MyCourses({ theme = "light" }) {
  const [screen, setScreen] = useState("courses");
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [materials, setMaterials] = useState([]);

  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);

  const [documentPreviewUrl, setDocumentPreviewUrl] = useState("");
  const [documentPreviewLoading, setDocumentPreviewLoading] = useState(false);
  const [documentPreviewError, setDocumentPreviewError] = useState("");

  const [materialStatuses, setMaterialStatuses] = useState({});
  const [savingMaterialId, setSavingMaterialId] = useState(null);

  const readingStartedAtRef = useRef({});

  const [courseSearch, setCourseSearch] = useState("");
  const [currentCoursePage, setCurrentCoursePage] = useState(1);
  const COURSES_PER_PAGE = 3;

  const [topicSearch, setTopicSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const normalizedTheme = String(theme).toLowerCase();
  const themeClass = normalizedTheme.includes("yellow")
    ? "theme-yellow"
    : normalizedTheme.includes("dark")
      ? "theme-dark"
      : "theme-light";

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiGet(API_BASE);
      setCourses(getList(data));
      setCurrentCoursePage(1);
    } catch (err) {
      const message = err.message || "Unable to load your courses.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const openCourse = async (course) => {
    setSelectedCourse(course);
    setSelectedTopic(null);
    setTopics([]);
    setMaterials([]);
    setTopicSearch("");
    setSelectedMaterial(null);
    setScreen("topics");
    setLoading(true);
    setError("");

    try {
      const data = await apiGet(`${API_BASE}${course.id}/topics/`);
      setTopics(getList(data));
      toast.success(`Opened ${course.name || "course"} topics.`);
    } catch (err) {
      const message = err.message || "Unable to load course topics.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const openTopic = async (topic) => {
    if (!selectedCourse) return;

    setSelectedTopic(topic);
    setMaterials([]);
    setSelectedMaterial(null);
    setScreen("materials");
    setLoading(true);
    setError("");

    try {
      const data = await apiGet(
        `${API_BASE}${selectedCourse.id}/topics/${topic.id}/materials/`
      );

      const documentMaterials = getList(data).filter(isViewableMaterial);
      setMaterials(documentMaterials);

      const statusEntries = await Promise.all(
        documentMaterials.map(async (material) => {
          try {
            const progress = await apiGet(
              `${API_ORIGIN}/api/student/learning-activity/${material.id}/`
            );

            const record = progress?.data || progress?.activity || progress;
            return [material.id, Boolean(record?.is_completed)];
          } catch (statusError) {
            console.warn(
              `Could not load progress for material ${material.id}:`,
              statusError
            );
            return [material.id, false];
          }
        })
      );

      setMaterialStatuses((current) => ({
        ...current,
        ...Object.fromEntries(statusEntries),
      }));

      toast.success("Study documents loaded.");
    } catch (err) {
      const message = err.message || "Unable to load topic materials.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };
    const goBack = () => {
    setError("");
    setSelectedMaterial(null);

    if (screen === "materials") {
      setScreen("topics");
      return;
    }

    setScreen("courses");
    setSelectedCourse(null);
    setSelectedTopic(null);
    setTopics([]);
    setMaterials([]);
  };

  const openMaterial = (material) => {
    if (!(material.file_url || material.file)) {
      const message =
        "This learning material does not have a file URL yet.";
      setError(message);
      toast.error(message);
      return;
    }

    setSelectedMaterial(material);
    readingStartedAtRef.current[material.id] = Date.now();
    setError("");
    toast.success(
      "Study document opened. Read it fully, then mark it as done."
    );
  };

  const closeMaterial = () => {
    setSelectedMaterial(null);
    setDocumentPreviewError("");
  };

  useEffect(() => {
    if (!selectedMaterial) {
      setDocumentPreviewUrl("");
      setDocumentPreviewLoading(false);
      setDocumentPreviewError("");
      return undefined;
    }

    let cancelled = false;
    let objectUrl = "";

    const loadPreview = async () => {
      setDocumentPreviewLoading(true);
      setDocumentPreviewError("");
      setDocumentPreviewUrl("");

      try {
        // Supabase-hosted videos should be streamed by the browser directly.
        // Fetching them through the document-preview endpoint can break video playback.
        if (isVideoMaterial(selectedMaterial)) {
          const videoUrl = String(
            selectedMaterial.file_url || selectedMaterial.supabase_url || selectedMaterial.file || ""
          ).trim();
          if (!/^https?:\/\//i.test(videoUrl)) {
            throw new Error("The video URL is missing or is not a valid HTTP(S) URL.");
          }
          if (!cancelled) setDocumentPreviewUrl(videoUrl);
          return;
        }

        const token = getAccessToken();

        if (!token) {
          throw new Error("Please log in again to view this document.");
        }

        const response = await fetch(
          normalizeApiUrl(
            `${API_ORIGIN}/api/courses/materials/${selectedMaterial.id}/preview/`
          ),
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept:
                "application/pdf, text/plain, image/*, application/octet-stream, */*",
            },
          }
        );

        if (!response.ok) {
          let message = `Unable to preview this document (${response.status}).`;

          try {
            const errorData = await response.clone().json();
            message = errorData.message || errorData.detail || message;
          } catch {
            // Response may not be JSON.
          }

          throw new Error(message);
        }

        const blob = await response.blob();

        if (!blob.size) {
          throw new Error("The document is empty or unavailable.");
        }

        const declaredType = (
          response.headers.get("content-type") ||
          blob.type ||
          ""
        )
          .split(";")[0]
          .trim()
          .toLowerCase();

        const fileName = String(
          selectedMaterial.file_name ||
            selectedMaterial.title ||
            selectedMaterial.file_url ||
            selectedMaterial.file ||
            ""
        ).toLowerCase();

        if (
          /\.(docx?|pptx?|xlsx?)(?:$|[?#])/.test(fileName) ||
          /msword|wordprocessingml|presentationml|spreadsheetml/.test(
            declaredType
          )
        ) {
          throw new Error(
            "This Word, PowerPoint, or Excel file needs to be converted to PDF before it can be previewed inside EduTrack. Please upload a PDF version."
          );
        }

        let mimeType = declaredType;

        if (!mimeType || mimeType === "application/octet-stream") {
          if (/\.pdf(?:$|[?#])/.test(fileName)) {
            mimeType = "application/pdf";
          } else if (/\.(txt|md|csv)(?:$|[?#])/.test(fileName)) {
            mimeType = "text/plain";
          } else if (/\.(png|jpe?g|gif|webp)(?:$|[?#])/.test(fileName)) {
            mimeType = "image/*";
          }
        }

        const previewBlob = mimeType
          ? new Blob([blob], { type: mimeType })
          : blob;

        objectUrl = URL.createObjectURL(previewBlob);

        if (!cancelled) {
          setDocumentPreviewUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err.message || "Unable to open this document.";
          setDocumentPreviewError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setDocumentPreviewLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedMaterial]);

  const markMaterialDone = async (material) => {
    if (materialStatuses[material.id]) return;

    const openedAt = readingStartedAtRef.current[material.id];
    const elapsedSeconds = openedAt
      ? Math.floor((Date.now() - openedAt) / 1000)
      : 0;

    if (elapsedSeconds < 30) {
      const remaining = 30 - elapsedSeconds;

      toast.error(
        `Please spend at least 30 seconds reading this document. ${remaining}s remaining.`
      );

      return;
    }

    setSavingMaterialId(material.id);

    try {
      await apiPost(
        `${API_ORIGIN}/api/student/learning-activity/`,
        {
          material_id: material.id,
          course_id: selectedCourse?.id,
          activity_type: "document",
          duration_seconds: elapsedSeconds,
          last_position_seconds: 0,
          media_duration_seconds: 0,
          is_completed: true,
        }
      );

      setMaterialStatuses((current) => ({
        ...current,
        [material.id]: true,
      }));

      toast.success(
        "Document marked as completed. Your progress has been updated."
      );
    } catch (err) {
      toast.error(err.message || "Could not update document progress.");
    } finally {
      setSavingMaterialId(null);
    }
  };

  const filteredCourses = courses.filter((course) => {
    const query = courseSearch.trim().toLowerCase();

    return [
      course.name,
      course.description,
      course.category,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const totalCoursePages = Math.ceil(
    filteredCourses.length / COURSES_PER_PAGE
  );

  const paginatedCourses = filteredCourses.slice(
    (currentCoursePage - 1) * COURSES_PER_PAGE,
    currentCoursePage * COURSES_PER_PAGE
  );

  const filteredTopics = topics.filter((topic) => {
    const query = topicSearch.trim().toLowerCase();

    return [
      topic.name,
      topic.description,
      topic.course_name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const completedTopicDocuments = materials.filter(
    (material) => materialStatuses[material.id]
  ).length;

  const topicDocumentProgress = materials.length
    ? Math.round(
        (completedTopicDocuments / materials.length) * 100
      )
    : 0;

  return (
    <section className={`my-learning-page ${themeClass}`}>
      <header className="ml-header">
        <div className="ml-heading-copy">
          <span className="ml-eyebrow">
            <GraduationCap size={16} />
            STUDENT LEARNING
          </span>

          <h1>
            {screen === "courses"
              ? "My Learning Journey"
              : screen === "topics"
                ? selectedCourse?.name || "Course Topics"
                : selectedTopic?.name || "Learning Materials"}
          </h1>

          <p>
            {screen === "courses"
              ? "Continue learning and explore your enrolled courses."
              : screen === "topics"
                ? "Choose a topic to view its learning resources."
                : "Read notes and study documents shared by your mentor."}
          </p>
        </div>

        {screen !== "courses" && (
          <button
            type="button"
            className="ml-back-button"
            onClick={goBack}
          >
            <ArrowLeft size={17} />
            Back
          </button>
        )}
      </header>

      {screen !== "courses" && (
        <div className="ml-breadcrumb">
          <button
            type="button"
            onClick={() => {
              setScreen("courses");
              setSelectedCourse(null);
              setSelectedTopic(null);
              setSelectedMaterial(null);
              setError("");
            }}
          >
            My Courses
          </button>

          <ChevronRight size={15} />

          {selectedCourse && (
            <>
              {screen === "topics" ? (
                <span>{selectedCourse.name}</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setScreen("topics");
                      setSelectedTopic(null);
                      setSelectedMaterial(null);
                      setError("");
                    }}
                  >
                    {selectedCourse.name}
                  </button>

                  <ChevronRight size={15} />
                  <span>{selectedTopic?.name}</span>
                </>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="ml-alert" role="alert">
          <span>{error}</span>

          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
          {screen === "courses" && (
        <>
          <div className="ml-section-toolbar">
            <div className="ml-section-title">
              <BookOpen size={20} />
              <div>
                <h2>Your Enrolled Courses</h2>
                <p>{courses.length} courses available to you</p>
              </div>
            </div>

            <label className="ml-search">
              <Search size={17} />
              <input
                type="search"
                placeholder="Search courses..."
                value={courseSearch}
                onChange={(event) => {
                  setCourseSearch(event.target.value);
                  setCurrentCoursePage(1);
                }}
              />
            </label>
          </div>

          {loading ? (
            <LoadingState />
          ) : filteredCourses.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={28} />}
              title={
                courses.length === 0
                  ? "No enrolled courses yet"
                  : "No courses found"
              }
              message={
                courses.length === 0
                  ? "Courses assigned to your student account will appear here."
                  : "Try another course name or keyword."
              }
            />
          ) : (
            <>
              <div className="ml-course-grid">
                {paginatedCourses.map((course) => (
                  <article className="ml-course-card" key={course.id}>
                    <div className="ml-course-image">
                      {course.image_url ? (
                        <img
                          src={course.image_url}
                          alt={course.name}
                          loading="lazy"
                        />
                      ) : (
                        <div className="ml-course-image-placeholder">
                          <GraduationCap size={44} />
                        </div>
                      )}

                      <span className="ml-course-category">
                        {course.category || "Course"}
                      </span>
                    </div>

                    <div className="ml-course-body">
                      <h3>{course.name}</h3>

                      <p className="ml-course-description">
                        {course.description ||
                          "Explore topics and resources for this course."}
                      </p>

                      <button
                        type="button"
                        className="ml-primary-button"
                        onClick={() => openCourse(course)}
                      >
                        <CirclePlay size={18} />
                        Explore Course
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              {totalCoursePages > 1 && (
                <div className="ml-course-pagination">
                  <div className="ml-pagination-info">
                    Showing{" "}
                    {(currentCoursePage - 1) * COURSES_PER_PAGE + 1}–
                    {Math.min(
                      currentCoursePage * COURSES_PER_PAGE,
                      filteredCourses.length
                    )}{" "}
                    of {filteredCourses.length} courses
                  </div>

                  <div className="ml-pagination-controls">
                    <button
                      type="button"
                      className="ml-pagination-button"
                      disabled={currentCoursePage === 1}
                      onClick={() =>
                        setCurrentCoursePage((prev) => prev - 1)
                      }
                    >
                      Previous
                    </button>

                    {Array.from(
                      { length: totalCoursePages },
                      (_, index) => index + 1
                    ).map((page) => (
                      <button
                        key={page}
                        type="button"
                        className={`ml-pagination-page ${
                          currentCoursePage === page ? "active" : ""
                        }`}
                        onClick={() => setCurrentCoursePage(page)}
                        aria-current={
                          currentCoursePage === page ? "page" : undefined
                        }
                      >
                        {page}
                      </button>
                    ))}

                    <button
                      type="button"
                      className="ml-pagination-button"
                      disabled={currentCoursePage === totalCoursePages}
                      onClick={() =>
                        setCurrentCoursePage((prev) => prev + 1)
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {screen === "topics" && (
        <>
          <div className="ml-section-toolbar">
            <div className="ml-section-title">
              <BookOpen size={20} />
              <div>
                <h2>Course Topics</h2>
                <p>
                  {topics.length} topics in{" "}
                  {selectedCourse?.name || "this course"}
                </p>
              </div>
            </div>

            <label className="ml-search">
              <Search size={17} />
              <input
                type="search"
                placeholder="Search topics..."
                value={topicSearch}
                onChange={(event) => setTopicSearch(event.target.value)}
              />
            </label>
          </div>

          {loading ? (
            <LoadingState />
          ) : filteredTopics.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={28} />}
              title={
                topics.length === 0
                  ? "No topics available"
                  : "No topics found"
              }
              message={
                topics.length === 0
                  ? "Topics added to this course will appear here."
                  : "Try a different search term."
              }
            />
          ) : (
            <div className="ml-table-wrapper">
              <table className="ml-topics-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Course Name</th>
                    <th>Topic</th>
                    <th>Description</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTopics.map((topic, index) => (
                    <tr key={topic.id}>
                      <td>{index + 1}</td>

                      <td>
                        {topic.course_name || selectedCourse?.name}
                      </td>

                      <td>
                        <div className="ml-topic-name">
                          <span className="ml-topic-icon">
                            <BookOpen size={17} />
                          </span>
                          <strong>{topic.name}</strong>
                        </div>
                      </td>

                      <td>{topic.description || "—"}</td>

                      <td>
                        <button
                          type="button"
                          className="ml-view-button"
                          onClick={() => openTopic(topic)}
                          aria-label={`View materials for ${topic.name}`}
                          title="View learning materials"
                        >
                          <Eye size={17} />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
            {screen === "materials" && (
        <>
          <div className="ml-materials-intro">
            <div className="ml-materials-icon">
              <BookOpen size={23} />
            </div>

            <div>
              <h2>Learning Resources</h2>
              <p>
                Study documents for <strong>{selectedTopic?.name}</strong>
              </p>
            </div>
          </div>

          {!loading && materials.length > 0 && (
            <div className="ml-topic-progress">
              <div className="ml-topic-progress-heading">
                <div>
                  <strong>Document completion</strong>
                  <span>
                    {completedTopicDocuments} of {materials.length} documents
                    completed
                  </span>
                </div>

                <strong>{topicDocumentProgress}%</strong>
              </div>

              <div
                className="ml-progress-track"
                role="progressbar"
                aria-valuenow={topicDocumentProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${topicDocumentProgress}%` }} />
              </div>
            </div>
          )}

          {loading ? (
            <LoadingState />
          ) : materials.length === 0 ? (
            <EmptyState
              icon={<FileText size={28} />}
              title="No learning materials yet"
              message="Videos, notes, PDFs, presentations, and study documents uploaded for this topic will appear here."
            />
          ) : (
            <div className="ml-material-list">
              {materials.map((material) => {
                const isDone = Boolean(materialStatuses[material.id]);
                const isSaving = savingMaterialId === material.id;
                const hasOpened = Boolean(
                  readingStartedAtRef.current[material.id]
                );

                return (
                  <article
                    className={`ml-material-card ${
                      isDone ? "is-complete" : ""
                    }`}
                    key={material.id}
                  >
                    <div className="ml-material-type document">
                      {isVideoMaterial(material) ? <CirclePlay size={22} /> : <FileText size={22} />}
                    </div>

                    <div className="ml-material-details">
                      <h3>{material.title || "Study document"}</h3>

                      <p>
                        {material.description ||
                          "Study document shared by your mentor."}
                      </p>

                      <span className="ml-material-label">
                        {material.material_type || "Document"}
                      </span>

                      <span
                        className={`ml-completion-status ${
                          isDone ? "done" : "not-done"
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Circle size={14} />
                        )}

                        {isDone ? "Done" : "Not done"}
                      </span>
                    </div>

                    <div className="ml-material-actions">
                      <button
                        type="button"
                        className="ml-view-button"
                        onClick={() => openMaterial(material)}
                      >
                        {isVideoMaterial(material) ? <CirclePlay size={16} /> : <Eye size={16} />}
                        {isVideoMaterial(material) ? "Watch" : "Read"}
                      </button>

                      <button
                        type="button"
                        className={`ml-done-button ${
                          isDone ? "completed" : ""
                        }`}
                        onClick={() => markMaterialDone(material)}
                        disabled={isDone || isSaving || !hasOpened}
                        title={
                          isDone
                            ? "Document completed"
                            : hasOpened
                              ? "Mark after reading for at least 30 seconds"
                              : "Open and read this document first"
                        }
                      >
                        {isSaving ? (
                          <LoaderCircle
                            size={16}
                            className="ml-spinner"
                          />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}

                        {isSaving
                          ? "Saving..."
                          : isDone
                            ? "Done"
                            : "Mark as Done"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {selectedMaterial && (
        <div className="ml-fullscreen-viewer">
          <header className="ml-viewer-toolbar">
            <div className="ml-viewer-title">
              <FileText size={21} />

              <div>
                <h2>
                  {selectedMaterial.title || "Learning Material"}
                </h2>
                <span>{isVideoMaterial(selectedMaterial) ? "Video Player" : "Document Reader"}</span>
              </div>
            </div>

            <button
              type="button"
              className="ml-viewer-close"
              onClick={closeMaterial}
              aria-label="Close full-screen viewer"
              title="Close viewer"
            >
              <X size={21} />
              <span>Close</span>
            </button>
          </header>

          <main className="ml-viewer-stage">
            {documentPreviewLoading ? (
              <div className="ml-document-preview-message">
                <LoaderCircle className="ml-spinner" size={30} />
                <p>Preparing your document...</p>
              </div>
            ) : documentPreviewError ? (
              <div
                className="ml-document-preview-message"
                role="alert"
              >
                <FileText size={34} />
                <p>{documentPreviewError}</p>

                <button
                  type="button"
                  className="ml-viewer-close"
                  onClick={closeMaterial}
                >
                  Close viewer
                </button>
              </div>
            ) : documentPreviewUrl ? (
              isVideoMaterial(selectedMaterial) ? (
                <video
                  className="ml-fullscreen-document"
                  src={documentPreviewUrl}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  title={selectedMaterial.title || "Learning video"}
                  onError={() => {
                    const message = "Unable to play this video. Check that the Supabase object is public or its URL is valid, and that the file is a supported MP4/WebM video.";
                    setDocumentPreviewError(message);
                    toast.error(message);
                  }}
                />
              ) : (
                <iframe
                  className="ml-fullscreen-document"
                  src={documentPreviewUrl}
                  title={selectedMaterial.title || "Learning document"}
                  allow="fullscreen"
                />
              )
            ) : null}
          </main>

          <footer className="ml-viewer-footer">
            <span>EduTrack Learning Workspace</span>

            <div className="ml-reader-completion">
              <span>
                {materialStatuses[selectedMaterial.id]
                  ? "Completed"
                  : "After reading, mark this document as done"}
              </span>

              <button
                type="button"
                className={`ml-done-button ${
                  materialStatuses[selectedMaterial.id]
                    ? "completed"
                    : ""
                }`}
                onClick={() => markMaterialDone(selectedMaterial)}
                disabled={
                  Boolean(materialStatuses[selectedMaterial.id]) ||
                  savingMaterialId === selectedMaterial.id
                }
              >
                {savingMaterialId === selectedMaterial.id
                  ? "Saving..."
                  : materialStatuses[selectedMaterial.id]
                    ? "Done"
                    : "Mark as Done"}
              </button>
            </div>
          </footer>
        </div>
      )}
    </section>
  );
}
export default MyCourses;