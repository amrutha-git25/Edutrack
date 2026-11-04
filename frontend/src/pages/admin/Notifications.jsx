import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Clock3,
  Inbox,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import notificationsAPI from "../../api/notificationsApi";
import "./Notifications.css";

const FILTERS = ["All", "Unread", "Read"];

function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    "Unable to complete the request. Please try again."
  );
}

function formatDate(value) {
  if (!value) return "Recently";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Recently";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getTypeLabel(type) {
  const labels = {
    general: "General",
    course: "Course",
    assignment: "Assignment",
    exam: "Assessment",
    payment: "Payment",
    system: "System",
    security: "Security",
  };

  return labels[String(type || "general").toLowerCase()] || type || "General";
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  // Compose notification state
  const [showComposer, setShowComposer] = useState(false);
  const [sending, setSending] = useState(false);
  const [recipientMode, setRecipientMode] = useState("all");
  const [recipientIdsText, setRecipientIdsText] = useState("");

  const [draft, setDraft] = useState({
    title: "",
    message: "",
    notification_type: "general",
  });

  const loadNotifications = useCallback(
    async (showRefresh = false, showSuccess = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await notificationsAPI.getAll();
        const payload = response.data;

        const records = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.results)
            ? payload.results
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

        setNotifications(records);

        if (showSuccess) {
          toast.success("Notifications refreshed.");
        }
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  const readCount = notifications.length - unreadCount;

  const filteredNotifications = useMemo(() => {
    const term = search.trim().toLowerCase();

    return notifications.filter((item) => {
      const matchesFilter =
        activeFilter === "All" ||
        (activeFilter === "Unread" && !item.is_read) ||
        (activeFilter === "Read" && item.is_read);

      const matchesSearch =
        !term ||
        String(item.title || "").toLowerCase().includes(term) ||
        String(item.message || "").toLowerCase().includes(term) ||
        String(getTypeLabel(item.notification_type))
          .toLowerCase()
          .includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [notifications, activeFilter, search]);

  const markAsRead = async (notification, showSuccess = false) => {
    if (
      !notification ||
      notification.is_read ||
      updatingId === notification.id
    ) {
      return notification;
    }

    setUpdatingId(notification.id);

    try {
      const response = await notificationsAPI.markAsRead(notification.id);

      const updated =
        response.data?.data ||
        response.data?.notification || {
          ...notification,
          is_read: true,
        };

      const finalNotification = {
        ...notification,
        ...updated,
        is_read: true,
      };

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? finalNotification : item
        )
      );

      setSelectedNotification((current) =>
        current?.id === notification.id ? finalNotification : current
      );

      if (showSuccess) {
        toast.success("Notification marked as read.");
      }

      return finalNotification;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return null;
    } finally {
      setUpdatingId(null);
    }
  };

  const openNotification = async (notification) => {
    setSelectedNotification(notification);

    if (!notification.is_read) {
      await markAsRead(notification);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter((item) => !item.is_read);

    if (!unread.length) {
      toast.info("There are no unread notifications.");
      return;
    }

    let completed = 0;

    for (const item of unread) {
      const result = await markAsRead(item);

      if (result) {
        completed += 1;
      }
    }

    if (completed === unread.length) {
      toast.success("All notifications marked as read.");
    } else if (completed > 0) {
      toast.warning(
        `Marked ${completed} of ${unread.length} notifications as read.`
      );
    }
  };

  const closeDetails = () => setSelectedNotification(null);

  const handleSendNotification = async (event) => {
    event.preventDefault();

    const title = draft.title.trim();
    const message = draft.message.trim();

    if (!title || !message) {
      toast.error("Please enter both a subject and a message.");
      return;
    }

    const recipientIds =
      recipientMode === "selected"
        ? recipientIdsText
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .map(Number)
        : [];

    if (
      recipientMode === "selected" &&
      (!recipientIds.length ||
        recipientIds.some((id) => !Number.isInteger(id) || id <= 0))
    ) {
      toast.error(
        "Enter valid user IDs separated by commas, for example: 12, 15, 18."
      );
      return;
    }

    setSending(true);

    try {
      const response = await notificationsAPI.sendNotification({
        title,
        message,
        notification_type: draft.notification_type,
        send_to_all_students: recipientMode === "all",
        recipient_ids: recipientMode === "selected" ? recipientIds : [],
      });

      const result = response.data || {};

      const sent = Number(result.emails_sent || 0);
      const created = Number(result.notifications_created || 0);
      const failed = Number(result.email_failures || 0);
      const missing = Number(result.recipients_without_email || 0);

      const successMessage =
        `Created ${created} in-app notification(s). Emails sent: ${sent}.` +
        (failed ? ` Email failures: ${failed}.` : "") +
        (missing ? ` Users without email: ${missing}.` : "");

      if (failed || missing) {
        toast.warning(successMessage, { duration: 6000 });
      } else {
        toast.success(successMessage, { duration: 5000 });
      }

      setDraft({
        title: "",
        message: "",
        notification_type: "general",
      });

      setRecipientIdsText("");
      setRecipientMode("all");

      // Refresh the list without showing a second success toast.
      await loadNotifications(true, false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="notifications-page">
      {/* Page heading */}
      <header className="notifications-heading">
        <div>
          <div className="notifications-eyebrow">
            <Sparkles size={15} aria-hidden="true" />
            ADMIN WORKSPACE
          </div>

          <h1>Notifications</h1>

          <p className="notifications-subtitle">
            Stay on top of platform updates and important activity.
          </p>
        </div>

        <button
          type="button"
          className="notifications-refresh"
          onClick={() => loadNotifications(true, true)}
          disabled={loading || refreshing}
          aria-label="Refresh notifications"
        >
          <RefreshCw
            size={17}
            className={refreshing ? "notifications-spinning" : ""}
          />
          <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
        </button>
      </header>

      {/* Compose notification section */}
      <div className="notifications-top-actions">
        <div className="notifications-compose-intro">
          <div className="notifications-compose-icon">
            <Mail size={19} />
          </div>

          <div>
            <strong>Send an email notification</strong>
            <p>
              Share an update with all students or selected user IDs.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="notifications-compose-toggle"
          onClick={() => setShowComposer((current) => !current)}
          aria-expanded={showComposer}
        >
          {showComposer ? <X size={17} /> : <Send size={17} />}
          {showComposer ? "Close composer" : "Compose notification"}
        </button>
      </div>

      {showComposer && (
        <form
          className="notifications-compose-card"
          onSubmit={handleSendNotification}
        >
          <div className="notifications-compose-card-heading">
            <div>
              <span className="notifications-compose-kicker">
                NEW MESSAGE
              </span>

              <h2>Compose notification</h2>

              <p>
                Recipients receive an email and an in-app notification.
              </p>
            </div>

            <div className="notifications-compose-heading-icon">
              <Send size={20} />
            </div>
          </div>

          <div className="notifications-compose-grid">
            <label className="notifications-field">
              <span>
                Subject <span className="notifications-required">*</span>
              </span>

              <input
                type="text"
                maxLength={200}
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="e.g. Assignment deadline reminder"
                required
              />
            </label>

            <label className="notifications-field">
              <span>Notification type</span>

              <select
                value={draft.notification_type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    notification_type: event.target.value,
                  }))
                }
              >
                <option value="general">General</option>
                <option value="course">Course</option>
                <option value="assignment">Assignment</option>
                <option value="exam">Assessment</option>
                <option value="payment">Payment</option>
                <option value="system">System</option>
              </select>
            </label>

            <fieldset className="notifications-recipient-fieldset">
              <legend>Recipients</legend>

              <label className="notifications-recipient-option">
                <input
                  type="radio"
                  name="notification-recipients"
                  value="all"
                  checked={recipientMode === "all"}
                  onChange={() => setRecipientMode("all")}
                />

                <span className="notifications-recipient-option-icon">
                  <Users size={17} />
                </span>

                <span>
                  <strong>All active students</strong>
                  <small>
                    Send to active accounts with the student role.
                  </small>
                </span>
              </label>

              <label className="notifications-recipient-option">
                <input
                  type="radio"
                  name="notification-recipients"
                  value="selected"
                  checked={recipientMode === "selected"}
                  onChange={() => setRecipientMode("selected")}
                />

                <span className="notifications-recipient-option-icon">
                  <Mail size={17} />
                </span>

                <span>
                  <strong>Selected users</strong>
                  <small>Enter user IDs separated by commas.</small>
                </span>
              </label>

              {recipientMode === "selected" && (
                <label className="notifications-field notifications-recipient-ids">
                  <span>
                    User IDs{" "}
                    <span className="notifications-required">*</span>
                  </span>

                  <input
                    type="text"
                    value={recipientIdsText}
                    onChange={(event) =>
                      setRecipientIdsText(event.target.value)
                    }
                    placeholder="e.g. 12, 15, 18"
                    required
                  />
                </label>
              )}
            </fieldset>

            <label className="notifications-field notifications-field--full">
              <span>
                Message <span className="notifications-required">*</span>
              </span>

              <textarea
                rows={5}
                value={draft.message}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    message: event.target.value,
                  }))
                }
                placeholder="Write the notification message..."
                required
              />
            </label>
          </div>

          <div className="notifications-compose-footer">
            <p>
              <ShieldAlert size={14} />
              Emails are sent by the configured Django email server.
            </p>

            <button
              type="submit"
              className="notifications-send-button"
              disabled={sending}
            >
              {sending ? (
                <RefreshCw
                  size={16}
                  className="notifications-spinning"
                />
              ) : (
                <Send size={16} />
              )}

              {sending ? "Sending..." : "Send notification"}
            </button>
          </div>
        </form>
      )}

      {/* Notification statistics */}
      <div className="notifications-stats">
        <article className="notification-stat-card">
          <div className="notification-stat-icon notification-stat-icon--total">
            <Bell size={20} />
          </div>

          <div>
            <span className="notification-stat-label">
              Total notifications
            </span>
            <strong>{notifications.length}</strong>
          </div>
        </article>

        <article className="notification-stat-card">
          <div className="notification-stat-icon notification-stat-icon--unread">
            <Inbox size={20} />
          </div>

          <div>
            <span className="notification-stat-label">Unread</span>
            <strong>{unreadCount}</strong>
          </div>
        </article>

        <article className="notification-stat-card">
          <div className="notification-stat-icon notification-stat-icon--read">
            <CheckCheck size={20} />
          </div>

          <div>
            <span className="notification-stat-label">Read</span>
            <strong>{readCount}</strong>
          </div>
        </article>
      </div>

      {/* Notifications list */}
      <div className="notifications-content">
        <div className="notifications-toolbar">
          <div
            className="notifications-tabs"
            role="tablist"
            aria-label="Notification filter"
          >
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter}
                className={`notifications-tab ${
                  activeFilter === filter ? "is-active" : ""
                }`}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}

                {filter === "Unread" && unreadCount > 0 && (
                  <span className="notifications-tab-count">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <label className="notifications-search">
            <Search size={17} aria-hidden="true" />

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notifications..."
              aria-label="Search notifications"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </label>
        </div>

        <div className="notifications-list-heading">
          <div>
            <h2>{activeFilter} notifications</h2>

            <p>
              {loading
                ? "Getting your latest updates..."
                : `${filteredNotifications.length} ${
                    filteredNotifications.length === 1
                      ? "notification"
                      : "notifications"
                  }`}
            </p>
          </div>

          {unreadCount > 0 && !loading && (
            <button
              type="button"
              className="notifications-mark-all"
              onClick={markAllAsRead}
              disabled={Boolean(updatingId)}
            >
              <Check size={16} />
              Mark all as read
            </button>
          )}
        </div>

        {loading ? (
          <div className="notifications-state">
            <span className="notifications-loader" />
            <strong>Loading notifications</strong>
            <p>Please wait while we fetch your updates.</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="notifications-state">
            <div className="notifications-empty-icon">
              <Inbox size={28} />
            </div>

            <strong>
              {search
                ? "No matching notifications"
                : activeFilter === "Unread"
                  ? "You're all caught up"
                  : "No notifications yet"}
            </strong>

            <p>
              {search
                ? "Try another search term."
                : activeFilter === "Unread"
                  ? "New updates will appear here when they arrive."
                  : "Notifications will appear here when the platform has updates for you."}
            </p>

            {search && (
              <button
                type="button"
                className="notifications-secondary-button"
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="notifications-list">
            {filteredNotifications.map((notification) => (
              <article
                key={notification.id}
                className={`notification-item ${
                  !notification.is_read ? "is-unread" : ""
                }`}
              >
                <button
                  type="button"
                  className="notification-item-main"
                  onClick={() => openNotification(notification)}
                  aria-label={`Open notification: ${notification.title}`}
                >
                  <span
                    className={`notification-type-icon notification-type-icon--${String(
                      notification.notification_type || "general"
                    )
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]/g, "")}`}
                  >
                    <Bell size={19} />
                  </span>

                  <span className="notification-item-copy">
                    <span className="notification-item-topline">
                      <strong>{notification.title}</strong>

                      {!notification.is_read && (
                        <span
                          className="notification-unread-dot"
                          aria-label="Unread"
                        />
                      )}
                    </span>

                    <span className="notification-message">
                      {notification.message}
                    </span>

                    <span className="notification-item-meta">
                      <span className="notification-type-label">
                        {getTypeLabel(notification.notification_type)}
                      </span>

                      <span className="notification-meta-separator">
                        •
                      </span>

                      <span className="notification-time">
                        <Clock3 size={13} />
                        {formatDate(notification.created_at)}
                      </span>
                    </span>
                  </span>
                </button>

                <div className="notification-item-actions">
                  {!notification.is_read ? (
                    <button
                      type="button"
                      className="notification-read-action"
                      onClick={() => markAsRead(notification, true)}
                      disabled={updatingId === notification.id}
                      title="Mark as read"
                      aria-label={`Mark ${notification.title} as read`}
                    >
                      <Check size={17} />
                    </button>
                  ) : (
                    <span className="notification-read-label">
                      <CheckCheck size={15} />
                      Read
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="notifications-footer">
          <span>
            <span className="notifications-footer-dot" />
            EduTrack notification center
          </span>

          <span>Updates for your admin account</span>
        </footer>
      </div>

      {/* Notification details modal */}
      {selectedNotification && (
        <div
          className="notification-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDetails();
            }
          }}
        >
          <section
            className="notification-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-modal-title"
          >
            <header className="notification-modal-header">
              <div className="notification-modal-icon">
                <Bell size={21} />
              </div>

              <button
                type="button"
                className="notification-modal-close"
                onClick={closeDetails}
                aria-label="Close notification details"
              >
                <X size={20} />
              </button>
            </header>

            <span className="notification-modal-kicker">
              {getTypeLabel(selectedNotification.notification_type)}{" "}
              notification
            </span>

            <h2 id="notification-modal-title">
              {selectedNotification.title}
            </h2>

            <p className="notification-modal-message">
              {selectedNotification.message}
            </p>

            <div className="notification-modal-time">
              <Clock3 size={15} />
              {formatDate(selectedNotification.created_at)}
            </div>

            <div className="notification-modal-footer">
              <span
                className={`notification-status-pill ${
                  selectedNotification.is_read ? "is-read" : "is-unread"
                }`}
              >
                {selectedNotification.is_read ? "Read" : "Unread"}
              </span>

              <button
                type="button"
                className="notifications-primary-button"
                onClick={closeDetails}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
