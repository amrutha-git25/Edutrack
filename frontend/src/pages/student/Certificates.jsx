
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Download,
  ExternalLink,
  Eye,
  FileBadge,
  Search,
  Share2,
  ShieldCheck,
  X,
  RefreshCw,
  CalendarDays,
  BookOpen,
} from "lucide-react";
import "./Certificates.css";
import { toast } from "sonner";
import { useAdminTheme } from "../../context/ThemeContext";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com/api"
).replace(/\/+$/, "");

function getAccessToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    ""
  );
}

async function apiRequest(path, options = {}) {
  const token = getAccessToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;

    try {
      const body = await response.json();
      message = body.message || body.detail || body.error || message;
      if (typeof message !== "string") {
        message = JSON.stringify(message);
      }
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }

    if (response.status === 401) {
      message =
        "Your session has expired or you are not logged in. Please sign in again.";
    }

    throw new Error(message);
  }

  return response;
}

function normalizeCertificateList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
}

function certificateName(certificate) {
  return (
    certificate.course_title ||
    certificate.course?.title ||
    certificate.course_name ||
    certificate.title ||
    "Course Certificate"
  );
}

function studentName(certificate) {
  return (
    certificate.student_name ||
    certificate.student?.name ||
    certificate.student?.full_name ||
    certificate.student?.user?.full_name ||
    certificate.student?.user?.first_name ||
    "Student"
  );
}

function certificateNumber(certificate) {
  return (
    certificate.certificate_number ||
    certificate.certificate_id ||
    (certificate.id ? `ET-${certificate.id}` : "Certificate")
  );
}

function formatDate(value) {
  if (!value) return "Date not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getErrorMessage(error) {
  return error?.message || "Something went wrong. Please try again.";
}

