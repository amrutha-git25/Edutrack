import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000/api";

const notificationsAPI = axios.create({
  baseURL: `${API_BASE_URL}/notifications/`,
  headers: {
    "Content-Type": "application/json",
  },
});

notificationsAPI.interceptors.request.use(
  (config) => {
    const accessToken =
      localStorage.getItem("access") ||
      sessionStorage.getItem("access") ||
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const notificationsAPIService = {
  // Get notifications for the logged-in user.
  getAll: (params = {}) => notificationsAPI.get("/", { params }),

  // Get unread notifications.
  getUnread: () =>
    notificationsAPI.get("/", {
      params: { status: "unread" },
    }),

  // Get read notifications.
  getRead: () =>
    notificationsAPI.get("/", {
      params: { status: "read" },
    }),

  // Mark one notification as read.
  markAsRead: (id) =>
    notificationsAPI.patch(`${id}/read/`),

  // Get a notification by ID.
  getById: (id) =>
    notificationsAPI.get(`${id}/`),

  // Send an email and in-app notification.
  // Requires POST /api/notifications/send/ in Django.
  sendNotification: (payload) =>
    notificationsAPI.post("send/", payload),
};

export default notificationsAPIService;