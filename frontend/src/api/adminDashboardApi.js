
const API_BASE = "http://127.0.0.1:8000/api";

function getStorage() {
  return sessionStorage.getItem("refresh_token")
    ? sessionStorage
    : localStorage;
}

function getAccessToken() {
  return (
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("access")
  );
}

async function refreshAccessToken() {
  const storage = getStorage();
  const refreshToken = storage.getItem("refresh_token");

  if (!refreshToken) {
    throw new Error("Your session expired. Please log in again.");
  }

  const response = await fetch(`${API_BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  const result = await response.json().catch(() => ({}));
  const payload = result.data ?? result;

  if (!response.ok) {
    throw new Error(
      payload.detail ||
      payload.message ||
      "Session refresh failed. Please log in again."
    );
  }

  const newAccessToken = payload.access ?? payload.access_token;

  if (!newAccessToken) {
    throw new Error("Refresh endpoint did not return a new access token.");
  }

  storage.setItem("access_token", newAccessToken);

  const newRefreshToken = payload.refresh ?? payload.refresh_token;
  if (newRefreshToken) {
    storage.setItem("refresh_token", newRefreshToken);
  }

  return newAccessToken;
}

export async function fetchAdminOverview() {
  let token = getAccessToken();

  if (!token) {
    throw new Error("Please log in with your Admin account.");
  }

  const requestOverview = (accessToken) =>
    fetch(`${API_BASE}/reports/admin/overview/`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let response = await requestOverview(token);

  if (response.status === 401) {
    token = await refreshAccessToken();
    response = await requestOverview(token);
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message ||
      result.detail ||
      "Unable to load the Admin Dashboard."
    );
  }

  return result.data ?? result;
}

export async function createAdmin(adminData) {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("access");

  if (!token) {
    throw new Error("Please log in with your Admin account.");
  }

  const response = await fetch(
    `${API_BASE}/users/admins/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(adminData),
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message ||
        result.detail ||
        Object.values(result).flat().join(" ") ||
        `Unable to create admin (${response.status}).`
    );
  }

  return result.data ?? result;
}
async function mentorRequest(path = "", method = "GET", body) {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("access");

  if (!token) {
    throw new Error("Please log in with your Admin account.");
  }

  const response = await fetch(`${API_BASE}/users/mentors/${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.detail ||
        result.message ||
        Object.entries(result)
          .map(([key, value]) =>
            `${key}: ${Array.isArray(value) ? value.join(", ") : value}`
          )
          .join(" ") ||
        `Mentor request failed (${response.status}).`
    );
  }

  return result;
}

export async function fetchMentors() {
  const result = await mentorRequest();

  const mentors =
    result.mentors ?? result.data?.mentors ?? result.results ?? result.data;

  if (Array.isArray(mentors)) return mentors;

  throw new Error("The mentors API did not return a mentor list.");
}

export async function createMentor(mentorData) {
  const result = await mentorRequest("", "POST", mentorData);
  return result.data ?? result;
}

export async function updateMentor(id, mentorData) {
  const result = await mentorRequest(`${id}/`, "PATCH", mentorData);
  return result.data ?? result;
}

export async function deactivateMentor(id) {
  return mentorRequest(`${id}/`, "DELETE");
}