export default function Certificates() {
  const { theme } = useAdminTheme();

  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);
  const [sharingId, setSharingId] = useState(null);

  const loadCertificates = useCallback(async (showSuccessToast = false) => {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest("/learning/certificates/");
      const payload = await response.json();
      const list = normalizeCertificateList(payload);

      setCertificates(list);

      if (showSuccessToast) {
        toast.success("Certificates refreshed successfully.");
      }
    } catch (err) {
      const message = getErrorMessage(err);

      setError(message);
      setCertificates([]);

      toast.error(message, {
        description: "Unable to load your certificates.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCertificates();
  }, [loadCertificates]);

  useEffect(() => {
    if (!selectedCertificate) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedCertificate(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCertificate]);

  const visibleCertificates = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return certificates;

    return certificates.filter((certificate) =>
      [
        certificateName(certificate),
        certificateNumber(certificate),
        certificate.student_name,
        certificate.course_name,
        certificate.course?.title,
        certificate.issued_at,
      ].some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [certificates, search]);

  const openPreview = async (certificate) => {
    setActionError("");
    setSelectedCertificate(certificate);

    if (!certificate?.id) {
      toast.info("Showing the available certificate details.");
      return;
    }

    setPreviewLoading(true);

    try {
      const response = await apiRequest(
        `/learning/certificates/${certificate.id}/`
      );

      const payload = await response.json();

      if (payload?.data) {
        setSelectedCertificate(payload.data);
      }

      toast.success("Certificate preview opened.");
    } catch (err) {
      // Keep the list record available if detail loading fails.
      const message = getErrorMessage(err);

      setActionError(message);

      toast.error(message, {
        description: "Could not load the full certificate details.",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadCertificate = async (certificate) => {
    if (!certificate?.id) {
      const message = "This certificate does not have a valid ID for download.";

      setActionError(message);
      toast.error(message);
      return;
    }

    setActionError("");
    setDownloadingId(certificate.id);

    try {
      const response = await apiRequest(
        `/learning/certificates/${certificate.id}/download/`
      );

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = `EduTrack-Certificate-${certificateNumber(
        certificate
      )}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      toast.success("Certificate downloaded successfully.", {
        description: `${certificateNumber(certificate)} is ready.`,
      });
    } catch (err) {
      const message = getErrorMessage(err);

      setActionError(message);

      toast.error(message, {
        description: "Certificate download failed.",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const shareCertificate = async (certificate) => {
    setActionError("");
    setSharingId(certificate.id);

    const shareUrl = `${window.location.origin}${window.location.pathname}?certificate=${encodeURIComponent(
      certificate.id ?? certificateNumber(certificate)
    )}`;

    const shareData = {
      title: `${certificateName(certificate)} — EduTrack Certificate`,
      text: `Certificate earned by ${studentName(
        certificate
      )}: ${certificateName(
        certificate
      )}. Certificate number: ${certificateNumber(certificate)}.`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast.success("Certificate shared successfully.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          `${shareData.text}\n${shareUrl}`
        );

        setActionError("Certificate details and link copied to clipboard.");
        toast.success("Certificate link copied to clipboard.");
      } else {
        window.prompt("Copy this certificate link:", shareUrl);
        toast.info("Use the prompt to copy your certificate link.");
      }
    } catch (err) {
      // Closing the native share dialog is not an error.
      if (err?.name !== "AbortError") {
        const message =
          "Unable to share this certificate from this browser.";

        setActionError(message);
        toast.error(message);
      }
    } finally {
      setSharingId(null);
    }
  };

  // Accept dark, theme-dark, or dark-theme values from the theme provider.
  const rawTheme = String(theme || "light").trim().toLowerCase();

  const normalizedTheme = rawTheme
    .replace(/^theme-/, "")
    .replace(/-theme$/, "")
    .replace(/\s+theme$/, "")
    .replace(/\s+/g, "-");

  const themeName = ["light", "dark", "yellow"].includes(normalizedTheme)
    ? normalizedTheme
    : "light";

  const earnedCount = certificates.length;

  const latestCertificate = certificates.reduce((latest, item) => {
    if (!latest) return item;

    return new Date(item.issued_at || 0) >
      new Date(latest.issued_at || 0)
      ? item
      : latest;
  }, null);

  return (
    <main className={`student-certificates theme-${themeName}`}>
      <header className="certificates-hero">
        <div className="certificates-hero-copy">
          <div className="certificates-eyebrow">
            <Award size={15} />
            STUDENT ACHIEVEMENTS
          </div>

          <h1>My Certificates</h1>

          <p>
            Your learning milestones, achievements, and course credentials in
            one place.
          </p>
        </div>

        <div className="certificates-hero-art" aria-hidden="true">
          <div className="certificate-art-ring ring-one" />
          <div className="certificate-art-ring ring-two" />

          <div className="certificate-art-medal">
            <Award size={42} strokeWidth={1.5} />
          </div>

          <span className="certificate-art-spark spark-one">✦</span>
          <span className="certificate-art-spark spark-two">✧</span>
        </div>
      </header>

      <section
        className="certificates-stat-grid"
        aria-label="Certificate summary"
      >
        <article className="certificates-stat-card">
          <span className="certificates-stat-icon">
            <Award size={20} />
          </span>

          <div>
            <span className="certificates-stat-label">
              Certificates earned
            </span>
            <strong>{loading ? "—" : earnedCount}</strong>
            <small>Achievements unlocked</small>
          </div>
        </article>

        <article className="certificates-stat-card">
          <span className="certificates-stat-icon">
            <ShieldCheck size={20} />
          </span>

          <div>
            <span className="certificates-stat-label">
              Verified credentials
            </span>
            <strong>{loading ? "—" : earnedCount}</strong>
            <small>Issued through EduTrack</small>
          </div>
        </article>

        <article className="certificates-stat-card certificates-latest-stat">
          <span className="certificates-stat-icon">
            <CalendarDays size={20} />
          </span>

          <div>
            <span className="certificates-stat-label">
              Latest achievement
            </span>
            <strong>
              {loading
                ? "—"
                : latestCertificate
                  ? formatDate(latestCertificate.issued_at)
                  : "—"}
            </strong>
            <small>
              {latestCertificate
                ? certificateName(latestCertificate)
                : "Keep learning to earn your first"}
            </small>
          </div>
        </article>
      </section>

      <section className="certificates-content-panel">
        <div className="certificates-section-heading">
          <div>
            <h2>Your credentials</h2>
            <p>
              Preview, download, or share a certificate whenever you need it.
            </p>
          </div>

          <button
            type="button"
            className="certificates-refresh-button"
            onClick={() => loadCertificates(true)}
            disabled={loading}
            aria-label="Refresh certificates"
          >
            <RefreshCw
              size={16}
              className={loading ? "certificates-spinning" : ""}
            />
            Refresh
          </button>
        </div>

        <div className="certificates-toolbar">
          <label className="certificates-search">
            <Search size={17} />

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by course or certificate number..."
              aria-label="Search certificates"
            />
          </label>

          <span className="certificates-result-count">
            {loading
              ? "Loading…"
              : `${visibleCertificates.length} ${
                  visibleCertificates.length === 1
                    ? "certificate"
                    : "certificates"
                }`}
          </span>
        </div>

        {error && (
          <div className="certificates-alert" role="alert">
            <div>
              <strong>Certificates couldn't be loaded</strong>
              <p>{error}</p>
            </div>

            <button
              type="button"
              onClick={() => loadCertificates(true)}
            >
              Try again
            </button>
          </div>
        )}

        {actionError && (
          <div className="certificates-inline-message" role="status">
            <span>{actionError}</span>

            <button
              type="button"
              onClick={() => setActionError("")}
              aria-label="Dismiss message"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="certificates-state">
            <span className="certificates-loader" />
            <strong>Loading your certificates</strong>
            <p>Checking your earned credentials…</p>
          </div>
        ) : !error && visibleCertificates.length === 0 ? (
          <div className="certificates-state">
            <div className="certificates-empty-icon">
              <FileBadge size={30} />
            </div>

            <strong>
              {search
                ? "No matching certificates"
                : "Your achievements start here"}
            </strong>

            <p>
              {search
                ? "Try another course name or certificate number."
                : "Certificates issued for your completed learning will appear here."}
            </p>

            {search && (
              <button
                type="button"
                className="certificates-secondary-button"
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="certificates-grid">
            {visibleCertificates.map((certificate) => (
              <article
                className="certificate-card"
                key={certificate.id ?? certificateNumber(certificate)}
              >
                <div className="certificate-card-art">
                  <div className="certificate-paper">
                    <div className="certificate-paper-inner">
                      <span className="certificate-paper-brand">
                        EDUTRACK
                      </span>

                      <Award
                        size={30}
                        className="certificate-paper-award"
                      />

                      <span className="certificate-paper-kicker">
                        CERTIFICATE OF COMPLETION
                      </span>

                      <span className="certificate-paper-rule" />

                      <strong>{certificateName(certificate)}</strong>

                      <span className="certificate-paper-recipient">
                        Presented to {studentName(certificate)}
                      </span>

                      <span className="certificate-paper-date">
                        {formatDate(certificate.issued_at)}
                      </span>
                    </div>
                  </div>

                  <span className="certificate-earned-chip">
                    <ShieldCheck size={13} />
                    Earned
                  </span>
                </div>

                <div className="certificate-card-body">
                  <div className="certificate-card-title-row">
                    <div className="certificate-card-course-icon">
                      <BookOpen size={19} />
                    </div>

                    <div className="certificate-card-title">
                      <h3>{certificateName(certificate)}</h3>
                      <p>Certificate of completion</p>
                    </div>
                  </div>

                  <div className="certificate-meta">
                    <div>
                      <span>Issued on</span>
                      <strong>
                        {formatDate(certificate.issued_at)}
                      </strong>
                    </div>

                    <div>
                      <span>Certificate ID</span>
                      <strong title={certificateNumber(certificate)}>
                        {certificateNumber(certificate)}
                      </strong>
                    </div>
                  </div>

                  <div className="certificate-card-actions">
                    <button
                      type="button"
                      className="certificate-action-primary"
                      onClick={() => openPreview(certificate)}
                    >
                      <Eye size={16} />
                      Preview
                    </button>

                  </div>

                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedCertificate && (
        <div
          className="certificate-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedCertificate(null);
            }
          }}
        >
          <section
            className="certificate-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="certificate-preview-title"
          >
            <header className="certificate-modal-header">
              <div>
                <span className="certificate-modal-kicker">
                  <ShieldCheck size={14} />
                  OFFICIAL CREDENTIAL
                </span>

                <h2 id="certificate-preview-title">
                  Certificate preview
                </h2>
              </div>

              <button
                type="button"
                className="certificate-modal-close"
                onClick={() => setSelectedCertificate(null)}
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </header>

            {previewLoading && (
              <p className="certificate-preview-loading">
                Loading certificate details…
              </p>
            )}

            <div className="certificate-preview-paper">
              <div className="certificate-preview-border">
                <div className="certificate-preview-brand">
                  <Award size={24} />
                  EDUTRACK
                </div>

                <p className="certificate-preview-overline">
                  CERTIFICATE OF COMPLETION
                </p>

                <h3>This certificate is proudly presented to</h3>

                <div className="certificate-preview-student">
                  {studentName(selectedCertificate)}
                </div>

                <p className="certificate-preview-description">
                  In recognition of successfully completing the learning
                  course
                </p>

                <h4>{certificateName(selectedCertificate)}</h4>

                <div className="certificate-preview-footer">
                  <div>
                    <span>DATE ISSUED</span>
                    <strong>
                      {formatDate(selectedCertificate.issued_at)}
                    </strong>
                  </div>

                  <div className="certificate-preview-seal">
                    <ShieldCheck size={23} />
                    <span>VERIFIED</span>
                  </div>

                  <div>
                    <span>CERTIFICATE ID</span>
                    <strong>
                      {certificateNumber(selectedCertificate)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="certificate-modal-actions">
              <button
                type="button"
                className="certificate-action-primary"
                onClick={() => downloadCertificate(selectedCertificate)}
                disabled={downloadingId === selectedCertificate.id}
              >
                <Download size={16} />
                {downloadingId === selectedCertificate.id
                  ? "Preparing PDF…"
                  : "Download PDF"}
              </button>

              <button
                type="button"
                className="certificates-secondary-button"
                onClick={() => shareCertificate(selectedCertificate)}
                disabled={sharingId === selectedCertificate.id}
              >
                <Share2 size={16} />
                Share
              </button>

              <button
                type="button"
                className="certificates-secondary-button"
                onClick={() => setSelectedCertificate(null)}
              >
                Close
              </button>
            </div>

            <p className="certificate-preview-note">
              <ExternalLink size={13} />
              Use Download PDF for the official certificate file.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
