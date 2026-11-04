
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  createFeeRecord,
  getFeeRecords,
  getFeeSummary,
  getPaymentReceipt,
  getPayments,
  recordPayment,
} from "../../../api/feeApi";
import "./FeeManagement.css";

const initialFeeForm = {
  student: "",
  course: "",
  total_fee: "",
  discount: "0",
  payment_type: "one_time",
  due_date: "",
  notes: "",
};

const initialPaymentForm = {
  fee_record: "",
  amount: "",
  payment_method: "upi",
  transaction_id: "",
  notes: "",
};

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const getErrorMessage = (error) => {
  const data = error?.response?.data;

  if (!data) {
    return "Unable to connect to the server. Check that Django is running.";
  }

  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (data.message) return data.message;
  if (data.error) return data.error;

  return Object.entries(data)
    .map(([field, value]) => {
      const message = Array.isArray(value)
        ? value.join(", ")
        : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value);

      return `${field.replaceAll("_", " ")}: ${message}`;
    })
    .join("\n");
};

const unwrapList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

export default function FeeManagement() {
  const [summary, setSummary] = useState({});
  const [fees, setFees] = useState([]);
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;
  const [activeTab, setActiveTab] = useState("fees");
  const [modal, setModal] = useState("");
  const [selectedFee, setSelectedFee] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [feeForm, setFeeForm] = useState(initialFeeForm);
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async (showToast = false) => {
    setLoading(true);
    setError("");

    const toastId = "fee-dashboard-refresh";

    if (showToast) {
      toast.loading("Refreshing fee data...", { id: toastId });
    }

    const results = await Promise.allSettled([
      getFeeSummary(),
      getFeeRecords(),
      getPayments(),
    ]);

    const [summaryResult, feeResult, paymentResult] = results;

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value);
    } else {
      setError(getErrorMessage(summaryResult.reason));
    }

    if (feeResult.status === "fulfilled") {
      setFees(unwrapList(feeResult.value));
    } else {
      setError((current) =>
        current || getErrorMessage(feeResult.reason)
      );
    }

    if (paymentResult.status === "fulfilled") {
      setPayments(unwrapList(paymentResult.value));
    } else {
      setError((current) =>
        current || getErrorMessage(paymentResult.reason)
      );
    }

    setLoading(false);

    const failed = results.filter(
      (result) => result.status === "rejected"
    );

    if (failed.length === 0) {
      if (showToast) {
        toast.success("Fee data refreshed successfully.", {
          id: toastId,
        });
      }
    } else if (failed.length === results.length) {
      toast.error("Could not load fee data. Please try again.", {
        id: showToast ? toastId : undefined,
      });
    } else {
      toast.warning("Some fee data could not be loaded.", {
        id: showToast ? toastId : undefined,
      });
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const filteredFees = useMemo(() => {
    const query = search.trim().toLowerCase();

    return fees.filter((fee) => {
      const studentName = fee.student_name || "";
      const courseName = fee.course_name || "";

      const matchesSearch =
        !query ||
        studentName.toLowerCase().includes(query) ||
        courseName.toLowerCase().includes(query) ||
        String(fee.id).includes(query) ||
        String(fee.student).includes(query);

      const matchesStatus =
        statusFilter === "all" || fee.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [fees, search, statusFilter]);

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return payments.filter((payment) => {
      const studentName = payment.student_name || "";

      return (
        !query ||
        studentName.toLowerCase().includes(query) ||
        String(payment.id).includes(query) ||
        String(payment.transaction_id || "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [payments, search]);

  const activeRecords = activeTab === "fees" ? filteredFees : filteredPayments;
  const totalPages = Math.max(1, Math.ceil(activeRecords.length / itemsPerPage));
  const paginatedRecords = activeRecords.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const openFeeModal = () => {
    setFeeForm({ ...initialFeeForm });
    setError("");
    setModal("fee");
    toast.info("Enter the student ID and fee details.");
  };

  const openPaymentModal = (fee) => {
    setSelectedFee(fee);
    setPaymentForm({
      ...initialPaymentForm,
      fee_record: String(fee.id),
      amount: String(fee.pending_amount ?? ""),
    });
    setError("");
    setModal("payment");
    toast.info(
      `Outstanding balance: ${money(fee.pending_amount)}`
    );
  };

  const closeModal = () => {
    if (saving) return;

    setModal("");
    setSelectedFee(null);
    setReceipt(null);
    setError("");
  };

  const handleFeeSubmit = async (event) => {
    event.preventDefault();

    const total = Number(feeForm.total_fee);
    const discount = Number(feeForm.discount || 0);
    const studentId = Number(feeForm.student);
    const courseId = feeForm.course
      ? Number(feeForm.course)
      : null;

    if (
      !feeForm.student ||
      !Number.isInteger(studentId) ||
      studentId <= 0 ||
      !Number.isFinite(total) ||
      total <= 0
    ) {
      setError("Enter a valid student ID and total fee.");
      toast.error("Enter a valid student ID and total fee.");
      return;
    }

    if (
      courseId !== null &&
      (!Number.isInteger(courseId) || courseId <= 0)
    ) {
      setError("Enter a valid course ID.");
      toast.error("Enter a valid course ID.");
      return;
    }

    if (
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > total
    ) {
      setError("Discount must be between zero and the total fee.");
      toast.error("Discount must be between zero and the total fee.");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      student: studentId,
      total_fee: total.toFixed(2),
      discount: discount.toFixed(2),
      payment_type: feeForm.payment_type,
      due_date: feeForm.due_date || null,
      notes: feeForm.notes.trim(),
    };

    if (courseId !== null) {
      payload.course = courseId;
    }

    const toastId = toast.loading("Assigning fee...");

    try {
      await createFeeRecord(payload);

      toast.success("Fee assigned successfully.", {
        id: toastId,
      });

      setModal("");
      setFeeForm({ ...initialFeeForm });
      await loadDashboard();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handlePaymentSubmit = async (event) => {
    event.preventDefault();

    const amount = Number(paymentForm.amount);
    const pending = Number(selectedFee?.pending_amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payment amount.");
      toast.error("Enter a valid payment amount.");
      return;
    }

    if (amount > pending) {
      const message = `Payment cannot exceed ${money(pending)}.`;
      setError(message);
      toast.error(message);
      return;
    }

    if (!selectedFee?.id || !paymentForm.fee_record) {
      const message = "Select a valid fee record before recording payment.";
      setError(message);
      toast.error(message);
      return;
    }

    setSaving(true);
    setError("");

    const toastId = toast.loading("Recording payment...");

    try {
      await recordPayment({
        fee_record: Number(paymentForm.fee_record),
        amount: amount.toFixed(2),
        payment_method: paymentForm.payment_method,
        transaction_id: paymentForm.transaction_id.trim(),
        notes: paymentForm.notes.trim(),
      });

      toast.success("Payment recorded successfully.", {
        id: toastId,
      });

      setModal("");
      setSelectedFee(null);
      setPaymentForm({ ...initialPaymentForm });
      await loadDashboard();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleReceipt = async (paymentId) => {
    setError("");
    setReceipt(null);
    setModal("receipt");

    const toastId = toast.loading("Loading payment receipt...");

    try {
      const data = await getPaymentReceipt(paymentId);
      setReceipt(data);

      toast.success("Payment receipt loaded.", {
        id: toastId,
      });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message, { id: toastId });
    }
  };

  const handlePrintReceipt = () => {
    if (!receipt) {
      toast.error("There is no receipt to print.");
      return;
    }

    toast.info("Opening the print dialog...");
    window.print();
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearch("");
    toast.info(
      tab === "fees"
        ? "Showing fee records."
        : "Showing payment history."
    );
  };

  const handleSearchChange = (value) => {
    setSearch(value);
  };

  return (
    <main className="fee-page">
      <Toaster
        position="top-right"
        richColors
        closeButton
        duration={3500}
      />

      <header className="fee-header">
        <div>
          <p className="fee-eyebrow">EDUTRACK / ADMINISTRATION</p>
          <h1>Fee Management</h1>
          <p className="fee-subtitle">
            Manage student fees, record collections, and review payment history.
          </p>
        </div>

        <button
          className="fee-primary-btn"
          onClick={openFeeModal}
          type="button"
        >
          <span aria-hidden="true">＋</span> Assign Fee
        </button>
      </header>

      {error && !modal && (
        <div className="fee-alert fee-alert-error" role="alert">
          {error}
          <button
            onClick={() => setError("")}
            aria-label="Dismiss"
            type="button"
          >
            ×
          </button>
        </div>
      )}

      <section className="fee-stats">
        <article className="fee-stat-card">
          <div className="fee-stat-icon fee-icon-green">₹</div>
          <div>
            <p>Total fees</p>
            <h2>{money(summary.total_fee)}</h2>
            <span>{summary.total_records ?? fees.length} fee records</span>
          </div>
        </article>

        <article className="fee-stat-card">
          <div className="fee-stat-icon fee-icon-blue">↗</div>
          <div>
            <p>Amount collected</p>
            <h2>{money(summary.collected_amount)}</h2>
            <span>Recorded collections</span>
          </div>
        </article>

        <article className="fee-stat-card">
          <div className="fee-stat-icon fee-icon-orange">◷</div>
          <div>
            <p>Pending amount</p>
            <h2>{money(summary.pending_amount)}</h2>
            <span>Outstanding fees</span>
          </div>
        </article>

        <article className="fee-stat-card">
          <div className="fee-stat-icon fee-icon-red">!</div>
          <div>
            <p>Overdue records</p>
            <h2>{summary.overdue_records ?? 0}</h2>
            <span>Past their due date</span>
          </div>
        </article>
      </section>

      <section className="fee-workspace">
        <div className="fee-toolbar">
          <div className="fee-tabs">
            <button
              type="button"
              className={activeTab === "fees" ? "active" : ""}
              onClick={() => handleTabChange("fees")}
            >
              Fee records
            </button>

            <button
              type="button"
              className={activeTab === "payments" ? "active" : ""}
              onClick={() => handleTabChange("payments")}
            >
              Payment history
            </button>
          </div>

          <div className="fee-filters">
            <label className="fee-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) =>
                  handleSearchChange(event.target.value)
                }
                placeholder="Search students, courses, IDs..."
              />
            </label>

            {activeTab === "fees" && (
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  toast.info(
                    event.target.value === "all"
                      ? "Showing all fee statuses."
                      : `Filtering fees by ${event.target.value.replaceAll("_", " ")}.`
                  );
                }}
                aria-label="Filter by fee status"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="partially_paid">Partially paid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            )}

            <button
              type="button"
              className="fee-refresh-btn"
              onClick={() => loadDashboard(true)}
              disabled={loading}
              title="Refresh data"
              aria-label="Refresh fee data"
            >
              ↻
            </button>
          </div>
        </div>

        {loading ? (
          <div className="fee-state">
            <span className="fee-spinner" />
            Loading fee data...
          </div>
        ) : activeTab === "fees" ? (
          <div className="fee-table-wrap">
            <table className="fee-table">
              <thead>
                <tr>
                  <th>Fee ID</th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Total fee</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginatedRecords.map((fee) => {
                  const paid = Math.max(
                    0,
                    Number(fee.total_fee || 0) -
                      Number(fee.discount || 0) -
                      Number(fee.pending_amount || 0)
                  );

                  return (
                    <tr key={fee.id}>
                      <td className="fee-id">#{fee.id}</td>

                      <td>
                        <strong>
                          {fee.student_name || `Student ${fee.student}`}
                        </strong>
                        <small>Student ID: {fee.student}</small>
                      </td>

                      <td>{fee.course_name || "General fee"}</td>

                      <td>
                        {money(
                          fee.net_fee ??
                            Number(fee.total_fee || 0) -
                              Number(fee.discount || 0)
                        )}
                      </td>

                      <td className="fee-paid">{money(paid)}</td>

                      <td className="fee-pending">
                        {money(fee.pending_amount)}
                      </td>

                      <td>{fee.due_date || "—"}</td>

                      <td>
                        <span
                          className={`fee-status status-${fee.status || "pending"}`}
                        >
                          {(fee.status || "pending").replaceAll("_", " ")}
                        </span>
                      </td>

                      <td>
                        <div className="fee-row-actions">
                          {Number(fee.pending_amount) > 0 &&
                            !fee.is_archived && (
                              <button
                                type="button"
                                className="fee-action-btn"
                                onClick={() => openPaymentModal(fee)}
                              >
                                Collect
                              </button>
                            )}

                          <button
                            type="button"
                            className="fee-icon-btn"
                            title="View fee details"
                            onClick={() => {
                              setSelectedFee(fee);
                              setError("");
                              setModal("details");
                              toast.info(`Viewing fee record #${fee.id}.`);
                            }}
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredFees.length === 0 && (
                  <tr>
                    <td colSpan="9">
                      <div className="fee-empty">
                        <span>₹</span>
                        <strong>No fee records found</strong>
                        <p>Assign a fee or change your search filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="fee-table-wrap">
            <table className="fee-table">
              <thead>
                <tr>
                  <th>Payment ID</th>
                  <th>Student</th>
                  <th>Fee record</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Transaction ID</th>
                  <th>Paid at</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>

              <tbody>
                {paginatedRecords.map((payment) => (
                  <tr key={payment.id}>
                    <td className="fee-id">#{payment.id}</td>

                    <td>
                      {payment.student_name ||
                        `Student ${payment.student}`}
                    </td>

                    <td>
                      #{payment.fee_record_id || payment.fee_record}
                    </td>

                    <td className="fee-paid">{money(payment.amount)}</td>

                    <td>
                      {(payment.payment_method || "").replaceAll("_", " ")}
                    </td>

                    <td>{payment.transaction_id || "—"}</td>

                    <td>
                      {payment.paid_at
                        ? new Date(payment.paid_at).toLocaleString()
                        : "—"}
                    </td>

                    <td>
                      <span
                        className={`fee-status status-${payment.status || "unknown"}`}
                      >
                        {payment.status || "unknown"}
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="fee-action-btn"
                        onClick={() => handleReceipt(payment.id)}
                      >
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredPayments.length === 0 && (
                  <tr>
                    <td colSpan="9">
                      <div className="fee-empty">
                        <strong>No payments found</strong>
                        <p>Recorded payments will appear here.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <footer className="fee-table-footer fee-pagination-footer">
          <span className="fee-pagination-info">
            Showing {activeRecords.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
            –{Math.min(currentPage * itemsPerPage, activeRecords.length)} of {activeRecords.length} records
          </span>
          <div className="fee-pagination-controls" aria-label="Fee records pagination">
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1}>
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" className={currentPage === page ? "active" : ""} onClick={() => setCurrentPage(page)} aria-current={currentPage === page ? "page" : undefined}>
                {page}
              </button>
            ))}
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
              Next
            </button>
          </div>
          <span className="fee-pagination-brand">EduTrack · Fee Management</span>
        </footer>
      </section>

      {modal && (
        <div
          className="fee-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className={`fee-modal ${modal === "receipt" ? "receipt-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="fee-modal-title"
          >
            <header className="fee-modal-header">
              <div>
                <p className="fee-eyebrow">EDUTRACK / FINANCE</p>

                <h2 id="fee-modal-title">
                  {modal === "fee" && "Assign student fee"}
                  {modal === "payment" && "Record payment"}
                  {modal === "details" && "Fee details"}
                  {modal === "receipt" && "Payment receipt"}
                </h2>
              </div>

              <button
                type="button"
                className="fee-modal-close"
                onClick={closeModal}
                aria-label="Close dialog"
                disabled={saving}
              >
                ×
              </button>
            </header>

            {error && (
              <div className="fee-alert fee-alert-error" role="alert">
                {error}
              </div>
            )}

            {modal === "fee" && (
              <form className="fee-form" onSubmit={handleFeeSubmit}>
                <div className="fee-form-grid">
                  <label>
                    Student user ID *
                    <input
                      type="number"
                      min="1"
                      required
                      value={feeForm.student}
                      onChange={(event) =>
                        setFeeForm({
                          ...feeForm,
                          student: event.target.value,
                        })
                      }
                      placeholder="Enter student user ID"
                    />
                  </label>

                  <label>
                    Course ID (optional)
                    <input
                      type="number"
                      min="1"
                      value={feeForm.course}
                      onChange={(event) =>
                        setFeeForm({
                          ...feeForm,
                          course: event.target.value,
                        })
                      }
                      placeholder="Enter course ID"
                    />
                  </label>

                  <label>
                    Total fee (₹) *
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={feeForm.total_fee}
                      onChange={(event) =>
                        setFeeForm({
                          ...feeForm,
                          total_fee: event.target.value,
                        })
                      }
                      placeholder="e.g. 25000"
                    />
                  </label>

                  <label>
                    Discount (₹)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={feeForm.discount}
                      onChange={(event) =>
                        setFeeForm({
                          ...feeForm,
                          discount: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Payment plan
                    <select
                      value={feeForm.payment_type}
                      onChange={(event) =>
                        setFeeForm({
                          ...feeForm,
                          payment_type: event.target.value,
                        })
                      }
                    >
                      <option value="one_time">One-time payment</option>
                      <option value="installment">Installments</option>
                    </select>
                  </label>

                  <label>
                    Due date
                    <input
                      type="date"
                      value={feeForm.due_date}
                      onChange={(event) =>
                        setFeeForm({
                          ...feeForm,
                          due_date: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <label>
                  Notes
                  <textarea
                    rows="3"
                    value={feeForm.notes}
                    onChange={(event) =>
                      setFeeForm({
                        ...feeForm,
                        notes: event.target.value,
                      })
                    }
                    placeholder="Optional fee details..."
                  />
                </label>

                {feeForm.total_fee !== "" && (
                  <div className="fee-form-total">
                    <span>Fee after discount</span>
                    <strong>
                      {money(
                        Number(feeForm.total_fee || 0) -
                          Number(feeForm.discount || 0)
                      )}
                    </strong>
                  </div>
                )}

                <div className="fee-modal-actions">
                  <button
                    type="button"
                    className="fee-secondary-btn"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="fee-primary-btn"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Assign fee"}
                  </button>
                </div>
              </form>
            )}

            {modal === "payment" && selectedFee && (
              <form className="fee-form" onSubmit={handlePaymentSubmit}>
                <div className="fee-payment-context">
                  <div>
                    <span>Fee record</span>
                    <strong>#{selectedFee.id}</strong>
                  </div>

                  <div>
                    <span>Student</span>
                    <strong>
                      {selectedFee.student_name ||
                        `Student ${selectedFee.student}`}
                    </strong>
                  </div>

                  <div>
                    <span>Outstanding balance</span>
                    <strong className="fee-pending">
                      {money(selectedFee.pending_amount)}
                    </strong>
                  </div>
                </div>

                <label>
                  Payment amount (₹) *
                  <input
                    type="number"
                    min="0.01"
                    max={selectedFee.pending_amount}
                    step="0.01"
                    required
                    value={paymentForm.amount}
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        amount: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Payment method *
                  <select
                    value={paymentForm.payment_method}
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        payment_method: event.target.value,
                      })
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="online">Online</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label>
                  Transaction ID (optional)
                  <input
                    value={paymentForm.transaction_id}
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        transaction_id: event.target.value,
                      })
                    }
                    placeholder="Enter reference number"
                  />
                </label>

                <label>
                  Notes (optional)
                  <textarea
                    rows="2"
                    value={paymentForm.notes}
                    onChange={(event) =>
                      setPaymentForm({
                        ...paymentForm,
                        notes: event.target.value,
                      })
                    }
                  />
                </label>

                <div className="fee-modal-actions">
                  <button
                    type="button"
                    className="fee-secondary-btn"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="fee-primary-btn"
                    disabled={saving}
                  >
                    {saving ? "Recording..." : "Record payment"}
                  </button>
                </div>
              </form>
            )}

            {modal === "details" && selectedFee && (
              <div className="fee-details">
                {[
                  ["Fee record", `#${selectedFee.id}`],
                  [
                    "Student",
                    selectedFee.student_name ||
                      `Student ${selectedFee.student}`,
                  ],
                  ["Course", selectedFee.course_name || "General fee"],
                  ["Total fee", money(selectedFee.total_fee)],
                  ["Discount", money(selectedFee.discount)],
                  [
                    "Net fee",
                    money(
                      selectedFee.net_fee ??
                        Number(selectedFee.total_fee || 0) -
                          Number(selectedFee.discount || 0)
                    ),
                  ],
                  ["Pending", money(selectedFee.pending_amount)],
                  ["Due date", selectedFee.due_date || "Not set"],
                  ["Payment plan", selectedFee.payment_type],
                  ["Status", selectedFee.status || "pending"],
                  ["Notes", selectedFee.notes || "No notes"],
                ].map(([label, value]) => (
                  <div key={label} className="fee-detail-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}

                <div className="fee-modal-actions">
                  <button
                    type="button"
                    className="fee-secondary-btn"
                    onClick={closeModal}
                  >
                    Close
                  </button>

                  {Number(selectedFee.pending_amount) > 0 &&
                    !selectedFee.is_archived && (
                      <button
                        type="button"
                        className="fee-primary-btn"
                        onClick={() => openPaymentModal(selectedFee)}
                      >
                        Collect payment
                      </button>
                    )}
                </div>
              </div>
            )}

            {modal === "receipt" && (
              <div className="fee-receipt-content">
                {receipt ? (
                  <>
                    <div className="fee-receipt-brand">
                      <div className="fee-brand-mark">E</div>
                      <div>
                        <strong>EduTrack</strong>
                        <span>Payment confirmation</span>
                      </div>
                    </div>

                    <div className="fee-receipt-success">
                      <span>✓</span>
                      <h3>Payment receipt</h3>
                      <p>{receipt.receipt_number}</p>
                    </div>

                    {[
                      ["Student", receipt.student],
                      ["Payment ID", `#${receipt.payment_id}`],
                      ["Fee record", `#${receipt.fee_record_id}`],
                      ["Amount received", money(receipt.amount)],
                      ["Method", receipt.payment_method],
                      ["Transaction ID", receipt.transaction_id || "—"],
                      ["Payment status", receipt.status],
                      [
                        "Payment date",
                        receipt.paid_at
                          ? new Date(receipt.paid_at).toLocaleString()
                          : "—",
                      ],
                    ].map(([label, value]) => (
                      <div className="fee-detail-row" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}

                    <div className="fee-modal-actions no-print">
                      <button
                        type="button"
                        className="fee-secondary-btn"
                        onClick={closeModal}
                      >
                        Close
                      </button>

                      <button
                        type="button"
                        className="fee-primary-btn"
                        onClick={handlePrintReceipt}
                      >
                        Print receipt
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="fee-state">
                    {error || "Loading receipt..."}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
