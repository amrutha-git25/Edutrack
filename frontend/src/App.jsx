import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Toaster } from "sonner";

// Public pages
import LandingPage from "./pages/LandingPage";
import Registration from "./pages/Registration";
import Login from "./pages/Login";
import OTPVerification from "./pages/OTPVerification";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import AccessDenied from "./pages/AccessDenied";
// Mentor pages
import MentorLayout from "./layouts/MentorLayout";
import MentorDashboard from "./pages/mentor/MentorDashboard";
import MentorSettings from "./pages/mentor/MentorSettings";
import MentorCourses from "./pages/mentor/MyCourses";
import TopicsMaterials from "./pages/mentor/TopicsMaterials";
import MentorAssignments from "./pages/mentor/MentorAssignments";
import OnlineExams from "./pages/mentor/OnlineExams";
import MentorLiveClasses from "./pages/mentor/LiveClasses";
import LiveAttendance from "./pages/mentor/LiveAttendance";
import Students from "./pages/mentor/Students";
import Messages from "./pages/mentor/Messages";
import MentorNotifications from "./pages/mentor/Notifications";
import MentorProfile from "./pages/mentor/Profile";

// Student pages
import Assignments from "./pages/student/Assignments";
import StudentProfile from "./pages/student/Profile";
import StudentSettings from "./pages/student/Settings";
import Chat from "./pages/student/Chat";
import StudentNotifications from "./pages/student/StudentNotifications";
import Certificates from "./pages/student/Certificates";
import Progress from "./pages/student/Progress";
import Quizzes from "./pages/student/Quizzes";
import MyCourses from "./pages/student/MyCourses";
import Courses from "./pages/student/Courses";
import StudentAssessments from "./pages/student/StudentAssessments";
import StudentLayout from "./layouts/StudentLayout";
import StudentDashboard from "./pages/student/StudentDashboard";
import ResumeBuilder from "./pages/student/ResumeBuilder";

// Admin pages
import Profile from "./pages/admin/Profile";
import Settings from "./pages/admin/Settings";
import AssignMentors from "./pages/admin/AssignMentors";
import AdminCourses from "./pages/admin/AdminCourses";
import ChatWithUser from "./pages/admin/ChatWithUser";
import Placement from "./pages/admin/Placement";
import Notifications from "./pages/admin/Notifications";
import FeeManagement from "./pages/admin/fee/FeeManagement";
import AttendanceAnalytics from "./pages/admin/AttendanceAnalytics";
import AIExamGenerator from "./pages/admin/AIExamGenerator";
import AddAdmin from "./pages/admin/AddAdmin";
import LiveClasses from "./pages/admin/LiveClasses";
import EnrollAllStudents from "./pages/admin/EnrollAllStudents";
import AdminStudents from "./pages/admin/AdminStudents";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import Mentors from "./pages/admin/Mentors";
import CertificatesManagement from "./pages/admin/CertificatesManagement";

import { ThemeProvider } from "./context/ThemeContext";
//Private Routing
// Read authentication data from localStorage or sessionStorage.
function getStoredAuth() {
  const accessToken =
    localStorage.getItem("access") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  const storedUser =
    localStorage.getItem("user") ||
    sessionStorage.getItem("user");

  let user = null;
  try {
    user = storedUser ? JSON.parse(storedUser) : null;
  } catch {
    user = null;
  }

  return { accessToken, user };
}

// Check JWT expiry before rendering a protected dashboard.
// Django must also enforce JWT authentication on protected API endpoints.
function hasValidAccessToken(token) {
  if (!token || typeof token !== "string") return false;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload =
      payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(atob(paddedPayload));

    return (
      typeof decoded.exp === "number" &&
      decoded.exp * 1000 > Date.now()
    );
  } catch {
    return false;
  }
}

