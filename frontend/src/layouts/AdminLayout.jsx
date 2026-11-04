
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  FaGraduationCap,
  FaThLarge,
  FaBook,
  FaUserGraduate,
  FaChalkboardTeacher,
  FaUserPlus,
  FaUsers,
  FaShieldAlt,
  FaVideo,
  FaClipboardList,
  FaChartLine,
  FaMoneyBillWave,
  FaCertificate,
  FaBriefcase,
  FaComments,
  FaBell,
  FaCog,
  FaUserCircle,
  FaSun,
  FaMoon,
  FaPalette,
  FaSignOutAlt,
  FaExclamationCircle,
  FaTimes,
} from "react-icons/fa";

import { toast } from "sonner";
import { useAdminTheme } from "../context/ThemeContext";
import LogoutModal from "../components/LogoutModal.jsx";

const LOGOUT_GRACE_SECONDS = 5;
const LOGOUT_TOAST_ID = "admin-logout-countdown";

const navigation = [
  { label: "Dashboard", path: "/admin/dashboard", icon: FaThLarge },
  { label: "Courses", path: "/admin/courses", icon: FaBook },
  { label: "Students", path: "/admin/students", icon: FaUserGraduate },
  { label: "Mentors", path: "/admin/mentors", icon: FaChalkboardTeacher },
  { label: "Assign Mentors", path: "/admin/assign-mentors", icon: FaUserPlus },
  {
    label: "Enroll All Students",
    path: "/admin/enroll-all-students",
    icon: FaUsers,
  },
  { label: "Add Admin", path: "/admin/add-admin", icon: FaShieldAlt },
  { label: "Live Classes", path: "/admin/live-classes", icon: FaVideo },
  {
    label: "Online Exams",
    path: "/admin/exams/ai-generator",
    icon: FaClipboardList,
  },
  {
    label: "Attendance Analytics",
    path: "/admin/attendance-analytics",
    icon: FaChartLine,
  },
  {
    label: "Fee Management",
    path: "/admin/fee-management",
    icon: FaMoneyBillWave,
  },
  { label: "Certificates", path: "/admin/certificates", icon: FaCertificate },
  { label: "Placement", path: "/admin/placements", icon: FaBriefcase },
  { label: "Chat with User", path: "/admin/chat", icon: FaComments },
  { label: "Notifications", path: "/admin/notifications", icon: FaBell },
  { label: "Settings", path: "/admin/settings", icon: FaCog },
  { label: "Profile", path: "/admin/profile", icon: FaUserCircle },
];

function getPageTitle(pathname) {
  const currentPage = navigation.find(
    (item) =>
      pathname === item.path || pathname.startsWith(`${item.path}/`)
  );

  if (currentPage) return currentPage.label;
  if (pathname === "/admin/help") return "Help & Support";

  return "Dashboard";
}

