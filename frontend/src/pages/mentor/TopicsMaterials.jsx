
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FiBookOpen,
  FiFileText,
  FiVideo,
  FiImage,
  FiUploadCloud,
  FiPlus,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiExternalLink,
  FiRefreshCw,
  FiX,
  FiLayers,
  FiFolder,
} from "react-icons/fi";
import "./TopicsMaterials.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"
).replace(/\/$/, "");

const API = `${API_BASE}/mentor/materials`;

function getAccessToken() {
  return (
    localStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    sessionStorage.getItem("access_token") ||
    ""
  );
}

async function apiRequest(path, options = {}) {
  const token = getAccessToken();
  const headers = new Headers(options.headers || {});

  headers.set("Accept", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Do not set Content-Type manually for FormData.
  if (
    options.body !== undefined &&
    !(options.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.detail ||
      payload?.error ||
      (typeof payload === "string" ? payload : "") ||
      `Request failed (${response.status})`;

    throw new Error(message);
  }

  return payload;
}

function getResults(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.courses)) return payload.courses;
  if (Array.isArray(payload?.topics)) return payload.topics;
  if (Array.isArray(payload?.materials)) return payload.materials;
  return [];
}

function getTopicName(topic) {
  return topic?.name || topic?.title || topic?.topic_name || "Untitled topic";
}

function getFileKind(material) {
  const type = String(material?.material_type || "").toLowerCase();
  const filename = String(
    material?.file_name || material?.file_url || material?.title || ""
  ).toLowerCase();

  if (type.includes("video") || /\.(mp4|webm|mov|m4v)$/.test(filename)) {
    return "video";
  }

  if (
    type.includes("image") ||
    /\.(png|jpe?g|webp|gif)$/.test(filename)
  ) {
    return "image";
  }

  return "document";
}

function getFileExtension(material) {
  const source = String(material?.file_name || material?.file_url || material?.title || "");
  const clean = source.split("?")[0].split("#")[0];
  return clean.includes(".") ? clean.split(".").pop().toLowerCase() : "";
}

function getPreviewType(material) {
  const extension = getFileExtension(material);
  const kind = getFileKind(material);

  if (kind === "video") return "video";
  if (kind === "image") return "image";
  if (["mp3", "wav", "ogg", "m4a"].includes(extension)) return "audio";
  if (extension === "pdf") return "pdf";
  if (["txt", "csv"].includes(extension)) return "text";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "ods", "odp", "rtf"].includes(extension)) return "office";
  return "unsupported";
}

function MaterialIcon({ material }) {
  const kind = getFileKind(material);

  if (kind === "video") return <FiVideo />;
  if (kind === "image") return <FiImage />;

  return <FiFileText />;
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="tm-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`tm-modal ${wide ? "tm-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="tm-modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>

          <button
            className="tm-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <FiX />
          </button>
        </header>

        {children}
      </section>
    </div>
  );
}

