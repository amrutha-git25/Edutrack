import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  FaGraduationCap,
  FaThLarge,
  FaBookOpen,
  FaTasks,
  FaChartLine,
  FaFolderOpen,
  FaQuestionCircle,
  FaCertificate,
  FaFileAlt,
  FaComments,
  FaBell,
  FaCog,
  FaUserCircle,
  FaSignOutAlt,
  FaExclamationCircle,
  FaTimes,
} from "react-icons/fa";

import { useAdminTheme } from "../context/ThemeContext";
import LogoutModal from "../components/LogoutModal.jsx";
import { toast } from "sonner";

const LOGOUT_GRACE_SECONDS = 5;
const LOGOUT_COUNTDOWN_TOAST_ID = "student-logout-countdown";

const navigation = [
  { label: "Dashboard", path: "/student/dashboard", icon: FaThLarge },
  { label: "My Courses", path: "/student/courses", icon: FaBookOpen },
  { label: "Assignments", path: "/student/assignments", icon: FaTasks },
  { label: "My Progress", path: "/student/progress", icon: FaChartLine },
  { label: "Learning Materials", path: "/student/materials", icon: FaFolderOpen },
  { label: "Quizzes", path: "/student/quizzes", icon: FaQuestionCircle },
  { label: "Certificates", path: "/student/certificates", icon: FaCertificate },
  { label: "AI Resume Builder", path: "/student/resume-builder", icon: FaFileAlt },
  { label: "Chat", path: "/student/chat", icon: FaComments },
  { label: "Notifications", path: "/student/notifications", icon: FaBell },
  { label: "Settings", path: "/student/settings", icon: FaCog },
  { label: "Profile", path: "/student/profile", icon: FaUserCircle },
];

function getPageTitle(pathname) {
  const currentPage = navigation.find(
    (item) =>
      pathname === item.path || pathname.startsWith(`${item.path}/`)
  );

  if (currentPage) return currentPage.label;
  if (pathname === "/student/help") return "Help & Support";
  return "Dashboard";
}

function getStudentIdentity() {
  const storedUser =
    localStorage.getItem("user") || sessionStorage.getItem("user");

  if (!storedUser) return { name: "Student", initials: "ST" };

  try {
    const user = JSON.parse(storedUser);
    const name =
      user.full_name ||
      user.name ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.email ||
      "Student";

    const initials = name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

    return { name, initials: initials || "ST" };
  } catch {
    return { name: "Student", initials: "ST" };
  }
}