function clearAuthenticationTokens() {
  const tokenKeys = [
    "access",
    "refresh",
    "access_token",
    "refresh_token",
    "user",
  ];

  tokenKeys.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

export default function AdminLayout() {
  const { theme, setTheme } = useAdminTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutCountdown, setLogoutCountdown] = useState(null);

  const pageTitle = getPageTitle(location.pathname);

  const themeOptions = [
    { id: "dark", label: "Dark", icon: FaMoon },
    { id: "light", label: "Light", icon: FaSun },
    { id: "yellow", label: "Yellow", icon: FaPalette },
  ];

  // Keep tokens available until the countdown finishes.
  useEffect(() => {
    if (logoutCountdown === null) return undefined;

    if (logoutCountdown === 0) {
      toast.dismiss(LOGOUT_TOAST_ID);

      clearAuthenticationTokens();

      toast.success("You have been logged out successfully.");
      navigate("/login", { replace: true });

      return undefined;
    }

    toast.custom(
      (toastId) => (
        <div className="admin-logout-toast" role="status" aria-live="polite">
          <div className="admin-logout-toast-content">
            <span className="admin-logout-toast-icon">
              <FaExclamationCircle />
            </span>

            <div className="admin-logout-toast-copy">
              <strong>LOGOUT</strong>
              <span>
                Logging out in {logoutCountdown} second
                {logoutCountdown === 1 ? "" : "s"}...
              </span>
            </div>

            <button
              type="button"
              className="admin-logout-toast-close"
              onClick={() => toast.dismiss(toastId)}
              aria-label="Close logout notification"
            >
              <FaTimes />
            </button>
          </div>

          <div className="admin-logout-toast-progress">
            <span
              style={{
                width: `${(logoutCountdown / LOGOUT_GRACE_SECONDS) * 100}%`,
              }}
            />
          </div>
        </div>
      ),
      {
        id: LOGOUT_TOAST_ID,
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

  const handleLogout = () => {
    if (logoutCountdown !== null) return;

    setShowLogoutModal(false);
    setLogoutCountdown(LOGOUT_GRACE_SECONDS);
  };

  const cancelLogout = () => {
    if (logoutCountdown !== null) return;
    setShowLogoutModal(false);
  };

  return (
    <div className="admin-shell" data-theme={theme}>

      <style>{`
        .admin-logout-toast {
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

        .admin-logout-toast-content {
          display: flex;
          align-items: center;
          gap: 13px;
          min-height: 74px;
          padding: 12px 13px 14px 17px;
        }

        .admin-logout-toast-icon {
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

        .admin-logout-toast-copy {
          display: flex;
          flex: 1;
          min-width: 0;
          flex-direction: column;
          gap: 5px;
        }

        .admin-logout-toast-copy strong {
          color: #292929;
          font-size: 17px;
          font-weight: 750;
          line-height: 1.1;
          letter-spacing: 0;
        }

        .admin-logout-toast-copy span {
          overflow-wrap: anywhere;
          color: #666666;
          font-size: 14px;
          line-height: 1.3;
        }

        .admin-logout-toast-close {
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

        .admin-logout-toast-close:hover {
          background: #f1f1f1;
        }

        .admin-logout-toast-progress {
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          height: 3px;
          background: #f2dfe0;
        }

        .admin-logout-toast-progress span {
          display: block;
          height: 100%;
          background: #ed515b;
          transition: width 1s linear;
        }

        @media (max-width: 520px) {
          .admin-logout-toast {
            width: min(320px, calc(100vw - 24px));
            min-height: 72px;
            border-radius: 12px;
          }

          .admin-logout-toast-content {
            min-height: 69px;
            gap: 10px;
            padding: 10px 10px 12px 13px;
          }

          .admin-logout-toast-icon {
            flex-basis: 29px;
            width: 29px;
            height: 29px;
            font-size: 15px;
          }

          .admin-logout-toast-copy strong {
            font-size: 15px;
          }

          .admin-logout-toast-copy span {
            font-size: 12px;
          }
        }
      `}</style>
      <aside className="admin-sidebar">
        <NavLink to="/admin/dashboard" className="brand">
          <span className="brand-mark">
            <FaGraduationCap />
          </span>
          <span>EduTrack</span>
        </NavLink>

       
        <p className="sidebar-caption">ADMIN WORKSPACE</p>

        <nav className="sidebar-nav" aria-label="Admin navigation">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/admin/dashboard"}
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
          <strong>A little help goes a long way.</strong>
          <p>Find answers in the help center.</p>

          <button
            type="button"
            onClick={() => navigate("/admin/help")}
          >
            Get support →
          </button>
        </div>

        <button
          type="button"
          className="sidebar-logout"
          onClick={() => setShowLogoutModal(true)}
          disabled={logoutCountdown !== null}
        >
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="breadcrumbs">
            <span>Admin workspace</span>
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

            <div className="admin-identity">
              <span className="avatar">AU</span>

              <div>
                <strong>Admin User</strong>
                <small>Admin account</small>
              </div>
            </div>
          </div>
        </header>

        <section className="admin-content">
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
