
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"
).replace(/\/+$/, "");

function getAccessToken() {
  return (
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("accessToken") ||
    localStorage.getItem("accessToken")
  );
}

async function request(path, options = {}) {
  const token = getAccessToken();
  const url = `${API_BASE}/chat/${path.replace(/^\/+/, "")}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const raw = await response.text();
  let result = {};

  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    result = { detail: raw || "The server returned an empty response." };
  }

  if (!response.ok) {
    const details =
      typeof result === "string"
        ? result
        : result.detail ||
          result.message ||
          result.error ||
          JSON.stringify(result);

    throw new Error(
      `Chat API ${response.status} (${url}): ${details}`
    );
  }

  if (result?.success === false) {
    throw new Error(result.message || "The chat request failed.");
  }

  return result?.data ?? result;
}

export const chatApi = {
  getUsers(search = "") {
    const query = search
      ? `?search=${encodeURIComponent(search)}`
      : "";
    return request(`users/${query}`);
  },

  getConversations() {
    return request("conversations/");
  },

  createConversation(userId) {
    return request("conversations/", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
  },

  getMessages(conversationId) {
    return request(`conversations/${conversationId}/messages/`);
  },

  sendMessage(conversationId, body) {
    return request(`conversations/${conversationId}/messages/`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },

  markRead(conversationId) {
    return request(`conversations/${conversationId}/read/`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  startCall(conversationId, callType) {
    return request(`conversations/${conversationId}/calls/`, {
      method: "POST",
      body: JSON.stringify({ call_type: callType }),
    });
  },

  updateCall(callId, action) {
    return request(`calls/${callId}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  },
};
