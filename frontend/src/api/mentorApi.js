
import axios from "axios";

const mentorApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

mentorApi.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access") ||
    sessionStorage.getItem("access_token");

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Dashboard
export const getMentorDashboard = async () => {
  const { data } = await mentorApi.get("/mentor/dashboard/");
  return data.data;
};

// Settings
export const getMentorSettings = async () => {
  const { data } = await mentorApi.get("/mentor/settings/");
  return data;
};

export const updateMentorSettings = async (settings) => {
  const { data } = await mentorApi.patch(
    "/mentor/settings/",
    settings
  );
  return data;
};

// Activities
export const getMentorActivities = async () => {
  const { data } = await mentorApi.get("/mentor/activities/");
  return data;
};

// Online Exams
export const getMentorExams = async () => {
  const { data } = await mentorApi.get("/mentor/exams/");

  if (Array.isArray(data)) return data;

  return data.results ?? data.exams ?? [];
};

export const getMentorExam = async (examId) => {
  const { data } = await mentorApi.get(
    `/mentor/exams/${examId}/`
  );

  return data.exam ?? data;
};

export const createMentorExam = async (exam) => {
  const { data } = await mentorApi.post(
    "/mentor/exams/",
    exam
  );

  return data.exam ?? data;
};

export const updateMentorExam = async (examId, exam) => {
  const { data } = await mentorApi.patch(
    `/mentor/exams/${examId}/`,
    exam
  );

  return data.exam ?? data;
};

export const deleteMentorExam = async (examId) => {
  await mentorApi.delete(`/mentor/exams/${examId}/`);
};

export const updateMentorExamAvailability = async (
  examId,
  action
) => {
  const { data } = await mentorApi.post(
    `/mentor/exams/${examId}/availability/`,
    { action }
  );

  return data.exam ?? data;
};

export const getMentorExamResults = async (examId) => {
  const { data } = await mentorApi.get(
    `/mentor/exams/${examId}/results/`
  );

  return data.results ?? [];
};

// OpenRouter AI Exam Builder
export const generateAIExamQuestions = async (payload) => {
  const { data } = await mentorApi.post(
    "/mentor/exams/ai-generate/",
    payload
  );

  return data;
};

export default mentorApi;
