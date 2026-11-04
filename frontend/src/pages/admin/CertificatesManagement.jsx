
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Toaster, toast } from "sonner";
import {
  Award,
  BookOpen,
  Download,
  FileCheck2,
  GraduationCap,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import "./CertificatesManagement.css";

// .env can contain either the backend origin or the origin ending in /api.
// The request paths below already start with /api, so normalize the base URL.
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
)
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token =
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("access");

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

function getPayload(response) {
  const body = response?.data;

  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.results)) return body.results;

  return [];
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

function displayStudentName(student) {
  return (
    student?.name ||
    student?.student_name ||
    student?.user?.full_name ||
    [student?.user?.first_name, student?.user?.last_name]
      .filter(Boolean)
      .join(" ") ||
    student?.email ||
    `Student #${student?.id}`
  );
}

function displayCourseName(course) {
  return course?.title || course?.name || `Course #${course?.id}`;
}

function getErrorMessage(error) {
  const data = error?.response?.data;

  if (typeof data?.message === "string") return data.message;
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.error === "string") return data.error;

  if (data && typeof data === "object") {
    const firstValue = Object.values(data)[0];

    if (Array.isArray(firstValue)) {
      return String(firstValue[0] || "Please check the submitted data.");
    }

    if (typeof firstValue === "string") return firstValue;
  }

  if (error?.response?.status === 401) {
    return "Your session may have expired. Please log in again.";
  }

  if (error?.response?.status === 403) {
    return "Admin access is required for this action.";
  }

  if (error?.response?.status === 404) {
    return "The requested API endpoint or record was not found.";
  }

  if (!error?.response) {
    return "Unable to connect to Django. Check that the backend is running.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

export default function CertificatesManagement() {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [analytics, setAnalytics] = useState([]);

  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;

  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = useCallback(async (showToast = false) => {
    setLoading(true);
    setError("");

    const toastId = "certificates-refresh";

    if (showToast) {
      toast.loading("Refreshing certificate data...", {
        id: toastId,
      });
    }

    try {
      const results = await Promise.allSettled([
        api.get("/api/learning/certificates/students/"),
        api.get("/api/courses/"),
        api.get("/api/learning/certificates/"),
        api.get("/api/reports/admin/certificates/"),
      ]);

      const [
        studentsResult,
        coursesResult,
        certificatesResult,
        analyticsResult,
      ] = results;

      const failures = [];

      if (studentsResult.status === "fulfilled") {
        setStudents(getPayload(studentsResult.value));
      } else {
        setStudents([]);
        failures.push(
          `Students: ${getErrorMessage(studentsResult.reason)}`
        );
      }

      if (coursesResult.status === "fulfilled") {
        setCourses(getPayload(coursesResult.value));
      } else {
        setCourses([]);
        failures.push(
          `Courses: ${getErrorMessage(coursesResult.reason)}`
        );
      }

      if (certificatesResult.status === "fulfilled") {
        setCertificates(getPayload(certificatesResult.value));
      } else {
        setCertificates([]);
        failures.push(
          `Certificates: ${getErrorMessage(certificatesResult.reason)}`
        );
      }

      if (analyticsResult.status === "fulfilled") {
        setAnalytics(getPayload(analyticsResult.value));
      } else {
        setAnalytics([]);
        failures.push(
          `Analytics: ${getErrorMessage(analyticsResult.reason)}`
        );
      }

      if (failures.length > 0) {
        const message = failures.join(" ");
        setError(message);

        if (showToast) {
          toast.warning(
            "Some certificate data could not be loaded. Check the error message.",
            { id: toastId }
          );
        }
      } else if (showToast) {
        toast.success("Certificate data refreshed successfully.", {
          id: toastId,
        });
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message, {
        id: showToast ? toastId : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCertificates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return certificates;

    return certificates.filter((certificate) => {
      const student = displayStudentName({
        name: certificate.student_name,
        id: certificate.student,
      });

      const course = certificate.course_title || "";
      const certificateNumber = certificate.certificate_number || "";
      const pin = certificate.student_pin || "";

      return [student, course, certificateNumber, pin].some(
        (value) => String(value).toLowerCase().includes(query)
      );
    });
  }, [certificates, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredCertificates.length / itemsPerPage));
  const paginatedCertificates = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCertificates.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCertificates, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const totalCertificates = certificates.length;

  const totalStudents = new Set(
    certificates.map((certificate) => certificate.student)
  ).size;

  const totalCourses = new Set(
    certificates.map((certificate) => certificate.course)
  ).size;

  const issueCertificate = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!selectedStudent || !selectedCourse) {
      const message = "Select both a student and a course.";
      setError(message);
      toast.error(message);
      return;
    }

    const alreadyIssued = certificates.some(
      (certificate) =>
        String(certificate.student) === String(selectedStudent) &&
        String(certificate.course) === String(selectedCourse)
    );

    if (alreadyIssued) {
      const message =
        "This student already has a certificate for the selected course.";

      setError(message);
      toast.warning(message);
      return;
    }

    setIssuing(true);

    const toastId = toast.loading("Issuing certificate...");

    try {
      const response = await api.post(
        "/api/learning/certificates/",
        {
          student: Number(selectedStudent),
          course: Number(selectedCourse),
        }
      );

      const message =
        response.data?.message || "Certificate issued successfully.";

      setSuccess(message);
      toast.success(message, { id: toastId });

      setSelectedStudent("");
      setSelectedCourse("");

      await loadData();
    } catch (err) {
      const message = getErrorMessage(err);

      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setIssuing(false);
    }
  };

  const downloadCertificate = async (certificate) => {
    setError("");
    setSuccess("");
    setDownloadingId(certificate.id);

    const toastId = toast.loading("Preparing certificate download...");

    try {
      const response = await api.get(
        `/api/learning/certificates/${certificate.id}/download/`,
        { responseType: "blob" }
      );

      const blobUrl = window.URL.createObjectURL(
        new Blob([response.data], {
          type: "application/pdf",
        })
      );

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `EduTrack-Certificate-${certificate.id}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(blobUrl);

      setSuccess("Certificate downloaded successfully.");

      toast.success("Certificate downloaded successfully.", {
        id: toastId,
      });
    } catch (err) {
      let message;

      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);

          message =
            parsed.message ||
            parsed.detail ||
            parsed.error ||
            "Download failed.";
        } catch {
          message = "Unable to download this certificate.";
        }
      } else {
        message = getErrorMessage(err);
      }

      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="certificates-page">
      <Toaster
        position="top-right"
        richColors
        closeButton
        duration={3500}
      />

      <header className="certificates-header">
        <div>
          <div className="certificates-eyebrow">
            <ShieldCheck size={15} />
            ADMINISTRATION
          </div>

          <h1>Certificate Management</h1>

          <p>
            Issue certificates to students and track course-wise achievements.
          </p>
        </div>

        <button
          type="button"
          className="certificate-refresh-btn"
          onClick={() => loadData(true)}
          disabled={loading}
        >
          <RefreshCw
            size={17}
            className={loading ? "certificate-spin" : ""}
          />
          Refresh
        </button>
      </header>

      {error && (
        <div
          className="certificate-alert certificate-alert-error"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div
          className="certificate-alert certificate-alert-success"
          role="status"
        >
          <span>{success}</span>
          <button
            type="button"
            onClick={() => setSuccess("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <section className="certificate-stats">
        <article className="certificate-stat-card">
          <div className="certificate-stat-icon purple">
            <Award size={22} />
          </div>
          <div>
            <span>Total certificates</span>
            <strong>{totalCertificates}</strong>
            <small>Issued by EduTrack</small>
          </div>
        </article>

        <article className="certificate-stat-card">
          <div className="certificate-stat-icon blue">
            <Users size={22} />
          </div>
          <div>
            <span>Students certified</span>
            <strong>{totalStudents}</strong>
            <small>Unique students</small>
          </div>
        </article>

        <article className="certificate-stat-card">
          <div className="certificate-stat-icon green">
            <BookOpen size={22} />
          </div>
          <div>
            <span>Courses represented</span>
            <strong>{totalCourses}</strong>
            <small>With certificates issued</small>
          </div>
        </article>
      </section>

      <section className="certificate-panel">
        <div className="certificate-panel-heading">
          <div className="certificate-heading-icon">
            <FileCheck2 size={21} />
          </div>

          <div>
            <h2>Issue a certificate</h2>
            <p>Select a student and the course they completed.</p>
          </div>
        </div>

        <form
          className="certificate-issue-form"
          onSubmit={issueCertificate}
        >
          <div className="certificate-field">
            <label htmlFor="certificate-student">Select student</label>
            <select
              id="certificate-student"
              value={selectedStudent}
              onChange={(event) =>
                setSelectedStudent(event.target.value)
              }
              required
            >
              <option value="">Choose a student</option>

              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {displayStudentName(student)}
                  {student.pin_number ? ` · ${student.pin_number}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="certificate-field">
            <label htmlFor="certificate-course">Select course</label>
            <select
              id="certificate-course"
              value={selectedCourse}
              onChange={(event) =>
                setSelectedCourse(event.target.value)
              }
              required
            >
              <option value="">Choose a course</option>

              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {displayCourseName(course)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="certificate-issue-btn"
            disabled={issuing || loading}
          >
            {issuing ? (
              <>
                <LoaderCircle
                  size={18}
                  className="certificate-spin"
                />
                Issuing...
              </>
            ) : (
              <>
                <Award size={18} />
                Issue Certificate
              </>
            )}
          </button>
        </form>

        <p className="certificate-form-note">
          <ShieldCheck size={15} />
          Certificates are issued through the authenticated Admin API.
        </p>
      </section>

      <section className="certificate-panel">
        <div className="certificate-panel-heading">
          <div className="certificate-heading-icon">
            <GraduationCap size={21} />
          </div>

          <div>
            <h2>Certificates by course</h2>
            <p>Number of certificates issued for each course.</p>
          </div>
        </div>

        {analytics.length === 0 ? (
          <div className="certificate-empty-chart">
            {loading
              ? "Loading certificate analytics..."
              : "No certificate analytics available yet."}
          </div>
        ) : (
          <div className="certificate-chart">
            {analytics.map((item) => {
              const maximum = Math.max(
                ...analytics.map(
                  (row) => Number(row.certificates_issued) || 0
                ),
                1
              );

              const count = Number(item.certificates_issued) || 0;
              const width = `${(count / maximum) * 100}%`;

              return (
                <div
                  className="certificate-chart-row"
                  key={item.course_id}
                >
                  <div className="certificate-chart-label">
                    <span>{item.course_title}</span>
                    <strong>{count}</strong>
                  </div>

                  <div
                    className="certificate-chart-track"
                    role="img"
                    aria-label={`${item.course_title}: ${count} certificates`}
                  >
                    <div
                      className="certificate-chart-fill"
                      style={{ width }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="certificate-panel certificate-table-panel">
        <div className="certificate-table-header">
          <div className="certificate-panel-heading">
            <div className="certificate-heading-icon">
              <FileCheck2 size={21} />
            </div>

            <div>
              <h2>Issued certificates</h2>
              <p>Review and download issued certificates.</p>
            </div>
          </div>

          <label className="certificate-search">
            <Search size={17} />
            <input
              type="search"
              placeholder="Search certificates..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Search certificates"
            />
          </label>
        </div>

        <div className="certificate-table-wrapper">
          <table className="certificate-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Certificate ID</th>
                <th>Issue date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="certificate-table-empty">
                    <LoaderCircle
                      size={20}
                      className="certificate-spin"
                    />
                    Loading certificates...
                  </td>
                </tr>
              ) : filteredCertificates.length === 0 ? (
                <tr>
                  <td colSpan="6" className="certificate-table-empty">
                    No certificates found.
                  </td>
                </tr>
              ) : (
                paginatedCertificates.map((certificate) => {
                  const studentName = displayStudentName({
                    name: certificate.student_name,
                    id: certificate.student,
                  });

                  return (
                    <tr key={certificate.id}>
                      <td>
                        <div className="certificate-student-cell">
                          <div className="certificate-avatar">
                            {studentName.charAt(0).toUpperCase()}
                          </div>

                          <div>
                            <strong>{studentName}</strong>
                            <small>
                              {certificate.student_pin || "Student"}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td>{certificate.course_title || "—"}</td>

                      <td>
                        <span className="certificate-id">
                          {String(
                            certificate.certificate_number ||
                              certificate.id
                          )}
                        </span>
                      </td>

                      <td>{formatDate(certificate.issued_at)}</td>

                      <td>
                        <span className="certificate-status">
                          <span />
                          Issued
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="certificate-download-btn"
                          onClick={() =>
                            downloadCertificate(certificate)
                          }
                          disabled={
                            downloadingId === certificate.id
                          }
                        >
                          {downloadingId === certificate.id ? (
                            <LoaderCircle
                              size={16}
                              className="certificate-spin"
                            />
                          ) : (
                            <Download size={16} />
                          )}
                          Download
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="certificate-table-footer">
          <span className="certificate-pagination-info">
            Showing {filteredCertificates.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
            {"–"}
            {Math.min(currentPage * itemsPerPage, filteredCertificates.length)} of{" "}
            {filteredCertificates.length} certificates
          </span>

          <div className="certificate-pagination" aria-label="Certificate table pagination">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1 || loading}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button
                type="button"
                key={page}
                className={currentPage === page ? "active" : ""}
                onClick={() => setCurrentPage(page)}
                aria-current={currentPage === page ? "page" : undefined}
                disabled={loading}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages || loading}
            >
              Next
            </button>
          </div>

          <span className="certificate-admin-access">
            <ShieldCheck size={15} />
            Admin access
          </span>
        </div>
      </section>
    </div>
  );
}