export default function StudentLayout() {
  const { theme } = useAdminTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutCountdown, setLogoutCountdown] = useState(null);

  const pageTitle = getPageTitle(location.pathname);
  const student = getStudentIdentity();
  const isLoggingOut = logoutCountdown !== null;


  const handleLogout = () => {
    if (isLoggingOut) return;

    setShowLogoutModal(false);
    setLogoutCountdown(LOGOUT_GRACE_SECONDS);
  };

  const cancelLogout = () => {
    if (isLoggingOut) return;
    setShowLogoutModal(false);
  };

  useEffect(() => {
    if (logoutCountdown === null) return undefined;

    if (logoutCountdown <= 0) {
      toast.dismiss(LOGOUT_COUNTDOWN_TOAST_ID);

      const storageKeys = [
        "access",
        "refresh",
        "access_token",
        "refresh_token",
        "user",
      ];

      storageKeys.forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });

      toast.success("You have been logged out successfully.", {
        duration: 3000,
      });
      navigate("/login", { replace: true });
      return undefined;
    }

    toast.custom(
      (toastId) => (
        <div className="student-logout-toast" role="status" aria-live="polite">
          <div className="student-logout-toast-content">
            <span className="student-logout-toast-icon">
              <FaExclamationCircle />
            </span>

            <div className="student-logout-toast-copy">
              <strong>LOGOUT</strong>
              <span>
                Logging out in {logoutCountdown} second
                {logoutCountdown === 1 ? "" : "s"}...
              </span>
            </div>

            <button
              type="button"
              className="student-logout-toast-close"
              onClick={() => toast.dismiss(toastId)}
              aria-label="Close logout notification"
            >
              <FaTimes />
            </button>
          </div>

          <div className="student-logout-toast-progress">
            <span
              style={{
                width: `${(logoutCountdown / LOGOUT_GRACE_SECONDS) * 100}%`,
              }}
            />
          </div>
        </div>
      ),
      {
        id: LOGOUT_COUNTDOWN_TOAST_ID,
        duration: Infinity,
        position: "top-right",
      }
    );

    const timer = window.setTimeout(() => {
      setLogoutCountdown((current) =>
        current === null ? null : current - 1
      );
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [logoutCountdown, navigate]);

  return (
    <div className="admin-shell student-shell" data-theme={theme}>
      <style>{`
        .student-logout-toast {
          position: relative;
          width: min(340px, calc(100vw - 32px));
          min-height: 78px;
          overflow: hidden;
          border: 1px solid #e8e8e8;
          border-left: 5px solid #ed515b;
          border-radius: 14px;
          background: #ffffff;
          color: #292929;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
          font-family: Arial, Helvetica, sans-serif;
        }

        .student-logout-toast-content {
          display: flex;
          align-items: center;
          gap: 13px;
          min-height: 74px;
          padding: 12px 13px 14px 17px;
        }

        .student-logout-toast-icon {
          display: grid;
          flex: 0 0 32px;
          width: 32px;
          height: 32px;
          place-items: center;
          border-radius: 50%;
          background: #ed515b;
          color: #ffffff;
          font-size: 17px;
        }

        .student-logout-toast-copy {
          display: flex;
          flex: 1;
          min-width: 0;
          flex-direction: column;
          gap: 5px;
        }

        .student-logout-toast-copy strong {
          color: #292929;
          font-size: 17px;
          font-weight: 750;
          line-height: 1.1;
        }

        .student-logout-toast-copy span {
          overflow-wrap: anywhere;
          color: #666666;
          font-size: 14px;
          line-height: 1.3;
        }

        .student-logout-toast-close {
          display: grid;
          flex: 0 0 25px;
          width: 25px;
          height: 25px;
          place-items: center;
          align-self: flex-start;
          margin: 0 0 0 auto;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: #222222;
          font-size: 14px;
          cursor: pointer;
        }

        .student-logout-toast-close:hover {
          background: #f1f1f1;
        }

        .student-logout-toast-progress {
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          height: 3px;
          background: #f2dfe0;
        }

        .student-logout-toast-progress span {
          display: block;
          height: 100%;
          background: #ed515b;
          transition: width 1s linear;
        }

        @media (max-width: 520px) {
          .student-logout-toast {
            width: min(320px, calc(100vw - 24px));
            min-height: 72px;
            border-radius: 12px;
          }

          .student-logout-toast-content {
            min-height: 69px;
            gap: 10px;
            padding: 10px 10px 12px 13px;
          }

          .student-logout-toast-icon {
            flex-basis: 29px;
            width: 29px;
            height: 29px;
            font-size: 15px;
          }

          .student-logout-toast-copy strong {
            font-size: 15px;
          }

          .student-logout-toast-copy span {
            font-size: 12px;
          }
        }
      `}</style>
      <aside className="admin-sidebar student-sidebar">
        <NavLink to="/student/dashboard" className="brand">
          <span className="brand-mark">
            <FaGraduationCap />
          </span>
          <span>EduTrack</span>
        </NavLink>


        <p className="sidebar-caption">STUDENT WORKSPACE</p>

        <nav className="sidebar-nav" aria-label="Student navigation">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/student/dashboard"}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "active" : ""}`
              }
            >
              <Icon className="sidebar-icon" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-help">
          <strong>Need a hand with learning?</strong>
          <p>Find help when you need it.</p>
          <button type="button" onClick={() => navigate("/student/help")}>
            Get support →
          </button>
        </div>

        <button
          type="button"
          className="sidebar-logout"
          onClick={() => setShowLogoutModal(true)}
          disabled={isLoggingOut}
        >
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
      </aside>

      <main className="admin-main student-main">
        <header className="admin-topbar student-topbar">
          <div className="breadcrumbs">
            <span>Student workspace</span>
            <span aria-hidden="true">›</span>
            <strong>{pageTitle}</strong>
          </div>

          <div className="topbar-actions">
            <span className="topbar-date">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>

            <div className="admin-identity student-identity">
              <span className="avatar">{student.initials}</span>
              <div>
                <strong>{student.name}</strong>
                <small>Student account</small>
              </div>
            </div>
          </div>
        </header>

        <section className="admin-content student-content">
          <Outlet />
        </section>
      </main>

      <LogoutModal
        isOpen={showLogoutModal}
        onCancel={cancelLogout}
        onConfirm={handleLogout}
      />
    </div>
  );
}