function clearStoredAuth() {
  ["access", "access_token", "refresh", "refresh_token", "user"].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

function getUserRole(user) {
  return String(user?.role || "").trim().toUpperCase();
}

function isAuthenticatedForRole(requiredRole) {
  const { accessToken, user } = getStoredAuth();

  if (!hasValidAccessToken(accessToken) || !user) {
    clearStoredAuth();
    return false;
  }

  return getUserRole(user) === requiredRole;
}
//Role based private routing
// Protect Admin routes.
function SuperuserRoute() {
  const { user } = getStoredAuth();

  if (!isAuthenticatedForRole("ADMIN")) {
    const role = getUserRole(user);
    if (role === "STUDENT") return <Navigate to="/student/dashboard" replace />;
    if (role === "MENTOR") return <Navigate to="/mentor" replace />;
    return <Navigate to="/access-denied" replace />;
  }

  return <Outlet />;
}

// Protect Student routes.
function StudentRoute() {
  const { user } = getStoredAuth();

  if (!isAuthenticatedForRole("STUDENT")) {
    const role = getUserRole(user);
    if (role === "ADMIN") return <Navigate to="/admin/dashboard" replace />;
    if (role === "MENTOR") return <Navigate to="/mentor" replace />;
    return <Navigate to="/access-denied" replace />;
  }

  return <Outlet />;
}

// Protect Mentor routes.
function MentorRoute() {
  const { user } = getStoredAuth();

  if (!isAuthenticatedForRole("MENTOR")) {
    const role = getUserRole(user);
    if (role === "ADMIN") return <Navigate to="/admin/dashboard" replace />;
    if (role === "STUDENT") return <Navigate to="/student/dashboard" replace />;
    return <Navigate to="/access-denied" replace />;
  }

  return <Outlet />;
}

// Keep the theme provider around Admin pages.
function AdminThemeLayout() {
  return (
    <ThemeProvider>
      <AdminLayout />
    </ThemeProvider>
  );
}

// Keep the theme provider around Student pages.
function StudentThemeLayout() {
  return (
    <ThemeProvider>
      <StudentLayout />
    </ThemeProvider>
  );
}

function App() {
  return (
    <>
      {/* Global toast notifications */}
      <Toaster
        position="top-right"
        duration={3000}
        richColors
        closeButton
        visibleToasts={4}
        expand
      />

      <Routes>
        {/* Public pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<Registration />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify-otp" element={<OTPVerification />} />
        <Route
  path="/forgot-password"
  element={<ForgotPassword />}
/>
<Route
  path="/reset-password"
  element={<ResetPassword />}
/>
<Route
  path="/access-denied"
  element={<AccessDenied />}
/>
        {/* Admin routes */}
        <Route element={<SuperuserRoute />}>
          <Route path="/admin" element={<AdminThemeLayout />}>
            <Route
              index
              element={<Navigate to="dashboard" replace />}
            />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="courses" element={<AdminCourses />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="mentors" element={<Mentors />} />
            <Route path="assign-mentors" element={<AssignMentors />} />
            <Route
              path="enroll-all-students"
              element={<EnrollAllStudents />}
            />
            <Route path="add-admin" element={<AddAdmin />} />
            <Route path="live-classes" element={<LiveClasses />} />
            <Route
              path="exams/ai-generator"
              element={<AIExamGenerator />}
            />
            <Route
              path="attendance-analytics"
              element={<AttendanceAnalytics />}
            />
            <Route
              path="fee-management"
              element={<FeeManagement />}
            />
            <Route
              path="certificates"
              element={<CertificatesManagement />}
            />
            <Route path="placements" element={<Placement />} />
            <Route path="chat" element={<ChatWithUser />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>

        {/* Student routes */}
        <Route element={<StudentRoute />}>
          <Route path="/student" element={<StudentThemeLayout />}>
            <Route
              index
              element={<Navigate to="dashboard" replace />}
            />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="courses" element={<Courses />} />
            <Route path="assessments" element={<StudentAssessments />} />
            <Route path="assignments" element={<Assignments />} />
            <Route path="progress" element={<Progress />} />
            <Route path="materials" element={<MyCourses />} />
            <Route path="quizzes" element={<Quizzes />} />
            <Route path="certificates" element={<Certificates />} />
            <Route path="resume-builder" element={<ResumeBuilder />} />
            <Route path="chat" element={<Chat />} />
            <Route
              path="notifications"
              element={<StudentNotifications />}
            />
            <Route path="settings" element={<StudentSettings />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>
        </Route>

        {/* Mentor routes */}
        <Route element={<MentorRoute />}>
          <Route path="/mentor" element={<MentorLayout />}>
            <Route index element={<MentorDashboard />} />
            <Route path="settings" element={<MentorSettings />} />
            <Route path="courses" element={<MentorCourses />} />
            <Route
              path="topics-materials"
              element={<TopicsMaterials />}
            />
            <Route
              path="assignments"
              element={<MentorAssignments />}
            />
            <Route path="exams" element={<OnlineExams />} />
            <Route
              path="live-classes"
              element={<MentorLiveClasses />}
            />
            <Route path="attendance" element={<LiveAttendance />} />
            <Route path="students" element={<Students />} />
            <Route path="messages" element={<Messages />} />
            <Route
              path="notifications"
              element={<MentorNotifications />}
            />
            <Route path="profile" element={<MentorProfile />} />
          </Route>
        </Route>

        {/* Unknown paths */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;