
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com/api"
).replace(/\/+$/, "");

const getToken = () =>
  sessionStorage.getItem("access_token") ||
  localStorage.getItem("access_token") ||
  sessionStorage.getItem("access") ||
  localStorage.getItem("access") ||
  localStorage.getItem("accessToken") ||
  sessionStorage.getItem("accessToken");

async function request(endpoint, options = {}) {
  const token = getToken();

  const response = await fetch(`${API_BASE}/payments/${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail ||
      data.message ||
      JSON.stringify(data) ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

export const getFeeSummary = () =>
  request("summary/");

export const getFeeRecords = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`fee-records/${query ? `?${query}` : ""}`);
};

export const createFeeRecord = (data) =>
  request("fee-records/", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateFeeRecord = (id, data) =>
  request(`fee-records/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const getPayments = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(query ? `?${query}` : "");
};

export const recordPayment = (data) =>
  request("", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getPaymentReceipt = (id) =>
  request(`${id}/receipt/`);

export default { 
  getFeeSummary,
  getFeeRecords,
  createFeeRecord,
  updateFeeRecord,
  getPayments,
  recordPayment,
  getPaymentReceipt,
};
