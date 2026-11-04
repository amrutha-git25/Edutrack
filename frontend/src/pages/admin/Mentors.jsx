
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";

import {
  fetchMentors,
  createMentor,
  updateMentor,
  deactivateMentor as deleteMentorApi,
} from "../../api/adminDashboardApi";

import "./Mentors.css";

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  specialization: "",
  phone_number: "",
  password: "",
};

export default function Mentors() {
  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingMentor, setEditingMentor] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mentorToDelete, setMentorToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  // Load mentors.
  const loadMentors = useCallback(async () => {
    setLoading(true);

    try {
      const data = await fetchMentors();
      setMentors(Array.isArray(data) ? data : []);
      return true;
    } catch (err) {
      toast.error(
        err?.message ||
          "Unable to load mentors. Check the backend and your admin login."
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMentors();
  }, [loadMentors]);

  // Search mentors.
  const filteredMentors = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return mentors;

    return mentors.filter((mentor) =>
      [
        mentor.first_name,
        mentor.last_name,
        mentor.email,
        mentor.specialization,
        mentor.phone_number,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [mentors, search]);

  // Pagination
const totalPages = Math.max(
  1,
  Math.ceil(filteredMentors.length / itemsPerPage)
);

const paginatedMentors = useMemo(() => {
  const startIndex = (currentPage - 1) * itemsPerPage;

  return filteredMentors.slice(
    startIndex,
    startIndex + itemsPerPage
  );
}, [filteredMentors, currentPage]);

const startRecord =
  filteredMentors.length === 0
    ? 0
    : (currentPage - 1) * itemsPerPage + 1;

const endRecord = Math.min(
  currentPage * itemsPerPage,
  filteredMentors.length
);

// Reset to a valid page if records are deleted
useEffect(() => {
  if (currentPage > totalPages) {
    setCurrentPage(totalPages);
  }
}, [currentPage, totalPages]);

  // Retained for the existing summary cards.
  const activeCount = mentors.filter(
    (mentor) => mentor.is_active === true
  ).length;

  const inactiveCount = mentors.filter(
    (mentor) => mentor.is_active === false
  ).length;

  function openAddModal() {
    setEditingMentor(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  function openEditModal(mentor) {
    setEditingMentor(mentor);

    setForm({
      first_name: mentor.first_name || "",
      last_name: mentor.last_name || "",
      email: mentor.email || "",
      specialization: mentor.specialization || "",
      phone_number: mentor.phone_number || "",
      password: "",
    });

    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setEditingMentor(null);
    setForm({ ...emptyForm });
  }

  function updateField(event) {
    const { name, value } = event.target;

    // Clear any previous browser validation message.
    event.target.setCustomValidity("");

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  // Create or update a mentor.
  async function handleSubmit(event) {
    event.preventDefault();

    if (saving) return;

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim();
    const specialization = form.specialization.trim();

    if (!firstName || !lastName || !email || !specialization) {
      return;
    }

    const rawPhone = String(form.phone_number || "").trim();
    const digitsOnly = rawPhone.replace(/\D/g, "");
    const normalizedPhone = `${
      rawPhone.startsWith("+") ? "+" : ""
    }${digitsOnly}`;

    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      const phoneInput = event.currentTarget.elements.phone_number;

      phoneInput.setCustomValidity(
        "Enter a phone number containing 10 to 15 digits."
      );
      phoneInput.reportValidity();
      return;
    }

    if (form.password.trim() && form.password.length < 8) {
      const passwordInput = event.currentTarget.elements.password;

      passwordInput.setCustomValidity(
        "Password must contain at least 8 characters."
      );
      passwordInput.reportValidity();
      return;
    }

    const payload = {
      first_name: firstName,
      last_name: lastName,
      email,
      specialization,
      phone_number: normalizedPhone,
    };

    if (form.password.trim()) {
      payload.password = form.password;
    }

    setSaving(true);

    try {
      if (editingMentor) {
        await updateMentor(editingMentor.id, payload);
        toast.success("Mentor updated successfully.");
      } else {
        await createMentor(payload);
        toast.success("Mentor created successfully.");
      }

      setShowModal(false);
      setEditingMentor(null);
      setForm({ ...emptyForm });

      await loadMentors();
    } catch (err) {
      toast.error(
        err?.message || "Unable to save mentor. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // Open the delete confirmation modal without a toast.
  function openDeleteModal(mentor) {
    setMentorToDelete(mentor);
    setShowDeleteModal(true);
  }

  // Cancel deletion and show a message only after cancellation.
  function closeDeleteModal() {
    if (deleting) return;

    setShowDeleteModal(false);
    setMentorToDelete(null);

    toast.info("Deletion cancelled.");
  }

  // Delete only after explicit confirmation.
  async function confirmDelete() {
    if (!mentorToDelete || deleting) return;

    const mentorId = mentorToDelete.id;

    setDeleting(true);

    try {
      await deleteMentorApi(mentorId);

      // Immediately remove the deleted mentor from the visible list.
      setMentors((current) =>
        current.filter((mentor) => mentor.id !== mentorId)
      );

      setShowDeleteModal(false);
      setMentorToDelete(null);

      // Red toast shown only after the delete request succeeds.
      toast("Mentor deleted successfully.", {
        style: {
          background: "#dc2626",
          color: "#ffffff",
          border: "1px solid #b91c1c",
        },
      });
    } catch (err) {
      toast.error(
        err?.message || "Unable to delete this mentor."
      );
    } finally {
      setDeleting(false);
    }
  }

  // Refresh and notify only after the request completes.
  async function handleRefresh() {
    if (loading) return;

    const refreshed = await loadMentors();

    if (refreshed) {
      toast.success("Mentors refreshed successfully.");
    }
  }

  return (
    <section className="mentors-page">
      <Toaster
        position="top-right"
        duration={3000}
        richColors
        closeButton
        visibleToasts={4}
      />

      {/* Page heading */}
      <header className="mentors-heading">
        <div>
          <p className="mentors-eyebrow">
            ADMINISTRATION / PEOPLE
          </p>

          <h1>Mentor Management</h1>

          <p className="mentors-subtitle">
            Create mentor accounts and manage their details.
          </p>
        </div>

        <button
          type="button"
          className="mentor-primary-btn"
          onClick={openAddModal}
        >
          <span aria-hidden="true">＋</span> Add Mentor
        </button>
      </header>

      {/* Statistics */}
      <div className="mentor-stats">
        <article className="mentor-stat-card">
          <span className="mentor-stat-icon">◎</span>

          <div>
            <p>Total Mentors</p>
            <strong>{mentors.length}</strong>
          </div>
        </article>

        <article className="mentor-stat-card">
          <span className="mentor-stat-icon mentor-icon-active">
            ✓
          </span>

          <div>
            <p>Active Mentors</p>
            <strong>{activeCount}</strong>
          </div>
        </article>

        <article className="mentor-stat-card">
          <span className="mentor-stat-icon mentor-icon-inactive">
            Ⅱ
          </span>

          <div>
            <p>Inactive Mentors</p>
            <strong>{inactiveCount}</strong>
          </div>
        </article>
      </div>

      {/* Mentors table */}
      <div className="mentor-table-card">
        <div className="mentor-table-toolbar">
          <div>
            <h2>All Mentors</h2>

            <p>Manage your platform&apos;s teaching team.</p>
          </div>

          <label className="mentor-search">
            <span aria-hidden="true">⌕</span>

            <input
              type="search"
              placeholder="Search name, email or specialization..."
              value={search}
              onChange={(event) => {
  setSearch(event.target.value);
  setCurrentPage(1);
}}
              aria-label="Search mentors"
            />
          </label>
        </div>

        <div className="mentor-table-wrap">
          <table className="mentor-table">
            <thead>
              <tr>
                <th>MENTOR</th>
                <th>SPECIALIZATION</th>
                <th>PHONE NUMBER</th>
                <th className="mentor-actions-heading">
                  ACTIONS
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="mentor-empty">
                    Loading mentors...
                  </td>
                </tr>
              ) : filteredMentors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="mentor-empty">
                    {search
                      ? "No mentors match your search."
                      : "No mentors yet. Select Add Mentor to create the first account."}
                  </td>
                </tr>
              ) : (
                paginatedMentors.map((mentor) => {
                  const fullName =
                    `${mentor.first_name || ""} ${
                      mentor.last_name || ""
                    }`.trim() || "Unnamed Mentor";

                  return (
                    <tr key={mentor.id}>
                      <td>
                        <div className="mentor-person">
                          <span className="mentor-avatar">
                            {fullName.charAt(0).toUpperCase()}
                          </span>

                          <span className="mentor-person-info">
                            <strong>{fullName}</strong>
                            <small>{mentor.email}</small>
                          </span>
                        </div>
                      </td>

                      <td>{mentor.specialization || "—"}</td>

                      <td>{mentor.phone_number || "—"}</td>

                      <td>
                        <div className="mentor-row-actions">
                          <button
                            type="button"
                            className="mentor-action-btn"
                            onClick={() => openEditModal(mentor)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="mentor-action-btn mentor-deactivate-btn"
                            onClick={() => openDeleteModal(mentor)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      
{/* Table footer */}
<footer className="mentor-table-footer">
  <span className="mentor-pagination-info">
    Showing {loading ? 0 : startRecord}–{loading ? 0 : endRecord} of{" "}
    {filteredMentors.length} mentors
  </span>

  <div className="mentor-pagination-controls">
    <button
      type="button"
      className="mentor-page-btn"
      disabled={currentPage === 1 || loading}
      onClick={() => setCurrentPage((page) => page - 1)}
    >
      Previous
    </button>

    {Array.from({ length: totalPages }, (_, index) => index + 1).map(
      (page) => (
        <button
          type="button"
          key={page}
          className={`mentor-page-btn ${
            currentPage === page ? "active-page" : ""
          }`}
          disabled={loading}
          onClick={() => setCurrentPage(page)}
        >
          {page}
        </button>
      )
    )}

    <button
      type="button"
      className="mentor-page-btn"
      disabled={currentPage === totalPages || loading}
      onClick={() => setCurrentPage((page) => page + 1)}
    >
      Next
    </button>
  </div>

  <button
    type="button"
    className="mentor-refresh-btn"
    onClick={handleRefresh}
    disabled={loading}
  >
    ↻ Refresh
  </button>
</footer>

      </div>

      {/* Add/Edit Mentor modal */}
      {showModal && (
        <div
          className="mentor-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <section
            className="mentor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mentor-modal-title"
          >
            <header className="mentor-modal-header">
              <div>
                <p className="mentors-eyebrow">
                  MENTOR DETAILS
                </p>

                <h2 id="mentor-modal-title">
                  {editingMentor ? "Edit Mentor" : "Add New Mentor"}
                </h2>
              </div>

              <button
                type="button"
                className="mentor-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close dialog"
              >
                ×
              </button>
            </header>

            <form onSubmit={handleSubmit}>
              <div className="mentor-form-grid">
                <label>
                  First Name *
                  <input
                    name="first_name"
                    value={form.first_name}
                    onChange={updateField}
                    required
                    maxLength={150}
                    autoComplete="given-name"
                  />
                </label>

                <label>
                  Last Name *
                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={updateField}
                    required
                    maxLength={150}
                    autoComplete="family-name"
                  />
                </label>

                <label className="mentor-form-full">
                  Email Address *
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={updateField}
                    required
                    autoComplete="email"
                  />
                </label>

                <label className="mentor-form-full">
                  Specialization *
                  <input
                    name="specialization"
                    value={form.specialization}
                    onChange={updateField}
                    required
                    maxLength={150}
                    placeholder="e.g. Python, Data Science, Web Development"
                  />
                </label>

                <label className="mentor-form-full">
                  Phone Number *
                  <input
                    name="phone_number"
                    type="tel"
                    value={form.phone_number}
                    onChange={updateField}
                    required
                    pattern="^\+?[0-9]{10,15}$"
                    title="Enter 10–15 digits, optionally starting with +."
                    placeholder="e.g. +919876543210"
                  />
                </label>

                <label className="mentor-form-full">
                  {editingMentor
                    ? "New Password (optional)"
                    : "Password (optional)"}

                  <input
                    name="password"
                    type="password"
                    value={form.password}
                    onChange={updateField}
                    minLength={8}
                    autoComplete="new-password"
                    placeholder={
                      editingMentor
                        ? "Leave blank to keep the current password"
                        : "Leave blank to generate a temporary password"
                    }
                  />

                  <small className="mentor-field-hint">
                    Minimum 8 characters. Passwords are never displayed
                    in the table.
                  </small>
                </label>
              </div>

              <footer className="mentor-modal-actions">
                <button
                  type="button"
                  className="mentor-secondary-btn"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="mentor-primary-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingMentor
                      ? "Save Changes"
                      : "Create Mentor"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && mentorToDelete && (
        <div
          className="mentor-confirm-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDeleteModal();
            }
          }}
        >
          <section
            className="mentor-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <div className="mentor-confirm-icon" aria-hidden="true">
              !
            </div>

            <h2 id="delete-title">Delete Mentor?</h2>

            <p>
              Are you sure you want to delete{" "}
              <strong>
                {mentorToDelete.first_name}{" "}
                {mentorToDelete.last_name}
              </strong>
              ? This action cannot be undone.
            </p>

            <div className="mentor-confirm-actions">
              <button
                type="button"
                className="mentor-confirm-cancel"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="mentor-confirm-danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
