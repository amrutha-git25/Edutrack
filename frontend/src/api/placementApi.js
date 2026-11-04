
const API_BASE = "http://127.0.0.1:8000/api";

function getAccessToken() {
  return (
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("access")
  );
}

function getRefreshToken() {
  return (
    sessionStorage.getItem("refresh_token") ||
    localStorage.getItem("refresh_token")
  );
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();

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

  const newToken = payload.access ?? payload.access_token;

  if (!newToken) {
    throw new Error("The server did not return a new access token.");
  }

  const storage = sessionStorage.getItem("refresh_token")
    ? sessionStorage
    : localStorage;

  storage.setItem("access_token", newToken);

  const newRefresh = payload.refresh ?? payload.refresh_token;
  if (newRefresh) {
    storage.setItem("refresh_token", newRefresh);
  }

  return newToken;
}

async function placementRequest(path = "", method = "GET", body) {
  let token = getAccessToken();

  if (!token) {
    throw new Error("Please log in to access Placement Management.");
  }

  const makeRequest = (accessToken) =>
    fetch(`${API_BASE}/placements/${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let response = await makeRequest(token);

  if (response.status === 401) {
    token = await refreshAccessToken();
    response = await makeRequest(token);
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message ||
        result.detail ||
        Object.entries(result)
          .map(([key, value]) =>
            `${key}: ${
              Array.isArray(value) ? value.join(", ") : value
            }`
          )
          .join(" ") ||
        `Placement request failed (${response.status}).`
    );
  }

  return result.data ?? result;
}

export async function fetchPlacements() {
  const result = await placementRequest();

  const placements =
    Array.isArray(result)
      ? result
      : result.placements ??
        result.results ??
        result.data?.placements ??
        result.data?.results;

  if (!Array.isArray(placements)) {
    throw new Error("The placements API did not return a placement list.");
  }

  return placements;
}

export async function createPlacement(placementData) {
  return placementRequest("", "POST", placementData);
}

export async function updatePlacement(id, placementData) {
  return placementRequest(`${id}/`, "PATCH", placementData);
}

export async function archivePlacement(id) {
  return placementRequest(`${id}/`, "DELETE");
}