export default function TopicsMaterials() {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [topics, setTopics] = useState([]);
  const [materials, setMaterials] = useState([]);

  const [selectedTopic, setSelectedTopic] = useState(null);

  const [courseSearch, setCourseSearch] = useState("");
  const [topicSearch, setTopicSearch] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");

  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [saving, setSaving] = useState(false);

  const [topicModal, setTopicModal] = useState(null);
  const [materialModal, setMaterialModal] = useState(null);
  const [previewMaterial, setPreviewMaterial] = useState(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch a protected preview. Office files are converted to PDF by Django
  // at /courses/materials/<id>/preview/ and rendered inside this modal.
  useEffect(() => {
    if (!previewMaterial) {
      setPreviewLoading(false);
      setPreviewError("");
      setPreviewObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      return undefined;
    }

    const previewType = getPreviewType(previewMaterial);
    const needsDocumentEndpoint = ["pdf", "text", "office"].includes(previewType);
    const sourceUrl = needsDocumentEndpoint
      ? `${API_BASE}/courses/materials/${previewMaterial.id}/preview/`
      : previewMaterial.file_url;

    if (!sourceUrl) {
      setPreviewError("The file preview URL is not available.");
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = "";
    setPreviewLoading(true);
    setPreviewError("");

    (async () => {
      try {
        const headers = {};
        const token = getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(sourceUrl, {
          headers,
          signal: controller.signal,
        });
        if (!response.ok) {
          let message = `Unable to load preview (${response.status}).`;
          try {
            const payload = await response.json();
            message = payload.detail || payload.message || message;
          } catch { /* response may be a PDF or other binary */ }
          throw new Error(message);
        }

        const blob = await response.blob();
        const contentType = response.headers.get("content-type") || blob.type;
        const previewBlob = contentType.includes("pdf")
          ? blob
          : new Blob([blob], { type: contentType || "application/pdf" });
        objectUrl = URL.createObjectURL(previewBlob);
        setPreviewObjectUrl(objectUrl);
      } catch (error) {
        if (error.name !== "AbortError") {
          setPreviewError(error.message || "Could not preview this file.");
        }
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewMaterial]);

  const [topicForm, setTopicForm] = useState({
    name: "",
    description: "",
    order: "",
  });

  const [materialForm, setMaterialForm] = useState({
    title: "",
    description: "",
    material_type: "",
    file: null,
  });

  const selectedCourse = useMemo(
    () =>
      courses.find(
        (course) => String(course.id) === String(selectedCourseId)
      ),
    [courses, selectedCourseId]
  );

  const filteredCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase();

    if (!query) return courses;

    return courses.filter((course) =>
      `${course.name || course.title || ""} ${course.category || ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [courses, courseSearch]);

  const filteredTopics = useMemo(() => {
    const query = topicSearch.trim().toLowerCase();

    if (!query) return topics;

    return topics.filter((topic) =>
      `${getTopicName(topic)} ${topic.description || ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [topics, topicSearch]);

  const filteredMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();

    if (!query) return materials;

    return materials.filter((material) =>
      `${material.title || ""} ${material.description || ""} ${
        material.material_type || ""
      } ${material.file_name || ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [materials, materialSearch]);

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);

    try {
      const payload = await apiRequest("/courses/");
      const items = getResults(payload);

      setCourses(items);

      setSelectedCourseId((current) => {
        if (
          current &&
          items.some((course) => String(course.id) === String(current))
        ) {
          return current;
        }

        return items.length ? String(items[0].id) : "";
      });
    } catch (error) {
      toast.error(error.message || "Could not load assigned courses.");
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  const loadTopics = useCallback(async () => {
    if (!selectedCourseId) {
      setTopics([]);
      setSelectedTopic(null);
      setMaterials([]);
      return;
    }

    setLoadingTopics(true);

    try {
      const payload = await apiRequest(
        `/courses/${selectedCourseId}/topics/`
      );

      const items = getResults(payload);
      setTopics(items);

      setSelectedTopic((current) => {
        if (
          current &&
          items.some((topic) => String(topic.id) === String(current.id))
        ) {
          return items.find(
            (topic) => String(topic.id) === String(current.id)
          );
        }

        return null;
      });
    } catch (error) {
      setTopics([]);
      toast.error(error.message || "Could not load topics.");
    } finally {
      setLoadingTopics(false);
    }
  }, [selectedCourseId]);

  const loadMaterials = useCallback(async () => {
    if (!selectedTopic?.id) {
      setMaterials([]);
      return;
    }

    setLoadingMaterials(true);

    try {
      const payload = await apiRequest(
        `/topics/${selectedTopic.id}/materials/`
      );

      setMaterials(getResults(payload));
    } catch (error) {
      setMaterials([]);
      toast.error(error.message || "Could not load materials.");
    } finally {
      setLoadingMaterials(false);
    }
  }, [selectedTopic?.id]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses, refreshKey]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics, refreshKey]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials, refreshKey]);

  function handleRefresh() {
    toast.info("Refreshing course topics and materials...");
    setRefreshKey((key) => key + 1);
  }

  function openCreateTopic() {
    setTopicForm({
      name: "",
      description: "",
      order: String(topics.length + 1),
    });

    setTopicModal({ mode: "create" });
  }

  function openEditTopic(topic) {
    setTopicForm({
      name: getTopicName(topic),
      description: topic.description || "",
      order: String(topic.order ?? ""),
    });

    setTopicModal({ mode: "edit", topic });
  }

  async function submitTopic(event) {
    event.preventDefault();

    if (!selectedCourseId) {
      toast.error("Select a course first.");
      return;
    }

    const name = topicForm.name.trim();

    if (!name) {
      toast.error("Enter a topic name.");
      return;
    }

    setSaving(true);

    try {
      const body = {
        name,
        description: topicForm.description.trim(),
      };

      if (topicForm.order !== "") {
        body.order = Number(topicForm.order);
      }

      if (topicModal.mode === "edit") {
        await apiRequest(`/topics/${topicModal.topic.id}/`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });

        toast.success("Topic updated successfully.");
      } else {
        await apiRequest(`/courses/${selectedCourseId}/topics/`, {
          method: "POST",
          body: JSON.stringify(body),
        });

        toast.success("Topic created successfully.");
      }

      setTopicModal(null);
      await loadTopics();
    } catch (error) {
      toast.error(error.message || "Could not save topic.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTopic(topic) {
    const confirmed = window.confirm(
      `Delete "${getTopicName(topic)}"? Any materials linked to this topic may also be deleted depending on your database relationships.`
    );

    if (!confirmed) return;

    try {
      await apiRequest(`/topics/${topic.id}/`, {
        method: "DELETE",
      });

      if (String(selectedTopic?.id) === String(topic.id)) {
        setSelectedTopic(null);
        setMaterials([]);
      }

      toast.success("Topic deleted successfully.");
      await loadTopics();
    } catch (error) {
      toast.error(error.message || "Could not delete topic.");
    }
  }

  function openCreateMaterial() {
    if (!selectedTopic) {
      toast.error("Select a topic before uploading material.");
      return;
    }

    setMaterialForm({
      title: "",
      description: "",
      material_type: "",
      file: null,
    });

    setMaterialModal({ mode: "create" });
  }

  function openEditMaterial(material) {
    setMaterialForm({
      title: material.title || "",
      description: material.description || "",
      material_type: material.material_type || "",
      file: null,
    });

    setMaterialModal({ mode: "edit", material });
  }

  async function submitMaterial(event) {
    event.preventDefault();

    if (!selectedTopic) {
      toast.error("Select a topic first.");
      return;
    }

    if (materialModal.mode === "create" && !materialForm.file) {
      toast.error("Choose a file to upload.");
      return;
    }

    if (materialForm.file && materialForm.file.size > 100 * 1024 * 1024) {
      toast.error("The selected file exceeds the 100 MB limit.");
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();

      if (materialForm.title.trim()) {
        formData.append("title", materialForm.title.trim());
      }

      formData.append("description", materialForm.description.trim());

      if (materialForm.material_type) {
        formData.append("material_type", materialForm.material_type);
      }

      if (materialForm.file) {
        formData.append("file", materialForm.file);
      }

      if (materialModal.mode === "edit") {
        await apiRequest(`/materials/${materialModal.material.id}/`, {
          method: "PATCH",
          body: formData,
        });

        toast.success("Material updated successfully.");
      } else {
        await apiRequest(`/topics/${selectedTopic.id}/materials/`, {
          method: "POST",
          body: formData,
        });

        toast.success("Material uploaded successfully.");
      }

      setMaterialModal(null);
      await loadMaterials();
      await loadTopics();
    } catch (error) {
      toast.error(error.message || "Could not save material.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMaterial(material) {
    const confirmed = window.confirm(
      `Delete "${material.title || "this material"}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await apiRequest(`/materials/${material.id}/`, {
        method: "DELETE",
      });

      toast.success("Material removed successfully.");
      await loadMaterials();
      await loadTopics();
    } catch (error) {
      toast.error(error.message || "Could not delete material.");
    }
  }

  const topicCount = topics.length;
  const materialCount = materials.length;

  const currentCourseName =
    selectedCourse?.name || selectedCourse?.title || "Selected course";

  return (
    <main className="tm-page">
      <div className="tm-page-inner">
        <header className="tm-page-heading">
          <div className="tm-heading-copy">
            <div className="tm-eyebrow">
              <FiLayers /> MENTOR WORKSPACE
            </div>

            <h1>Topics &amp; Materials</h1>

            <p>
              Organize your course topics and share learning resources with
              your students.
            </p>
          </div>

          <button
            type="button"
            className="tm-button tm-button-secondary"
            onClick={handleRefresh}
            disabled={
              loadingCourses || loadingTopics || loadingMaterials
            }
          >
            <FiRefreshCw
              className={
                loadingCourses || loadingTopics || loadingMaterials
                  ? "tm-spin"
                  : ""
              }
            />
            Refresh
          </button>
        </header>

        <section className="tm-stats-grid">
          <article className="tm-stat-card">
            <div className="tm-stat-icon">
              <FiBookOpen />
            </div>
            <div>
              <span>Assigned courses</span>
              <strong>{loadingCourses ? "—" : courses.length}</strong>
            </div>
          </article>

          <article className="tm-stat-card">
            <div className="tm-stat-icon">
              <FiLayers />
            </div>
            <div>
              <span>Topics in course</span>
              <strong>{loadingTopics ? "—" : topicCount}</strong>
            </div>
          </article>

          <article className="tm-stat-card">
            <div className="tm-stat-icon">
              <FiFileText />
            </div>
            <div>
              <span>Materials in topic</span>
              <strong>{loadingMaterials ? "—" : materialCount}</strong>
            </div>
          </article>
        </section>

        <section className="tm-workspace">
          <aside className="tm-panel tm-course-panel">
            <div className="tm-panel-heading">
              <div>
                <h2>My courses</h2>
                <p>Choose a course to manage</p>
              </div>
              <span className="tm-count-badge">{courses.length}</span>
            </div>

            <label className="tm-search-box">
              <FiSearch />
              <input
                value={courseSearch}
                onChange={(event) => setCourseSearch(event.target.value)}
                placeholder="Search courses..."
                aria-label="Search courses"
              />

              {courseSearch && (
                <button
                  type="button"
                  onClick={() => setCourseSearch("")}
                  aria-label="Clear course search"
                >
                  <FiX />
                </button>
              )}
            </label>

            {loadingCourses ? (
              <div className="tm-loading">
                <span className="tm-loader" />
                Loading courses...
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="tm-empty tm-empty-small">
                <FiFolder />
                <strong>No assigned courses</strong>
                <p>
                  {courseSearch
                    ? "Try another search."
                    : "Courses assigned to your mentor account will appear here."}
                </p>
              </div>
            ) : (
              <div className="tm-course-list">
                {filteredCourses.map((course) => {
                  const active =
                    String(course.id) === String(selectedCourseId);

                  return (
                    <button
                      type="button"
                      key={course.id}
                      className={`tm-course-option ${
                        active ? "is-active" : ""
                      }`}
                      onClick={() => {
                        setSelectedCourseId(String(course.id));
                        setSelectedTopic(null);
                        setMaterials([]);
                      }}
                    >
                      <span className="tm-course-option-icon">
                        <FiBookOpen />
                      </span>

                      <span className="tm-course-option-copy">
                        <strong>
                          {course.name || course.title || "Untitled course"}
                        </strong>
                        <small>
                          {course.category || "Course materials"}
                        </small>
                      </span>

                      <span className="tm-course-option-arrow">›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <section className="tm-panel tm-topics-panel">
            <div className="tm-panel-heading tm-panel-heading-wrap">
              <div>
                <div className="tm-section-kicker">COURSE CONTENT</div>
                <h2>{currentCourseName}</h2>
                <p>Manage the topics for this course.</p>
              </div>

              <button
                type="button"
                className="tm-button tm-button-primary"
                onClick={openCreateTopic}
                disabled={!selectedCourseId}
              >
                <FiPlus /> Add topic
              </button>
            </div>

            {selectedCourse?.description && (
              <p className="tm-course-description">
                {selectedCourse.description}
              </p>
            )}

            <label className="tm-search-box tm-topic-search">
              <FiSearch />
              <input
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
                  <FiX />
                </button>
              )}
            </label>

            {loadingTopics ? (
              <div className="tm-loading">
                <span className="tm-loader" />
                Loading topics...
              </div>
            ) : !selectedCourseId ? (
              <div className="tm-empty">
                <FiBookOpen />
                <strong>Select a course</strong>
                <p>
                  Select an assigned course to see its topics and materials.
                </p>
              </div>
            ) : filteredTopics.length === 0 ? (
              <div className="tm-empty">
                <FiLayers />
                <strong>
                  {topicSearch ? "No matching topics" : "No topics yet"}
                </strong>
                <p>
                  {topicSearch
                    ? "Try a different search term."
                    : "Create your first topic to start organizing course materials."}
                </p>

                {!topicSearch && (
                  <button
                    type="button"
                    className="tm-button tm-button-primary"
                    onClick={openCreateTopic}
                  >
                    <FiPlus /> Create first topic
                  </button>
                )}
              </div>
            ) : (
              <div className="tm-topic-list">
                {filteredTopics.map((topic, index) => {
                  const active =
                    String(selectedTopic?.id) === String(topic.id);

                  return (
                    <article
                      className={`tm-topic-card ${
                        active ? "is-selected" : ""
                      }`}
                      key={topic.id}
                    >
                      <button
                        type="button"
                        className="tm-topic-select"
                        onClick={() => setSelectedTopic(topic)}
                      >
                        <span className="tm-topic-number">
                          {String(topic.order ?? index + 1).padStart(2, "0")}
                        </span>

                        <span className="tm-topic-copy">
                          <strong>{getTopicName(topic)}</strong>
                          <small>
                            {topic.description || "No description added"}
                          </small>
                        </span>

                        <span className="tm-topic-material-count">
                          <FiFileText />
                          {topic.materials_count ?? 0}
                        </span>
                      </button>

                      <div className="tm-topic-actions">
                        <button
                          type="button"
                          className="tm-icon-button"
                          onClick={() => openEditTopic(topic)}
                          aria-label={`Edit ${getTopicName(topic)}`}
                          title="Edit topic"
                        >
                          <FiEdit2 />
                        </button>

                        <button
                          type="button"
                          className="tm-icon-button tm-danger-icon"
                          onClick={() => deleteTopic(topic)}
                          aria-label={`Delete ${getTopicName(topic)}`}
                          title="Delete topic"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        <section className="tm-panel tm-materials-panel">
          <div className="tm-panel-heading tm-panel-heading-wrap">
            <div>
              <div className="tm-section-kicker">LEARNING RESOURCES</div>

              <h2>
                {selectedTopic
                  ? getTopicName(selectedTopic)
                  : "Topic materials"}
              </h2>

              <p>
                {selectedTopic
                  ? "Upload and manage resources for this topic."
                  : "Select a topic above to view its learning resources."}
              </p>
            </div>

            <button
              type="button"
              className="tm-button tm-button-primary"
              onClick={openCreateMaterial}
              disabled={!selectedTopic}
            >
              <FiUploadCloud /> Upload material
            </button>
          </div>

          <label className="tm-search-box tm-material-search">
            <FiSearch />
            <input
              value={materialSearch}
              onChange={(event) => setMaterialSearch(event.target.value)}
              placeholder="Search materials..."
              aria-label="Search materials"
            />

            {materialSearch && (
              <button
                type="button"
                onClick={() => setMaterialSearch("")}
                aria-label="Clear material search"
              >
                <FiX />
              </button>
            )}
          </label>

          {loadingMaterials ? (
            <div className="tm-loading">
              <span className="tm-loader" />
              Loading materials...
            </div>
          ) : !selectedTopic ? (
            <div className="tm-empty tm-empty-horizontal">
              <FiFolder />
              <div>
                <strong>No topic selected</strong>
                <p>
                  Choose a topic in the course content panel to manage its
                  materials.
                </p>
              </div>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="tm-empty">
              <FiUploadCloud />
              <strong>
                {materialSearch
                  ? "No matching materials"
                  : "No materials uploaded"}
              </strong>
              <p>
                {materialSearch
                  ? "Try another search."
                  : "Upload a document, video, audio file, or image for students."}
              </p>

              {!materialSearch && (
                <button
                  type="button"
                  className="tm-button tm-button-primary"
                  onClick={openCreateMaterial}
                >
                  <FiUploadCloud /> Upload first material
                </button>
              )}
            </div>
          ) : (
            <div className="tm-material-list">
              {filteredMaterials.map((material) => (
                <article className="tm-material-card" key={material.id}>
                  <div
                    className={`tm-material-file-icon tm-file-${getFileKind(
                      material
                    )}`}
                  >
                    <MaterialIcon material={material} />
                  </div>

                  <div className="tm-material-info">
                    <strong>
                      {material.title ||
                        material.file_name ||
                        "Learning material"}
                    </strong>

                    <p>
                      {material.description || "No description added"}
                    </p>

                    <div className="tm-material-meta">
                      <span>
                        {material.material_type || getFileKind(material)}
                      </span>

                      {material.file_name && (
                        <span>{material.file_name}</span>
                      )}
                    </div>
                  </div>

                  <div className="tm-material-actions">
                    {material.file_url && (
                      <button
                        type="button"
                        className="tm-icon-button"
                        onClick={() => setPreviewMaterial(material)}
                        title="Preview inside EduTrack"
                        aria-label={`Preview ${material.title || "material"} inside EduTrack`}
                      >
                        <FiExternalLink />
                      </button>
                    )}

                    <button
                      type="button"
                      className="tm-icon-button"
                      onClick={() => openEditMaterial(material)}
                      title="Edit or replace file"
                      aria-label="Edit or replace material"
                    >
                      <FiEdit2 />
                    </button>

                    <button
                      type="button"
                      className="tm-icon-button tm-danger-icon"
                      onClick={() => deleteMaterial(material)}
                      title="Delete material"
                      aria-label="Delete material"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {previewMaterial && (
        <section
          className="tm-fullscreen-preview"
          role="dialog"
          aria-modal="true"
          aria-label={previewMaterial.title || "Learning material preview"}
        >
          <header className="tm-fullscreen-preview-header">
            <div className="tm-fullscreen-preview-heading">
              <span className="tm-fullscreen-preview-icon"><FiFileText /></span>
              <div>
                <h2>{previewMaterial.title || previewMaterial.file_name || "Learning material"}</h2>
                <p>{previewMaterial.file_name || "EduTrack document viewer"}</p>
              </div>
            </div>
            <button
              className="tm-fullscreen-close"
              type="button"
              onClick={() => setPreviewMaterial(null)}
              aria-label="Close full-screen preview"
              title="Close preview"
            >
              <FiX /> <span>Close</span>
            </button>
          </header>
          <div className="tm-preview-body tm-fullscreen-preview-body">
            {(() => {
              const previewType = getPreviewType(previewMaterial);
              const fileUrl = previewMaterial.file_url;

              if (!fileUrl) {
                return <div className="tm-preview-message">The file URL is not available.</div>;
              }

              if (["pdf", "text", "office"].includes(previewType)) {
                if (previewLoading) {
                  return <div className="tm-preview-message">Preparing document preview…</div>;
                }
                if (previewError) {
                  return (
                    <div className="tm-preview-message">
                      <FiFileText />
                      <strong>Document preview could not be opened</strong>
                      <p>{previewError}</p>
                      <p>Check that the Django document-preview endpoint is installed and LibreOffice is available on the backend.</p>
                    </div>
                  );
                }
                if (!previewObjectUrl) {
                  return <div className="tm-preview-message">Preparing document preview…</div>;
                }
                return (
                  <iframe
                    className="tm-document-viewer"
                    src={previewObjectUrl}
                    title={previewMaterial.title || "Document preview"}
                  />
                );
              }

              if (previewType === "video") {
                return (
                  <video className="tm-media-viewer" src={fileUrl} controls playsInline>
                    Your browser does not support embedded video playback.
                  </video>
                );
              }

              if (previewType === "audio") {
                return (
                  <div className="tm-audio-viewer">
                    <FiFileText />
                    <strong>{previewMaterial.title || previewMaterial.file_name || "Audio material"}</strong>
                    <audio src={fileUrl} controls />
                  </div>
                );
              }

              if (previewType === "image") {
                return (
                  <img
                    className="tm-image-viewer"
                    src={fileUrl}
                    alt={previewMaterial.title || "Learning material"}
                  />
                );
              }



              return (
                <div className="tm-preview-message">
                  <FiFileText />
                  <strong>This file type cannot be previewed in the browser.</strong>
                  <p>Upload a PDF version to make it readable inside EduTrack.</p>
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {topicModal && (
        <Modal
          title={
            topicModal.mode === "edit" ? "Edit topic" : "Create topic"
          }
          subtitle={`Course: ${currentCourseName}`}
          onClose={() => !saving && setTopicModal(null)}
        >
          <form className="tm-form" onSubmit={submitTopic}>
            <label className="tm-field">
              <span>
                Topic name <b>*</b>
              </span>

              <input
                autoFocus
                maxLength={200}
                value={topicForm.name}
                onChange={(event) =>
                  setTopicForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="e.g. Introduction to React"
                required
              />
            </label>

            <label className="tm-field">
              <span>Description</span>

              <textarea
                rows={4}
                value={topicForm.description}
                onChange={(event) =>
                  setTopicForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Add learning objectives or instructions..."
              />
            </label>

            <label className="tm-field">
              <span>Display order</span>

              <input
                type="number"
                min="0"
                value={topicForm.order}
                onChange={(event) =>
                  setTopicForm((current) => ({
                    ...current,
                    order: event.target.value,
                  }))
                }
                placeholder="1"
              />
            </label>

            <div className="tm-modal-footer">
              <button
                type="button"
                className="tm-button tm-button-secondary"
                onClick={() => setTopicModal(null)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="tm-button tm-button-primary"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : topicModal.mode === "edit"
                    ? "Save changes"
                    : "Create topic"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {materialModal && (
        <Modal
          title={
            materialModal.mode === "edit"
              ? "Edit material"
              : "Upload material"
          }
          subtitle={`Topic: ${getTopicName(selectedTopic)}`}
          onClose={() => !saving && setMaterialModal(null)}
          wide
        >
          <form className="tm-form" onSubmit={submitMaterial}>
            <label className="tm-field">
              <span>Title</span>

              <input
                autoFocus
                maxLength={255}
                value={materialForm.title}
                onChange={(event) =>
                  setMaterialForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="e.g. Lecture 1 - Introduction"
              />
            </label>

            <label className="tm-field">
              <span>Description</span>

              <textarea
                rows={3}
                value={materialForm.description}
                onChange={(event) =>
                  setMaterialForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Explain what students will learn from this resource..."
              />
            </label>

            <label className="tm-field">
              <span>Material type</span>

              <select
                value={materialForm.material_type}
                onChange={(event) =>
                  setMaterialForm((current) => ({
                    ...current,
                    material_type: event.target.value,
                  }))
                }
              >
                <option value="">Auto / use backend default</option>
                <option value="document">Document</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="image">Image</option>
              </select>
            </label>

            <label className="tm-upload-zone">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp,.rtf,.txt,.csv,.mp4,.webm,.mov,.m4v,.mp3,.wav,.ogg,.png,.jpg,.jpeg,.webp"
                onChange={(event) =>
                  setMaterialForm((current) => ({
                    ...current,
                    file: event.target.files?.[0] || null,
                  }))
                }
              />

              <FiUploadCloud className="tm-upload-icon" />

              <strong>
                {materialForm.file
                  ? materialForm.file.name
                  : materialModal.mode === "edit"
                    ? "Choose a replacement file (optional)"
                    : "Click to choose a file"}
              </strong>

              <span>
                {materialForm.file
                  ? `${(
                      materialForm.file.size /
                      (1024 * 1024)
                    ).toFixed(2)} MB`
                  : "PDF, Word, PowerPoint, Excel, OpenDocument, videos, audio, and images · Max 100 MB"}
              </span>
            </label>

            {materialModal.mode === "edit" && (
              <p className="tm-form-hint">
                Leave the file empty to keep the current upload. Choose a file
                only when replacing it.
              </p>
            )}

            <div className="tm-modal-footer">
              <button
                type="button"
                className="tm-button tm-button-secondary"
                onClick={() => setMaterialModal(null)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="tm-button tm-button-primary"
                disabled={saving}
              >
                <FiUploadCloud />
                {saving
                  ? "Saving..."
                  : materialModal.mode === "edit"
                    ? "Save changes"
                    : "Upload material"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
