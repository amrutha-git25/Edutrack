import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Search,
  RefreshCw,
  Send,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  Settings2,
  X,
  Inbox,
  CircleCheck,
} from "lucide-react";
import { toast } from "sonner";
import mentorApi from "../../api/mentorApi";
import "./Notifications.css";

const FILTERS = ["all", "unread", "read"];

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function notificationIcon(type = "") {
  const value = type.toLowerCase();

  if (value.includes("course")) return BookOpen;

  if (value.includes("class") || value.includes("live")) {
    return CalendarDays;
  }

  if (value.includes("assignment")) return ClipboardList;

  if (value.includes("exam") || value.includes("assessment")) {
    return FileText;
  }

  if (value.includes("student")) return GraduationCap;
  if (value.includes("system")) return Settings2;

  return Bell;
}

function unwrapNotification(response) {
  const body = response?.data ?? response ?? {};
  const payload = body?.data ?? body;

  if (payload?.notification) return payload.notification;

  if (payload && !Array.isArray(payload) && payload.id != null) {
    return payload;
  }

  return null;
}

function unwrapNotificationList(response) {
  const body = response?.data ?? response ?? {};
  const payload = body?.data ?? body;

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.notifications)) return payload.notifications;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(body?.notifications)) return body.notifications;
  if (Array.isArray(body?.results)) return body.results;

  return [];
}

