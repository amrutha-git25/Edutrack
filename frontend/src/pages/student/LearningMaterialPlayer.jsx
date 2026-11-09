
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
  Maximize2,
  Play,
  RefreshCw,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import "./LearningMaterialPlayer.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com"
)
  .replace(/\/+$/, "")
  .replace(/(?:\/api)+$/i, "");

function getToken() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of ["access", "access_token", "accessToken"]) {
      const value = storage.getItem(key);
      if (value) return value;
    }

    for (const key of ["tokens", "authTokens", "auth_tokens"]) {
      const raw = storage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (parsed?.access) return parsed.access;
        if (parsed?.access_token) return parsed.access_token;
      } catch {
        // Continue checking storage keys.
      }
    }
  }

  return "";
}

async function authenticatedFetch(path, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error("Login session not found. Please log in again.");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;

    try {
      const body = await response.json();
      message = body.message || body.detail || message;
    } catch {
      // Keep the default error.
    }

    throw new Error(message);
  }

  return response;
}

function materialKind(material) {
  const filename = String(
    material.file_name || material.file_url || material.title || ""
  ).toLowerCase();

  const type = String(material.material_type || "").toLowerCase();

  if (
    type === "video" ||
    /\.(mp4|webm|mov|m4v)(\?.*)?$/.test(filename)
  ) {
    return "video";
  }

  if (
    type === "audio" ||
    /\.(mp3|wav|ogg|m4a)(\?.*)?$/.test(filename)
  ) {
    return "audio";
  }

  if (
    type === "image" ||
    /\.(png|jpe?g|webp|gif)(\?.*)?$/.test(filename)
  ) {
    return "image";
  }

  return "document";
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remaining
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export default function LearningMaterialPlayer({
  material,
  courseId,
  onClose,
}) {
  const kind = materialKind(material);
  const videoRef = useRef(null);
  const playerWindowRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const watchedSecondsRef = useRef(0);
  const lastVideoTimeRef = useRef(null);
  const lastSavedAtRef = useRef(0);
  const saveInProgressRef = useRef(false);
  const latestPositionRef = useRef(0);
  const durationRef = useRef(0);
  const objectUrlRef = useRef("");
  const documentTimerRef = useRef(null);
  const documentSecondsRef = useRef(0);

  const [fileUrl, setFileUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedProgress, setSavedProgress] = useState(0);
  const [resumePosition, setResumePosition] = useState(0);
  const [videoPosition, setVideoPosition] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [documentCompleted, setDocumentCompleted] = useState(false);
  const [documentSeconds, setDocumentSeconds] = useState(0);

  const materialId = material?.id;

  const releaseObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }
  }, []);

  const saveActivity = useCallback(
    async ({ completed = false, force = false } = {}) => {
      if (!materialId || saveInProgressRef.current) return;

      const now = Date.now();

      if (!force && now - lastSavedAtRef.current < 9000) return;

      const isVideo = kind === "video";
      const watched = isVideo
        ? Math.floor(watchedSecondsRef.current)
        : Math.floor(documentSecondsRef.current);

      const position = isVideo
        ? Math.floor(latestPositionRef.current)
        : watched;

      const duration = isVideo
        ? Math.floor(durationRef.current)
        : 0;

      if (!completed && watched <= 0) return;

      saveInProgressRef.current = true;
      setSaving(true);

      try {
        await authenticatedFetch("/api/student/learning-activity/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            material_id: materialId,
            course_id: courseId,
            activity_type: kind === "video" ? "video" : "document",
            duration_seconds: watched,
            last_position_seconds: position,
            media_duration_seconds: duration,
            is_completed: completed,
          }),
        });

        lastSavedAtRef.current = now;

        if (completed) {
          setSavedProgress(100);
          toast.success("Learning progress saved successfully.");
        }
      } catch (saveError) {
        console.error("Learning activity save failed:", saveError);
        if (force) toast.error(saveError.message || "Could not save progress.");
      } finally {
        saveInProgressRef.current = false;
        setSaving(false);
      }
    },
    [materialId, courseId, kind]
  );

  // Load saved progress, then load the protected material as a Blob.
  useEffect(() => {
    let cancelled = false;

    async function loadMaterial() {
      setLoading(true);
      setError("");

      try {
        const progressResponse = await authenticatedFetch(
          `/api/student/learning-activity/${materialId}/`
        );

        const progressPayload = await progressResponse.json();

        const record =
          progressPayload?.activity ||
          progressPayload?.data ||
          progressPayload?.progress ||
          progressPayload;

        const position = Number(
          record?.last_position_seconds || 0
        );

        const percentage = Number(
          record?.progress_percentage || 0
        );

        const watched = Number(record?.duration_seconds || 0);

        if (!cancelled) {
          setResumePosition(position);
          setSavedProgress(percentage);
          watchedSecondsRef.current = watched;
          documentSecondsRef.current = watched;
          setDocumentSeconds(watched);
          setDocumentCompleted(Boolean(record?.is_completed));
        }

        const fileResponse = await authenticatedFetch(
          `/api/courses/materials/${materialId}/preview/`,
          {
            headers: {
              Accept: "*/*",
            },
          }
        );

        const blob = await fileResponse.blob();

        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setFileUrl(url);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to open this material.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (materialId) loadMaterial();

    return () => {
      cancelled = true;
      releaseObjectUrl();
    };
  }, [materialId, releaseObjectUrl]);

  // Restore the saved video position after the browser reads its metadata.
  function handleVideoMetadata() {
    const video = videoRef.current;
    if (!video) return;

    const duration = Number.isFinite(video.duration) ? video.duration : 0;

    durationRef.current = duration;
    setVideoDuration(duration);

    if (resumePosition > 0 && resumePosition < duration - 1) {
      video.currentTime = resumePosition;
      latestPositionRef.current = resumePosition;
      setVideoPosition(resumePosition);
    }
  }

  function handleVideoTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;

    const current = video.currentTime || 0;
    const previous = lastVideoTimeRef.current;

    if (
      !video.paused &&
      previous !== null &&
      current >= previous &&
      current - previous <= 2.5
    ) {
      watchedSecondsRef.current += current - previous;
    }

    lastVideoTimeRef.current = current;
    latestPositionRef.current = current;
    durationRef.current = Number.isFinite(video.duration)
      ? video.duration
      : durationRef.current;

    setVideoPosition(current);

    if (Date.now() - lastSavedAtRef.current >= 10000) {
      saveActivity();
    }
  }

  function handleVideoSeeking() {
    const video = videoRef.current;
    if (!video) return;

    // Seeking does not count as watched time.
    lastVideoTimeRef.current = video.currentTime;
    latestPositionRef.current = video.currentTime;
  }

  function handleVideoPlay() {
    setIsPlaying(true);
    lastVideoTimeRef.current = videoRef.current?.currentTime || 0;
  }

  async function handleVideoPause() {
    setIsPlaying(false);

    if (videoRef.current) {
      latestPositionRef.current = videoRef.current.currentTime || 0;
    }

    await saveActivity({ force: true });
  }

  async function handleVideoEnded() {
    setIsPlaying(false);

    if (videoRef.current) {
      latestPositionRef.current = videoRef.current.duration || 0;
    }

    await saveActivity({ completed: true, force: true });
  }

  // Count time spent with a document open in the viewer.
  useEffect(() => {
    if (kind !== "document" || loading || !fileUrl || documentCompleted) {
      return undefined;
    }

    documentTimerRef.current = window.setInterval(() => {
      documentSecondsRef.current += 1;
      setDocumentSeconds(documentSecondsRef.current);

      if (Date.now() - lastSavedAtRef.current >= 15000) {
        saveActivity();
      }
    }, 1000);

    return () => {
      if (documentTimerRef.current) {
        window.clearInterval(documentTimerRef.current);
        documentTimerRef.current = null;
      }
    };
  }, [kind, loading, fileUrl, documentCompleted, saveActivity]);

  useEffect(() => {
    return () => {
      if (kind === "video" && watchedSecondsRef.current > 0) {
        // The pause event normally saves before the player closes.
        // Do not start a new asynchronous request during unmount.
      }
    };
  }, [kind]);

  async function markDocumentCompleted() {
    if (documentSecondsRef.current < 30) {
      toast.warning("Spend at least 30 seconds viewing this document first.");
      return;
    }

    documentSecondsRef.current = Math.max(
      30,
      documentSecondsRef.current
    );

    setDocumentCompleted(true);
    await saveActivity({ completed: true, force: true });
  }

  async function toggleFullscreen() {
    const target = playerWindowRef.current;
    if (!target) return;

    try {
      if (!document.fullscreenElement) {
        await target.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (fullscreenError) {
      console.error("Fullscreen request failed:", fullscreenError);
      toast.error("Your browser could not enter full-screen mode.");
    }
  }

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  async function closePlayer() {
    if (kind === "video") {
      const video = videoRef.current;

      if (video) {
        latestPositionRef.current = video.currentTime || 0;
        video.pause();
      }

      await saveActivity({ force: true });
    } else if (kind === "document" && documentSecondsRef.current > 0) {
      await saveActivity({ force: true });
    }

    releaseObjectUrl();
    onClose?.();
  }

  const percentage =
    videoDuration > 0
      ? Math.min(100, (videoPosition / videoDuration) * 100)
      : savedProgress;

  return (
    <div
      className="lmp-backdrop lmp-fullscreen-backdrop"
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        width: "100vw",
        height: "100vh",
        height: "100dvh",
        padding: 0,
        margin: 0,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
        background: "#070910",
      }}
    >
      <section
        ref={playerWindowRef}
        className="lmp-window lmp-fullscreen-window"
        role="dialog"
        aria-modal="true"
        aria-label={material?.title || "Learning material"}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          maxWidth: "none",
          maxHeight: "none",
          minHeight: 0,
          margin: 0,
          borderRadius: 0,
          overflow: "hidden",
          background: "#0b0e17",
        }}
      >
        <header className="lmp-header">
          <div className="lmp-header-icon">
            {kind === "video" ? (
              <Video size={21} />
            ) : (
              <BookOpen size={21} />
            )}
          </div>

          <div className="lmp-heading">
            <span className="lmp-eyebrow">EDUTRACK LEARNING PLAYER</span>
            <h2>{material?.title || "Learning material"}</h2>
            <p>
              {kind === "video"
                ? "Video lesson"
                : kind === "audio"
                ? "Audio lesson"
                : kind === "image"
                ? "Learning image"
                : "Reading material"}
            </p>
          </div>

          <div className="lmp-header-actions" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {kind === "video" && (
              <button
                type="button"
                className="lmp-fullscreen-button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
                title={isFullscreen ? "Exit full screen" : "Full screen"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  minHeight: 38,
                  padding: "0 12px",
                  border: "1px solid rgba(255,255,255,.18)",
                  borderRadius: 9,
                  background: "#252d3c",
                  color: "#fff",
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 12,
                }}
              >
                <Maximize2 size={17} />
                <span>{isFullscreen ? "Exit full screen" : "Full screen"}</span>
              </button>
            )}
            <button
              type="button"
              className="lmp-close"
              onClick={closePlayer}
              aria-label="Close player"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <div
          className="lmp-content lmp-fullscreen-content"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            padding: kind === "video" ? 0 : undefined,
          }}
        >
          {loading && (
            <div className="lmp-state">
              <LoaderCircle className="lmp-spinner" size={34} />
              <p>Loading your learning material…</p>
            </div>
          )}

          {error && !loading && (
            <div className="lmp-state lmp-error">
              <FileText size={35} />
              <h3>Unable to open material</h3>
              <p>{error}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={15} /> Reload page
              </button>
            </div>
          )}

          {!loading && !error && fileUrl && kind === "video" && (
            <div
              className="lmp-video-area lmp-fullscreen-video-area"
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
                width: "100%",
                padding: 0,
                margin: 0,
                background: "#000",
              }}
            >
              <video
                ref={videoRef}
                className="lmp-video lmp-fullscreen-video"
                src={fileUrl}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  minHeight: 0,
                  maxHeight: "none",
                  flex: 1,
                  objectFit: "contain",
                  background: "#000",
                  borderRadius: 0,
                }}
                controls
                playsInline
                onLoadedMetadata={handleVideoMetadata}
                onTimeUpdate={handleVideoTimeUpdate}
                onSeeking={handleVideoSeeking}
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onEnded={handleVideoEnded}
              >
                Your browser does not support video playback.
              </video>

              <div className="lmp-video-info">
                <span>
                  <Play size={14} />
                  {isPlaying ? "Currently playing" : "Playback paused"}
                </span>
                <span>
                  {formatTime(videoPosition)} / {formatTime(videoDuration)}
                </span>
              </div>

              <div className="lmp-progress-track">
                <div
                  className="lmp-progress-fill"
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <div className="lmp-progress-caption">
                <span>Playback position</span>
                <strong>{Math.round(percentage)}%</strong>
              </div>
            </div>
          )}

          {!loading && !error && fileUrl && kind === "document" && (
            <div className="lmp-document-area">
              <iframe
                title={material?.title || "Document preview"}
                src={fileUrl}
                className="lmp-document-frame"
              />

              <div className="lmp-document-footer">
                <span>
                  <Clock3 size={15} />
                  Viewing time: {formatTime(documentSeconds)}
                </span>

                {documentCompleted ? (
                  <span className="lmp-completed">
                    <CheckCircle2 size={16} /> Completed
                  </span>
                ) : (
                  <button
                    type="button"
                    className="lmp-complete-button"
                    onClick={markDocumentCompleted}
                    disabled={documentSeconds < 30 || saving}
                  >
                    <CheckCircle2 size={16} />
                    Mark as completed
                  </button>
                )}
              </div>
            </div>
          )}

          {!loading && !error && fileUrl && kind === "audio" && (
            <div className="lmp-other-preview">
              <div className="lmp-preview-icon">
                <Play size={34} />
              </div>
              <h3>{material?.title}</h3>
              <audio
                src={fileUrl}
                controls
                onEnded={() => saveActivity({ completed: true, force: true })}
              />
              <p>Audio playback is available in this learning player.</p>
            </div>
          )}

          {!loading && !error && fileUrl && kind === "image" && (
            <div className="lmp-image-area">
              <img src={fileUrl} alt={material?.title || "Learning material"} />
            </div>
          )}
        </div>

        <footer className="lmp-footer">
          <span>
            <BookOpen size={15} />
            Your learning activity is saved to EduTrack.
          </span>

          {saving && (
            <span className="lmp-saving">
              <LoaderCircle size={14} className="lmp-spinner" />
              Saving…
            </span>
          )}

          <button type="button" onClick={closePlayer}>
            <ArrowLeft size={15} /> Back to course videos
          </button>
        </footer>
      </section>
    </div>
  );
}
