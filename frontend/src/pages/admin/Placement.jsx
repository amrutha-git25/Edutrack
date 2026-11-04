
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  FiPlus,
  FiSearch,
  FiBriefcase,
  FiUsers,
  FiCheckCircle,
  FiClock,
  FiEdit2,
  FiTrash2,
  FiRefreshCw,
  FiX,
  FiCalendar,
} from "react-icons/fi";

import {
  fetchPlacements,
  createPlacement,
  updatePlacement,
  archivePlacement,
} from "../../api/placementApi";

import "./Placement.css";

const INITIAL_FORM = {
  company_name: "",
  position: "",
  package: "",
  placement_date: "",
  status: "open",
  notes: "",
};

function getPlacementList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.placements)) return data.placements;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function formatPackage(value) {
  if (value === null || value === undefined || value === "") {
    return "Not specified";
  }

  const numericValue = Number(value);

  return Number.isNaN(numericValue)
    ? value
    : `₹${numericValue.toLocaleString("en-IN")} LPA`;
}

function formatDate(value) {
  if (!value) return "Not scheduled";

  const date = new Date(`${value}`.slice(0, 10) + "T00:00:00");

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getErrorMessage(error) {
  const data = error?.response?.data;

  if (typeof data === "string") return data;
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.error === "string") return data.error;

  if (data && typeof data === "object") {
    const firstValue = Object.values(data)[0];

    if (Array.isArray(firstValue)) {
      return String(firstValue[0] || "Please check the submitted information.");
    }

    if (typeof firstValue === "string") return firstValue;
  }

  if (error?.response?.status === 401) {
    return "Your session may have expired. Please log in again.";
  }

  if (error?.response?.status === 403) {
    return "You do not have permission to perform this action.";
  }

  if (error?.response?.status === 404) {
    return "The requested placement could not be found.";
  }

  if (!error?.response) {
    return "Unable to connect to the server. Check that Django is running.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

export default function Placement() {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [placementToDelete, setPlacementToDelete] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 3;
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const loadPlacements = useCallback(async (showToast = false) => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchPlacements();
      const list = getPlacementList(data);

      setPlacements(list);

      if (showToast) {
        toast.success("Placements refreshed successfully.");
      }
    } catch (err) {
      const message = getErrorMessage(err);

      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlacements();
  }, [loadPlacements]);

  const visiblePlacements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return placements.filter((placement) => {
      const archived = Boolean(placement.is_archived);

      if (!showArchived && archived) return false;
      if (showArchived && !archived) return false;

      const matchesSearch =
        !query ||
        [
          placement.company_name,
          placement.position,
          placement.status,
          placement.notes,
        ].some((value) =>
          String(value ?? "").toLowerCase().includes(query)
        );

      const matchesStatus =
        statusFilter === "all" ||
        String(placement.status ?? "").toLowerCase() === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [placements, search, statusFilter, showArchived]);

  const totalPages = Math.max(1, Math.ceil(visiblePlacements.length / ITEMS_PER_PAGE));

  const paginatedPlacements = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return visiblePlacements.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [visiblePlacements, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, showArchived]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const stats = useMemo(() => {
    const activePlacements = placements.filter(
      (placement) => !placement.is_archived
    );

    return {
      total: activePlacements.length,
      open: activePlacements.filter(
        (placement) => placement.status === "open"
      ).length,
      upcoming: activePlacements.filter(
        (placement) => placement.status === "upcoming"
      ).length,
      placed: activePlacements.filter(
        (placement) => placement.status === "placed"
      ).length,
    };
  }, [placements]);

  function openCreateModal() {
    setEditingPlacement(null);
    setForm({ ...INITIAL_FORM });
    setError("");
    setModalOpen(true);
  }

  function openEditModal(placement) {
    setEditingPlacement(placement);

    setForm({
      company_name: placement.company_name ?? "",
      position: placement.position ?? "",
      package: placement.package ?? "",
      placement_date: placement.placement_date
        ? String(placement.placement_date).slice(0, 10)
        : "",
      status: placement.status ?? "open",
      notes: placement.notes ?? "",
    });

    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditingPlacement(null);
    setForm({ ...INITIAL_FORM });
    setError("");
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");

    if (!form.company_name.trim() || !form.position.trim()) {
      const message = "Company name and job position are required.";
      setError(message);
      toast.error(message);
      return;
    }

    const payload = {
      company_name: form.company_name.trim(),
      position: form.position.trim(),
      package: form.package === "" ? null : Number(form.package),
      placement_date: form.placement_date || null,
      status: form.status,
      notes: form.notes.trim(),
    };

    if (
      payload.package !== null &&
      (!Number.isFinite(payload.package) || payload.package < 0)
    ) {
      const message = "Enter a valid non-negative package amount.";
      setError(message);
      toast.error(message);
      return;
    }

    setSaving(true);

    try {
      if (editingPlacement) {
        await updatePlacement(editingPlacement.id, payload);

        toast.success("Placement updated successfully.");
      } else {
        await createPlacement(payload);

        toast.success("Placement created successfully.");
      }

      setModalOpen(false);
      setEditingPlacement(null);
      setForm({ ...INITIAL_FORM });

      await loadPlacements();
    } catch (err) {
      const message = getErrorMessage(err);

      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function openDeleteModal(placement) {
    setPlacementToDelete(placement);
  }

  function closeDeleteModal() {
    if (deletingId !== null) return;
    setPlacementToDelete(null);
  }

  function cancelDeletePlacement() {
    if (deletingId !== null) return;
    setPlacementToDelete(null);
    toast("Placement deletion cancelled.");
  }

  async function confirmDeletePlacement() {
    if (!placementToDelete || deletingId !== null) return;

    const placement = placementToDelete;
    setError("");
    setDeletingId(placement.id);

    try {
      // The current API's DELETE endpoint is wired through archivePlacement.
      // It removes the record from active placement results.
      await archivePlacement(placement.id);

      setPlacements((previous) =>
        previous.filter((item) => item.id !== placement.id)
      );
      setPlacementToDelete(null);

      toast("Placement deleted.", {
        style: {
          background: "#dc2626",
          color: "#ffffff",
          border: "1px solid #b91c1c",
        },
      });

      await loadPlacements();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleArchiveViewToggle() {
    const nextValue = !showArchived;

    setShowArchived(nextValue);
    setStatusFilter("all");
    setSearch("");

  }

  function handleStatusFilterChange(value) {
    setStatusFilter(value);

  }

  const statusLabel = (status) => {
    const labels = {
      open: "Open",
      upcoming: "Upcoming",
      closed: "Closed",
      placed: "Placed",
      offer: "Offer",
    };

    return labels[status] || status || "Unknown";
  };

  return (
    <div className="placement-page">
      <Toaster
        position="top-right"
        richColors
        closeButton
        duration={3500}
      />

      <div className="placement-header">
        <div>
          <div className="placement-eyebrow">
            <FiBriefcase />
            CAREER SERVICES
          </div>

          <h1>Placement Management</h1>

          <p>
            Manage company opportunities, placement drives, and hiring
            updates from one place.
          </p>
        </div>

        <div className="placement-header-actions">
          <button
            type="button"
            className="placement-btn placement-btn-secondary"
            onClick={() => loadPlacements(true)}
            disabled={loading}
          >
            <FiRefreshCw
              className={loading ? "placement-spin" : ""}
            />
            Refresh
          </button>

          <button
            type="button"
            className="placement-btn placement-btn-primary"
            onClick={openCreateModal}
          >
            <FiPlus />
            Add Placement
          </button>
        </div>
      </div>

      {error && !modalOpen && (
        <div className="placement-alert placement-alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <FiX />
          </button>
        </div>
      )}

      <div className="placement-stats">
        <div className="placement-stat-card">
          <div className="placement-stat-icon purple">
            <FiBriefcase />
          </div>
          <div>
            <span>Total Placements</span>
            <strong>{stats.total}</strong>
            <small>Active opportunities</small>
          </div>
        </div>

        <div className="placement-stat-card">
          <div className="placement-stat-icon green">
            <FiCheckCircle />
          </div>
          <div>
            <span>Open Positions</span>
            <strong>{stats.open}</strong>
            <small>Accepting applications</small>
          </div>
        </div>

        <div className="placement-stat-card">
          <div className="placement-stat-icon orange">
            <FiClock />
          </div>
          <div>
            <span>Upcoming Drives</span>
            <strong>{stats.upcoming}</strong>
            <small>Scheduled opportunities</small>
          </div>
        </div>

        <div className="placement-stat-card">
          <div className="placement-stat-icon blue">
            <FiUsers />
          </div>
          <div>
            <span>Placed</span>
            <strong>{stats.placed}</strong>
            <small>Placement records marked placed</small>
          </div>
        </div>
      </div>

      <section className="placement-content">
        <div className="placement-content-heading">
          <div>
            <h2>{showArchived ? "Archived Placements" : "All Placements"}</h2>
            <p>
              {showArchived
                ? "Review archived placement records."
                : "Search, edit, and manage placement opportunities."}
            </p>
          </div>

        </div>

        <div className="placement-toolbar">
          <div className="placement-search">
            <FiSearch />
            <input
              type="search"
              placeholder="Search company, position, or status..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search placements"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              handleStatusFilterChange(event.target.value)
            }
            aria-label="Filter by placement status"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="upcoming">Upcoming</option>
            <option value="closed">Closed</option>
            <option value="placed">Placed</option>
            <option value="offer">Offer</option>
          </select>
        </div>

        <div className="placement-table-wrapper">
          <table className="placement-table">
            <thead>
              <tr>
                <th>Company &amp; Position</th>
                <th>Package</th>
                <th>Placement Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="placement-empty">
                    <FiRefreshCw className="placement-spin" />
                    <span>Loading placements...</span>
                  </td>
                </tr>
              ) : visiblePlacements.length === 0 ? (
                <tr>
                  <td colSpan="5" className="placement-empty">
                    <div className="placement-empty-icon">
                      <FiBriefcase />
                    </div>
                    <strong>No placements found</strong>
                    <span>
                      {search || statusFilter !== "all"
                        ? "Try changing your search or filter."
                        : showArchived
                          ? "There are no archived placements."
                          : "Add your first placement opportunity to get started."}
                    </span>
                  </td>
                </tr>
              ) : (
                paginatedPlacements.map((placement) => (
                  <tr key={placement.id}>
                    <td>
                      <div className="placement-company-cell">
                        <div className="placement-company-icon">
                          <FiBriefcase />
                        </div>

                        <div>
                          <strong>{placement.company_name}</strong>
                          <span>{placement.position}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="placement-package">
                        {formatPackage(placement.package)}
                      </span>
                    </td>

                    <td>
                      <span className="placement-date">
                        <FiCalendar />
                        {formatDate(placement.placement_date)}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`placement-status placement-status-${String(
                          placement.status || "unknown"
                        ).toLowerCase()}`}
                      >
                        <span className="placement-status-dot" />
                        {statusLabel(placement.status)}
                      </span>
                    </td>

                    <td>
                      <div className="placement-row-actions">
                        {!showArchived && (
                          <>
                            <button
                              type="button"
                              className="placement-icon-btn"
                              title="Edit placement"
                              aria-label={`Edit ${placement.company_name}`}
                              onClick={() => openEditModal(placement)}
                            >
                              <FiEdit2 />
                            </button>

                            <button
                              type="button"
                              className="placement-icon-btn placement-icon-btn-danger"
                              title="Delete placement"
                              aria-label={`Delete ${placement.company_name}`}
                              onClick={() => openDeleteModal(placement)}
                            >
                              <FiTrash2 />
                            </button>
                          </>
                        )}

                        {showArchived && (
                          <span className="placement-archived-label">
                            Archived
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="placement-table-footer">
          <span>
            Showing{" "}
            {visiblePlacements.length === 0
              ? 0
              : (currentPage - 1) * ITEMS_PER_PAGE + 1}
            {"–"}
            {Math.min(currentPage * ITEMS_PER_PAGE, visiblePlacements.length)} of{" "}
            {visiblePlacements.length} placements
          </span>

          {visiblePlacements.length > 0 && (
            <div className="placement-pagination" aria-label="Placement pagination">
              <button
                type="button"
                className="placement-page-btn"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                Previous
              </button>

              <span className="placement-page-indicator">
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                className="placement-page-btn"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>

      {modalOpen && (
        <div
          className="placement-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="placement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="placement-modal-title"
          >
            <div className="placement-modal-header">
              <div>
                <span className="placement-modal-eyebrow">
                  PLACEMENT DETAILS
                </span>

                <h2 id="placement-modal-title">
                  {editingPlacement ? "Edit Placement" : "Create Placement"}
                </h2>

                <p>
                  {editingPlacement
                    ? "Update the opportunity details below."
                    : "Add a new company opportunity for students."}
                </p>
              </div>

              <button
                type="button"
                className="placement-modal-close"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close modal"
              >
                <FiX />
              </button>
            </div>

            {error && (
              <div
                className="placement-alert placement-alert-error"
                role="alert"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="placement-form-grid">
                <label className="placement-field">
                  <span>Company Name *</span>
                  <input
                    type="text"
                    name="company_name"
                    value={form.company_name}
                    onChange={handleChange}
                    placeholder="e.g. Google"
                    required
                    maxLength={150}
                  />
                </label>

                <label className="placement-field">
                  <span>Job Position *</span>
                  <input
                    type="text"
                    name="position"
                    value={form.position}
                    onChange={handleChange}
                    placeholder="e.g. Software Engineer"
                    required
                    maxLength={150}
                  />
                </label>

                <label className="placement-field">
                  <span>Package (LPA)</span>
                  <input
                    type="number"
                    name="package"
                    value={form.package}
                    onChange={handleChange}
                    placeholder="e.g. 12"
                    min="0"
                    step="0.01"
                  />
                </label>

                <label className="placement-field">
                  <span>Placement Date</span>
                  <input
                    type="date"
                    name="placement_date"
                    value={form.placement_date}
                    onChange={handleChange}
                  />
                </label>

                <label className="placement-field placement-field-full">
                  <span>Status *</span>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    required
                  >
                    <option value="open">Open</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="closed">Closed</option>
                    <option value="placed">Placed</option>
                    <option value="offer">Offer</option>
                  </select>
                </label>

                <label className="placement-field placement-field-full">
                  <span>Notes</span>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    placeholder="Add eligibility details, hiring notes, or other information..."
                    rows={4}
                  />
                </label>
              </div>

              <div className="placement-modal-footer">
                <button
                  type="button"
                  className="placement-btn placement-btn-secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="placement-btn placement-btn-primary"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <FiRefreshCw className="placement-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <FiPlus />
                      {editingPlacement ? "Save Changes" : "Create Placement"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {placementToDelete && (
        <div
          className="placement-modal-backdrop placement-delete-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteModal();
          }}
        >
          <section
            className="placement-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="placement-delete-title"
          >
            <div className="placement-delete-icon">
              <FiTrash2 />
            </div>

            <div className="placement-delete-content">
              <span className="placement-modal-eyebrow">CONFIRM DELETION</span>
              <h2 id="placement-delete-title">Delete placement?</h2>
              <p>
                Are you sure you want to delete placement{" "}
                <strong>{placementToDelete.company_name}</strong>? This action
                cannot be undone.
              </p>
            </div>

            <div className="placement-delete-actions">
              <button
                type="button"
                className="placement-btn placement-btn-secondary"
                onClick={cancelDeletePlacement}
                disabled={deletingId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="placement-btn placement-btn-delete"
                onClick={confirmDeletePlacement}
                disabled={deletingId !== null}
              >
                <FiTrash2 />
                Delete
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