function getUnreadCount(response, notificationList) {
  const body = response?.data ?? response ?? {};
  const payload = body?.data ?? body;
  const count = payload?.unread_count ?? body?.unread_count;

  if (count !== undefined && count !== null && Number.isFinite(Number(count))) {
    return Number(count);
  }

  return notificationList.filter((item) => !item.is_read).length;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  // Send notification modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendForm, setSendForm] = useState({
    title: "",
    message: "",
    send_to_all_students: true,
  });

  const updateSendForm = (event) => {
    const { name, value, checked, type } = event.target;

    setSendForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Load notifications from the backend
  const loadNotifications = useCallback(
    async (quiet = false) => {
      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await mentorApi.get("mentor/notifications/", {
          params: {
            status: filter,
            ...(search.trim() ? { search: search.trim() } : {}),
          },
        });

        const notificationList = unwrapNotificationList(response);

        setNotifications(notificationList);
        setUnreadCount(getUnreadCount(response, notificationList));

        return true;
      } catch (err) {
        console.error("Mentor notifications error:", err);

        toast.error(
          err.response?.data?.message ||
            err.response?.data?.detail ||
            "Unable to load notifications. Please try again."
        );

        return false;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, search]
  );

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Refresh notifications manually
  const handleRefresh = async () => {
    const refreshed = await loadNotifications(true);

    if (refreshed) {
      toast.success("Notifications refreshed.");
    }
  };

  // Send a notification to assigned-course students
  const handleSendNotification = async (event) => {
    event.preventDefault();

    const title = sendForm.title.trim();
    const message = sendForm.message.trim();

    if (!title || !message) {
      toast.error("Enter both a notification title and message.");
      return;
    }

    if (!sendForm.send_to_all_students) {
      toast.error(
        "Select the assigned-course students option before sending."
      );
      return;
    }

    try {
      setSending(true);

      await mentorApi.post("mentor/notifications/send/", {
        title,
        message,
        notification_type: "general",
        send_to_all_students: true,
      });

      toast.success("Notification sent successfully.");

      setSendForm({
        title: "",
        message: "",
        send_to_all_students: true,
      });

      setShowSendModal(false);

      // Refresh the list without displaying a second success toast.
      await loadNotifications(true);
    } catch (err) {
      console.error("Send mentor notification error:", err);

      toast.error(
        err.response?.data?.message ||
          err.response?.data?.detail ||
          "Unable to send the notification. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  // Open a notification and update its read state
  const openNotification = async (item) => {
    try {
      const response = await mentorApi.get(
        `mentor/notifications/${item.id}/`
      );

      const notification = unwrapNotification(response) || {
        ...item,
        is_read: true,
      };

      setSelectedNotification({
        ...item,
        ...notification,
        is_read: true,
      });

      setNotifications((previous) =>
        previous.map((entry) =>
          String(entry.id) === String(item.id)
            ? { ...entry, ...notification, is_read: true }
            : entry
        )
      );

      setUnreadCount((previous) =>
        item.is_read ? previous : Math.max(0, previous - 1)
      );

      toast.success("Notification opened successfully.");
    } catch (err) {
      console.error("Open mentor notification error:", err);

      toast.error(
        err.response?.data?.message ||
          err.response?.data?.detail ||
          "Unable to open this notification."
      );
    }
  };

  // Mark one notification as read
  const markOneAsRead = async (item) => {
    if (item.is_read) return;

    try {
      const response = await mentorApi.patch(
        `mentor/notifications/${item.id}/read/`
      );

      const notification = unwrapNotification(response);

      setNotifications((previous) =>
        previous.map((entry) =>
          String(entry.id) === String(item.id)
            ? { ...entry, ...(notification || {}), is_read: true }
            : entry
        )
      );

      setSelectedNotification((previous) =>
        previous && String(previous.id) === String(item.id)
          ? { ...previous, ...(notification || {}), is_read: true }
          : previous
      );

      setUnreadCount((previous) => Math.max(0, previous - 1));

      toast.success("Notification marked as read.");
    } catch (err) {
      console.error("Mark notification read error:", err);

      toast.error(
        err.response?.data?.message ||
          err.response?.data?.detail ||
          "Unable to mark this notification as read."
      );
    }
  };

  // Mark every unread notification as read
  const markAllAsRead = async () => {
    if (!unreadCount || markingAll) return;

    setMarkingAll(true);

    try {
      await mentorApi.post("mentor/notifications/read-all/");

      setNotifications((previous) =>
        previous.map((item) => ({ ...item, is_read: true }))
      );

      setSelectedNotification((previous) =>
        previous ? { ...previous, is_read: true } : previous
      );

      setUnreadCount(0);

      toast.success("All notifications marked as read.");

      if (filter === "unread") {
        setLoading(true);
        await loadNotifications();
      }
    } catch (err) {
      console.error("Mark all mentor notifications read error:", err);

      toast.error(
        err.response?.data?.message ||
          err.response?.data?.detail ||
          "Unable to mark all notifications as read."
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const filteredNotifications = useMemo(() => {
    const query = search.trim().toLowerCase();

    return notifications.filter((item) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "read" && item.is_read) ||
        (filter === "unread" && !item.is_read);

      const matchesSearch =
        !query ||
        [item.title, item.message, item.notification_type]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      return matchesFilter && matchesSearch;
    });
  }, [notifications, filter, search]);

  return (
    <main className="mn-page">
      <header className="mn-header">
        <div>
          <span className="mn-eyebrow">
            <Bell size={15} />
            MENTOR WORKSPACE
          </span>

          <h1>Notifications</h1>

          <p>
            Stay updated on your courses, classes, assignments, and students.
          </p>
        </div>

        <div className="mn-header-actions">
          <button
            type="button"
            className="mn-send-notification"
            onClick={() => setShowSendModal(true)}
          >
            <Send size={16} />
            Send notification
          </button>

          <button
            type="button"
            className="mn-refresh"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={16}
              className={refreshing ? "mn-spinning" : ""}
            />
            Refresh
          </button>
        </div>
      </header>

      <section className="mn-summary">
        <div className="mn-summary-icon">
          <Bell size={23} />
        </div>

        <div className="mn-summary-copy">
          <span>Unread notifications</span>
          <strong>{unreadCount}</strong>

          <small>
            {unreadCount === 1
              ? "One notification needs your attention."
              : `${unreadCount} notifications need your attention.`}
          </small>
        </div>

        <div className="mn-summary-actions">
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={!unreadCount || markingAll}
          >
            <CheckCheck size={16} />
            {markingAll ? "Updating..." : "Mark all as read"}
          </button>
        </div>
      </section>

      <section className="mn-panel">
        <div className="mn-panel-heading">
          <div>
            <h2>Your activity</h2>
            <p>Updates and alerts relevant to your mentor account.</p>
          </div>

          <span className="mn-total">
            {filteredNotifications.length} shown
          </span>
        </div>

        <div className="mn-toolbar">
          <div
            className="mn-filters"
            role="group"
            aria-label="Notification filter"
          >
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "is-active" : ""}
                onClick={() => setFilter(value)}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}

                {value === "unread" && unreadCount > 0 && (
                  <span className="mn-filter-count">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          <label className="mn-search">
            <Search size={17} />

            <input
              type="search"
              placeholder="Search notifications..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search notifications"
            />
          </label>
        </div>

        {loading ? (
          <div className="mn-state">
            <span className="mn-loader" />
            <p>Loading notifications...</p>
          </div>
        ) : filteredNotifications.length ? (
          <div className="mn-list">
            {filteredNotifications.map((item) => {
              const Icon = notificationIcon(item.notification_type);

              return (
                <article
                  className={`mn-item ${!item.is_read ? "is-unread" : ""}`}
                  key={item.id}
                >
                  <button
                    type="button"
                    className="mn-item-main"
                    onClick={() => openNotification(item)}
                  >
                    <span className="mn-item-icon">
                      <Icon size={20} />
                    </span>

                    <span className="mn-item-copy">
                      <span className="mn-item-title-line">
                        <strong>{item.title}</strong>

                        {!item.is_read && (
                          <span className="mn-unread-label">New</span>
                        )}
                      </span>

                      <span className="mn-item-message">
                        {item.message}
                      </span>

                      <span className="mn-item-meta">
                        <span>
                          {String(item.notification_type || "general")
                            .replaceAll("_", " ")
                            .replaceAll("-", " ")}
                        </span>

                        <span className="mn-meta-dot">·</span>

                        <time>{formatDate(item.created_at)}</time>
                      </span>
                    </span>
                  </button>

                  <div className="mn-item-actions">
                    {!item.is_read ? (
                      <button
                        type="button"
                        className="mn-read-button"
                        onClick={() => markOneAsRead(item)}
                        title="Mark as read"
                        aria-label={`Mark ${item.title} as read`}
                      >
                        <Check size={17} />
                      </button>
                    ) : (
                      <span
                        className="mn-read-indicator"
                        title="Read"
                        aria-label="Read"
                      >
                        <CircleCheck size={17} />
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mn-state mn-empty">
            <span className="mn-empty-icon">
              <Inbox size={27} />
            </span>

            <h3>No notifications found</h3>

            <p>
              {search
                ? "Try another search term."
                : filter === "unread"
                  ? "You're all caught up. There are no unread notifications."
                  : "Notifications will appear here when there are updates for your account."}
            </p>

            {(search || filter !== "all") && (
              <button
                type="button"
                className="mn-clear-filters"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>

      {/* Send notification modal */}
      {showSendModal && (
        <div
          className="mn-modal-backdrop mn-send-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !sending) {
              setShowSendModal(false);
            }
          }}
        >
          <section
            className="mn-modal mn-send-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mn-send-modal-title"
          >
            <header className="mn-modal-header">
              <div className="mn-send-heading">
                <span className="mn-modal-icon">
                  <Send size={20} />
                </span>

                <div>
                  <h2 id="mn-send-modal-title">Send notification</h2>
                  <p>
                    Share an update with students in your assigned courses.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => !sending && setShowSendModal(false)}
                disabled={sending}
                aria-label="Close send notification dialog"
              >
                <X size={19} />
              </button>
            </header>

            <form onSubmit={handleSendNotification}>
              <label className="mn-send-field">
                <span>Notification title</span>

                <input
                  type="text"
                  name="title"
                  value={sendForm.title}
                  onChange={updateSendForm}
                  placeholder="e.g. Assignment deadline reminder"
                  maxLength={200}
                  required
                />
              </label>

              <label className="mn-send-field">
                <span>Message</span>

                <textarea
                  name="message"
                  value={sendForm.message}
                  onChange={updateSendForm}
                  placeholder="Write your message to students..."
                  rows={5}
                  required
                />
              </label>

              <label className="mn-send-recipient">
                <input
                  type="checkbox"
                  name="send_to_all_students"
                  checked={sendForm.send_to_all_students}
                  onChange={updateSendForm}
                />

                <span>
                  Send to students in my assigned courses
                  <small>
                    Only students associated with your assigned courses should
                    receive this notification.
                  </small>
                </span>
              </label>

              <footer className="mn-send-actions">
                <button
                  type="button"
                  className="mn-send-cancel"
                  onClick={() => setShowSendModal(false)}
                  disabled={sending}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="mn-send-notification"
                  disabled={sending}
                >
                  <Send size={16} />
                  {sending ? "Sending..." : "Send notification"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* Notification details modal */}
      {selectedNotification && (
        <div
          className="mn-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedNotification(null);
            }
          }}
        >
          <section
            className="mn-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mn-modal-title"
          >
            <header className="mn-modal-header">
              <span className="mn-modal-icon">
                <Bell size={21} />
              </span>

              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                aria-label="Close notification"
              >
                <X size={19} />
              </button>
            </header>

            <span className="mn-modal-type">
              {String(selectedNotification.notification_type || "general")
                .replaceAll("_", " ")
                .replaceAll("-", " ")}
            </span>

            <h2 id="mn-modal-title">{selectedNotification.title}</h2>

            <p className="mn-modal-message">
              {selectedNotification.message}
            </p>

            <span className="mn-modal-date">
              {formatDate(selectedNotification.created_at)}
            </span>

            <footer className="mn-modal-footer">
              <span className="mn-modal-read-status">
                <CheckCheck size={16} />
                {selectedNotification.is_read ? "Read" : "Unread"}
              </span>

              {!selectedNotification.is_read && (
                <button
                  type="button"
                  onClick={() => markOneAsRead(selectedNotification)}
                >
                  <Check size={16} />
                  Mark as read
                </button>
              )}

              <button
                type="button"
                className="mn-modal-close"
                onClick={() => setSelectedNotification(null)}
              >
                Close
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}