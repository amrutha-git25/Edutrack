
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Inbox,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import "./StudentNotifications.css";

const API_URL = "http://127.0.0.1:8000/api/notifications/";

function getAccessToken() {
  return (
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    ""
  );
}

async function apiRequest(path = "", options = {}) {
  const token = getAccessToken();

  if (!token) {
    throw new Error("Your login session is missing. Please log in again.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => null);

  if (response.status === 401) {
    throw new Error(
      "Your session has expired or is invalid. Please log in again."
    );
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.detail ||
        `Request failed (${response.status}).`
    );
  }

  return payload;
}

function getNotificationList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatType(type) {
  if (!type) return "General";

  return String(type)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StudentNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [selectedNotification, setSelectedNotification] = useState(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(
    async (quiet = false) => {
      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({
          filter: activeFilter,
        });

        if (searchText.trim()) {
          params.set("search", searchText.trim());
        }

        const payload = await apiRequest(`?${params.toString()}`);
        const list = getNotificationList(payload);

        setNotifications(list);

        if (payload?.meta?.unread_count != null) {
          setUnreadCount(Number(payload.meta.unread_count));
        } else {
          setUnreadCount(
            list.filter((notification) => !notification.is_read).length
          );
        }

        if (quiet) {
          toast.success("Notifications refreshed successfully.");
        }
      } catch (err) {
        toast.error(
          err.message || "Unable to load notifications. Please try again."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeFilter, searchText]
  );

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markOneAsRead = async (notification) => {
    if (notification.is_read) return notification;

    try {
      const payload = await apiRequest(`${notification.id}/read/`, {
        method: "PATCH",
      });

      const updated = {
        ...notification,
        ...(payload?.data || {}),
        is_read: true,
      };

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? updated : item
        )
      );

      setUnreadCount((count) => Math.max(0, count - 1));

      setSelectedNotification((current) =>
        current?.id === notification.id ? updated : current
      );

      toast.success("Notification marked as read.");

      return updated;
    } catch (err) {
      toast.error(
        err.message || "Unable to mark notification as read."
      );

      return notification;
    }
  };

  const openNotification = async (notification) => {
    setSelectedNotification(notification);

    let currentNotification = notification;

    if (!notification.is_read) {
      currentNotification = await markOneAsRead(notification);
    }

    try {
      const payload = await apiRequest(`${notification.id}/`);

      if (payload?.data) {
        currentNotification = payload.data;

        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? payload.data : item
          )
        );

        setSelectedNotification(payload.data);
      }
    } catch (err) {
      // Keep the list data available if the detail endpoint fails.
      setSelectedNotification(currentNotification);

      toast.error(
        err.message || "Could not load the latest notification details."
      );
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0 || markingAll) return;

    setMarkingAll(true);

    try {
      await apiRequest("read-all/", {
        method: "POST",
      });

      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          is_read: true,
        }))
      );

      setSelectedNotification((current) =>
        current ? { ...current, is_read: true } : null
      );

      setUnreadCount(0);

      toast.success("All notifications marked as read.");
    } catch (err) {
      toast.error(
        err.message || "Unable to mark all notifications as read."
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const filters = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
    { id: "read", label: "Read" },
  ];

  return (
    <main className="student-notifications">
      <header className="sn-page-header">
        <div className="sn-heading-copy">
          <div className="sn-eyebrow">
            <Bell size={15} />
            STUDENT CENTER
          </div>

          <h1>Notifications</h1>

          <p>
            Stay up to date with your courses, assessments, and learning
            activity.
          </p>
        </div>

        <button
          type="button"
          className="sn-button sn-button-secondary"
          onClick={() => loadNotifications(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw
            size={16}
            className={refreshing ? "sn-spinning" : ""}
          />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section className="sn-summary-row">
        <article className="sn-summary-card">
          <span className="sn-summary-icon">
            <Bell size={19} />
          </span>

          <div>
            <span className="sn-summary-label">
              Notifications shown
            </span>
            <strong>{loading ? "—" : notifications.length}</strong>
          </div>
        </article>

        <article className="sn-summary-card">
          <span className="sn-summary-icon">
            <Inbox size={19} />
          </span>

          <div>
            <span className="sn-summary-label">
              Unread notifications
            </span>
            <strong>{loading ? "—" : unreadCount}</strong>
          </div>
        </article>
      </section>

      <section className="sn-content-card">
        <div className="sn-toolbar">
          <div
            className="sn-filter-tabs"
            role="tablist"
            aria-label="Notification filters"
          >
            {filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter.id}
                className={`sn-filter-tab ${
                  activeFilter === filter.id ? "is-active" : ""
                }`}
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.label}

                {filter.id === "unread" && unreadCount > 0 && (
                  <span className="sn-tab-count">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          <label className="sn-search">
            <Search size={17} />

            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search notifications"
              aria-label="Search notifications"
            />

            {searchText && (
              <button
                type="button"
                className="sn-search-clear"
                onClick={() => setSearchText("")}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </label>

          <button
            type="button"
            className="sn-button sn-button-primary"
            onClick={markAllAsRead}
            disabled={unreadCount === 0 || markingAll}
          >
            <CheckCheck size={16} />
            {markingAll ? "Marking..." : "Mark all read"}
          </button>
        </div>

        {loading ? (
          <div className="sn-state">
            <span className="sn-loader" />
            <p>Loading your notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="sn-state sn-empty-state">
            <span className="sn-empty-icon">
              <Inbox size={25} />
            </span>

            <h2>
              {searchText
                ? "No matching notifications"
                : "You're all caught up"}
            </h2>

            <p>
              {searchText
                ? "Try a different search term."
                : activeFilter === "unread"
                  ? "You have no unread notifications right now."
                  : "New learning updates will appear here."}
            </p>

            {searchText && (
              <button
                type="button"
                className="sn-button sn-button-secondary"
                onClick={() => setSearchText("")}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="sn-notification-list">
            {notifications.map((notification) => (
              <button
                type="button"
                key={notification.id}
                className={`sn-notification-row ${
                  notification.is_read ? "is-read" : "is-unread"
                }`}
                onClick={() => openNotification(notification)}
              >
                <span
                  className={`sn-notification-icon ${
                    notification.is_read ? "" : "has-unread"
                  }`}
                >
                  {notification.is_read ? (
                    <Check size={19} />
                  ) : (
                    <Bell size={19} />
                  )}
                </span>

                <span className="sn-notification-main">
                  <span className="sn-notification-title-line">
                    <strong>{notification.title}</strong>

                    {!notification.is_read && (
                      <span
                        className="sn-unread-dot"
                        aria-label="Unread"
                      />
                    )}
                  </span>

                  <span className="sn-notification-preview">
                    {notification.message}
                  </span>

                  <span className="sn-notification-meta">
                    <span className="sn-type-chip">
                      {formatType(notification.notification_type)}
                    </span>

                    <span className="sn-date">
                      <Clock3 size={13} />
                      {formatDate(notification.created_at)}
                    </span>
                  </span>
                </span>

                <ChevronRight
                  className="sn-row-chevron"
                  size={18}
                />
              </button>
            ))}
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <footer className="sn-list-footer">
            <span>
              Showing {notifications.length} notification
              {notifications.length === 1 ? "" : "s"}
            </span>

            <span>Unread notifications are highlighted</span>
          </footer>
        )}
      </section>

      {selectedNotification && (
        <div
          className="sn-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedNotification(null);
            }
          }}
        >
          <section
            className="sn-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sn-detail-title"
          >
            <header className="sn-modal-header">
              <span className="sn-modal-icon">
                <Bell size={20} />
              </span>

              <button
                type="button"
                className="sn-icon-button"
                onClick={() => setSelectedNotification(null)}
                aria-label="Close notification"
              >
                <X size={20} />
              </button>
            </header>

            <span className="sn-type-chip">
              {formatType(selectedNotification.notification_type)}
            </span>

            <h2 id="sn-detail-title">
              {selectedNotification.title}
            </h2>

            <p className="sn-modal-date">
              <Clock3 size={14} />
              {formatDate(selectedNotification.created_at)}
            </p>

            <div className="sn-modal-message">
              {selectedNotification.message}
            </div>

            <footer className="sn-modal-footer">
              <span className="sn-read-status">
                <Check size={15} />
                {selectedNotification.is_read ? "Read" : "Unread"}
              </span>

              <button
                type="button"
                className="sn-button sn-button-primary"
                onClick={() => setSelectedNotification(null)}
              >
                Done
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
