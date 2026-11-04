import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaUserShield,
  FaUser,
  FaEnvelope,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaCheckCircle,
  FaShieldAlt,
  FaTrashAlt,
  FaTimes,
} from "react-icons/fa";
import { toast, Toaster } from "sonner";
import { createAdmin } from "../../api/adminDashboardApi";
import "./AddAdmin.css";

const API_BASE = "http://127.0.0.1:8000/api";

const initialForm = {
  username: "",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
};

function getAccessToken() {
  return (
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("access")
  );
}

function getErrorMessage(error, fallback = "Something went wrong.") {
  if (typeof error === "string") return error;
  if (error?.message) return error.message;

  const data = error?.data;

  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;

  if (data && typeof data === "object") {
    for (const [field, value] of Object.entries(data)) {
      if (typeof value === "string") return `${field}: ${value}`;

      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${value.join(", ")}`;
      }
    }
  }

  return fallback;
}

async function fetchAdmins() {
  const token = getAccessToken();

  if (!token) {
    throw new Error("Please log in with your Admin account.");
  }

  const response = await fetch(`${API_BASE}/users/admins/`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message ||
        result.detail ||
        (response.status === 401
          ? "Your session has expired. Please log in again."
          : response.status === 403
            ? "You do not have permission to view administrator accounts."
            : `Unable to load administrators (${response.status}).`)
    );
  }

  const data = result.data ?? result;
  const admins = Array.isArray(data)
    ? data
    : data.admins ?? data.results ?? data.users ?? [];

  if (!Array.isArray(admins)) {
    throw new Error("The administrators API did not return a valid list.");
  }

  return admins;
}

export default function AddAdmin() {
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminsError, setAdminsError] = useState("");
  const [deletingAdminId, setDeletingAdminId] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  const totalPages = Math.max(1, Math.ceil(admins.length / itemsPerPage));
  const paginatedAdmins = admins.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const firstRecord = admins.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const lastRecord = Math.min(currentPage * itemsPerPage, admins.length);

  const passwordChecks = useMemo(
    () => [
      {
        label: "At least 8 characters",
        valid: form.password.length >= 8,
      },
      {
        label: "One uppercase letter",
        valid: /[A-Z]/.test(form.password),
      },
      {
        label: "One lowercase letter",
        valid: /[a-z]/.test(form.password),
      },
      {
        label: "One number",
        valid: /\d/.test(form.password),
      },
      {
        label: "One special character",
        valid: /[^A-Za-z0-9]/.test(form.password),
      },
    ],
    [form.password]
  );

  const loadAdmins = useCallback(async (showToast = false) => {
    setAdminsLoading(true);
    setAdminsError("");

    const toastId = showToast
      ? toast.loading("Loading administrator accounts...")
      : null;

    try {
      const data = await fetchAdmins();
      setAdmins(data);

      if (toastId) {
        toast.success(
          `${data.length} administrator account(s) loaded successfully.`,
          { id: toastId }
        );
      }
    } catch (error) {
      console.error("Load Admins Error:", error);

      const errorMessage = getErrorMessage(
        error,
        "Unable to load administrator accounts."
      );

      setAdminsError(errorMessage);

      if (toastId) {
        toast.error(errorMessage, { id: toastId });
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setAdminsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdmins(false);
  }, [loadAdmins]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handlePasswordVisibility = () => {
    setShowPassword((previous) => !previous);
  };

  // Open the custom delete confirmation modal.
  const handleDeleteAdmin = (admin) => {
    if (!admin?.id) {
      toast.error("Invalid administrator ID. Please refresh the list.");
      return;
    }

    setDeleteCandidate(admin);
  };

  // Delete only after the user confirms in the modal.
  const confirmDeleteAdmin = async () => {
    if (!deleteCandidate?.id) return;

    const admin = deleteCandidate;
    const token = getAccessToken();

    if (!token) {
      toast.error("Please log in with your Admin account.");
      return;
    }

    setDeletingAdminId(admin.id);
    const toastId = toast.loading("Deleting administrator account...");

    try {
      const response = await fetch(
        `${API_BASE}/users/admins/${admin.id}/`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message ||
            result.detail ||
            (response.status === 401
              ? "Your session has expired. Please log in again."
              : response.status === 403
                ? "You do not have permission to delete this administrator."
                : response.status === 404
                  ? "Administrator not found. Please refresh the list."
                  : `Unable to delete administrator (${response.status}).`)
        );
      }

      setAdmins((previous) =>
        previous.filter(
          (item) => String(item.id) !== String(admin.id)
        )
      );

      setDeleteCandidate(null);

      toast.success(
        result.message || "Administrator deleted successfully.",
        {
          id: toastId,
          duration: 4000,
        }
      );
    } catch (error) {
      console.error("Delete Admin Error:", error);

      toast.error(
        getErrorMessage(error, "Unable to delete administrator account."),
        {
          id: toastId,
          duration: 5000,
        }
      );
    } finally {
      setDeletingAdminId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) return;

    const username = form.username.trim();
    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim().toLowerCase();

    if (!firstName || !lastName || !email || !username || !form.password) {
      toast.warning("Please fill in all required fields.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    const failedPasswordChecks = passwordChecks.filter(
      (check) => !check.valid
    );

    if (failedPasswordChecks.length > 0) {
      toast.error(
        "Please satisfy all password requirements before creating the account."
      );
      return;
    }

    const existingUsername = admins.some(
      (admin) =>
        String(admin.username || "").toLowerCase() === username.toLowerCase()
    );

    if (existingUsername) {
      toast.error(
        "This username is already displayed in the administrator list."
      );
      return;
    }

    const existingEmail = admins.some(
      (admin) => String(admin.email || "").toLowerCase() === email
    );

    if (existingEmail) {
      toast.error(
        "This email address is already displayed in the administrator list."
      );
      return;
    }

    setLoading(true);

    const toastId = toast.loading("Creating administrator account...");

    try {
      const submittedAdmin = {
        username,
        first_name: firstName,
        last_name: lastName,
        email,
        password: form.password,
      };

      const result = await createAdmin(submittedAdmin);
      const adminData = result?.data ?? result;

      const newAdmin = {
        id: adminData?.id ?? adminData?.pk ?? null,
        username: adminData?.username || submittedAdmin.username,
        first_name: adminData?.first_name || submittedAdmin.first_name,
        last_name: adminData?.last_name || submittedAdmin.last_name,
        email: adminData?.email || submittedAdmin.email,
        is_active: adminData?.is_active ?? true,
        status: adminData?.is_active === false ? "Inactive" : "Active",
      };

      if (newAdmin.id !== null && newAdmin.id !== undefined) {
        setAdmins((previous) => {
          const filtered = previous.filter(
            (admin) =>
              String(admin.id) !== String(newAdmin.id) &&
              admin.username?.toLowerCase() !==
                newAdmin.username.toLowerCase() &&
              admin.email?.toLowerCase() !== newAdmin.email.toLowerCase()
          );

          return [newAdmin, ...filtered];
        });
      } else {
        // Fetch the saved record so the table receives its real database ID.
        await loadAdmins(false);
      }

      setForm(initialForm);
      setShowPassword(false);

      toast.success(
        result?.message || "Administrator account created successfully!",
        {
          id: toastId,
          duration: 4500,
        }
      );
    } catch (error) {
      console.error("Add Admin Error:", error);

      const errorMessage = getErrorMessage(
        error,
        "Unable to create the administrator account."
      );

      toast.error(errorMessage, {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-admin-page">
      <Toaster
        position="top-right"
        duration={3500}
        richColors
        closeButton
        visibleToasts={4}
      />

      <div className="add-admin-heading">
        <div>
          <span className="add-admin-eyebrow">
            ADMINISTRATION / USER ACCESS
          </span>

          <h1>Add Admin</h1>

          <p>
            Create an administrator account and grant access to the EduTrack
            management dashboard.
          </p>
        </div>

        <div className="add-admin-heading-icon">
          <FaUserShield />
        </div>
      </div>

      <div className="add-admin-content">
        <section className="add-admin-form-card">
          <div className="add-admin-card-heading">
            <div className="add-admin-card-icon">
              <FaUserShield />
            </div>

            <div>
              <h2>Create administrator</h2>
              <p>Enter the new administrator's account details.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="add-admin-section-label">
              <span>01</span>
              Personal information
            </div>

            <div className="add-admin-fields-grid">
              <label className="add-admin-field">
                <span>First name</span>
                <div className="add-admin-input-wrap">
                  <FaUser />
                  <input
                    type="text"
                    name="first_name"
                    placeholder="Enter first name"
                    value={form.first_name}
                    onChange={handleChange}
                    maxLength={150}
                    autoComplete="given-name"
                    required
                  />
                </div>
              </label>

              <label className="add-admin-field">
                <span>Last name</span>
                <div className="add-admin-input-wrap">
                  <FaUser />
                  <input
                    type="text"
                    name="last_name"
                    placeholder="Enter last name"
                    value={form.last_name}
                    onChange={handleChange}
                    maxLength={150}
                    autoComplete="family-name"
                    required
                  />
                </div>
              </label>

              <label className="add-admin-field">
                <span>Email address</span>
                <div className="add-admin-input-wrap">
                  <FaEnvelope />
                  <input
                    type="email"
                    name="email"
                    placeholder="admin@example.com"
                    value={form.email}
                    onChange={handleChange}
                    autoComplete="email"
                    required
                  />
                </div>
              </label>

              <label className="add-admin-field">
                <span>Username</span>
                <div className="add-admin-input-wrap">
                  <FaUser />
                  <input
                    type="text"
                    name="username"
                    placeholder="Choose a username"
                    value={form.username}
                    onChange={handleChange}
                    maxLength={150}
                    autoComplete="username"
                    required
                  />
                </div>
              </label>
            </div>

            <div className="add-admin-section-label add-admin-password-label">
              <span>02</span>
              Security credentials
            </div>

            <label className="add-admin-field">
              <span>Password</span>
              <div className="add-admin-input-wrap">
                <FaLock />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Create a strong password"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />

                <button
                  type="button"
                  className="add-admin-password-toggle"
                  onClick={handlePasswordVisibility}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </label>

            <div className="add-admin-password-rules">
              <div className="add-admin-rules-title">
                <FaShieldAlt />
                Password requirements
              </div>

              <div className="add-admin-rules-grid">
                {passwordChecks.map((check) => (
                  <div
                    className={`add-admin-rule ${check.valid ? "valid" : ""}`}
                    key={check.label}
                  >
                    <FaCheckCircle />
                    <span>{check.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="add-admin-form-footer">
              <p>
                <FaShieldAlt />
                Account credentials are sent securely to the backend.
              </p>

              <button
                type="submit"
                className="add-admin-submit"
                disabled={loading}
              >
                {loading ? (
                  "Creating account..."
                ) : (
                  <>
                    <FaUserShield />
                    Create Admin Account
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        <aside className="add-admin-info-card">
          <div className="add-admin-info-symbol">
            <FaShieldAlt />
          </div>

          <span className="add-admin-info-tag">PRIVILEGED ACCESS</span>

          <h2>Protect your workspace.</h2>

          <p>
            Administrator accounts can access management features. Only create
            accounts for trusted team members.
          </p>

          <div className="add-admin-info-divider" />

          <div className="add-admin-info-point">
            <FaCheckCircle />
            <div>
              <strong>Unique account details</strong>
              <span>
                Existing usernames and email addresses are rejected.
              </span>
            </div>
          </div>

          <div className="add-admin-info-point">
            <FaCheckCircle />
            <div>
              <strong>Strong password</strong>
              <span>
                Password complexity is checked before submission.
              </span>
            </div>
          </div>

          <div className="add-admin-info-point">
            <FaCheckCircle />
            <div>
              <strong>Protected endpoint</strong>
              <span>
                The backend must authorize the requesting admin.
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Created Admins Table */}
      <section className="created-admins-card">
        <div className="created-admins-heading">
          <div>
            <h2>Created Admins</h2>
            <p>Administrator accounts saved in EduTrack.</p>
          </div>

          <span className="created-admins-count">
            {admins.length} {admins.length === 1 ? "Admin" : "Admins"}
          </span>
        </div>

        <div className="created-admins-table-wrapper">
          <table className="created-admins-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Administrator</th>
                <th>Username</th>
                <th>Email Address</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {adminsLoading ? (
                <tr>
                  <td colSpan={6} className="created-admins-empty">
                    Loading administrator accounts...
                  </td>
                </tr>
              ) : adminsError ? (
                <tr>
                  <td colSpan={6} className="created-admins-empty">
                    {adminsError}
                  </td>
                </tr>
              ) : admins.length > 0 ? (
                paginatedAdmins.map((admin, index) => (
                  <tr key={admin.id ?? admin.username}>
                    <td>{(currentPage - 1) * itemsPerPage + index + 1}</td>

                    <td>
                      <div className="created-admins-person">
                        <div className="created-admins-avatar">
                          {(admin.first_name || admin.username || "A")
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <span>
                          {[admin.first_name, admin.last_name]
                            .filter(Boolean)
                            .join(" ") || admin.username}
                        </span>
                      </div>
                    </td>

                    <td>{admin.username}</td>
                    <td>{admin.email}</td>

                    <td>
                      <span className="created-admins-status">
                        <span className="created-admins-status-dot" />
                        {admin.status ||
                          (admin.is_active === false ? "Inactive" : "Active")}
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="created-admins-delete-btn"
                        onClick={() => handleDeleteAdmin(admin)}
                        disabled={
                          deletingAdminId === admin.id || !admin.id
                        }
                        title="Delete administrator"
                        aria-label={`Delete administrator ${admin.username || ""}`}
                      >
                        <FaTrashAlt />
                        {deletingAdminId === admin.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="created-admins-empty">
                    <FaUserShield />
                    <strong>No administrator accounts found</strong>
                    <span>
                      Successfully created administrator accounts will appear
                      here.
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="created-admins-footer created-admins-pagination-footer">
          <div className="created-admins-pagination-info">
            Showing {firstRecord}-{lastRecord} of {admins.length} administrators
          </div>
          <div className="created-admins-pagination-controls" aria-label="Administrators pagination">
            <button type="button" className="created-admins-page-btn" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1 || adminsLoading}>
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" className={`created-admins-page-btn ${currentPage === page ? "active" : ""}`} onClick={() => setCurrentPage(page)} disabled={adminsLoading} aria-current={currentPage === page ? "page" : undefined}>
                {page}
              </button>
            ))}
            <button type="button" className="created-admins-page-btn" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages || adminsLoading}>
              Next
            </button>
          </div>
          <button
            type="button"
            className="add-admin-submit"
            onClick={() => loadAdmins(true)}
            disabled={adminsLoading}
          >
            {adminsLoading ? "Refreshing..." : "Refresh administrator list"}
          </button>
        </div>
      </section>

      {/* Delete administrator confirmation modal */}
      {deleteCandidate && (
        <div
          className="admin-delete-modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              deletingAdminId === null
            ) {
              setDeleteCandidate(null);
            }
          }}
        >
          <section
            className="admin-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-admin-title"
          >
            <button
              type="button"
              className="admin-delete-modal-close"
              onClick={() => setDeleteCandidate(null)}
              disabled={deletingAdminId !== null}
              aria-label="Close confirmation"
            >
              <FaTimes />
            </button>

            <div className="admin-delete-modal-icon">
              <FaTrashAlt />
            </div>

            <h2 id="delete-admin-title">Delete Administrator?</h2>

            <p>Are you sure you want to delete this admin?</p>

            <div className="admin-delete-admin-details">
              <strong>
                {[
                  deleteCandidate.first_name,
                  deleteCandidate.last_name,
                ]
                  .filter(Boolean)
                  .join(" ") || deleteCandidate.username}
              </strong>
              <span>{deleteCandidate.email}</span>
            </div>

            <p className="admin-delete-warning">
              This action cannot be undone.
            </p>

            <div className="admin-delete-modal-actions">
              <button
                type="button"
                className="admin-delete-cancel"
                onClick={() => setDeleteCandidate(null)}
                disabled={deletingAdminId !== null}
              >
                Cancel
              </button>

              <button
                type="button"
                className="admin-delete-confirm"
                onClick={confirmDeleteAdmin}
                disabled={deletingAdminId !== null}
              >
                {deletingAdminId !== null
                  ? "Deleting..."
                  : "Confirm Delete"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}