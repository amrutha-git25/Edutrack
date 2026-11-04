import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000/api/auth/admin-settings/";

const getAccessToken = () =>
  localStorage.getItem("access") ||
  sessionStorage.getItem("access") ||
  localStorage.getItem("access_token") ||
  sessionStorage.getItem("access_token");

const adminSettingsApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

adminSettingsApi.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

const adminSettingsService = {
  getSettings: () => adminSettingsApi.get("/"),
  updateSettings: (settings) => adminSettingsApi.patch("/", settings),
};

export default adminSettingsService;