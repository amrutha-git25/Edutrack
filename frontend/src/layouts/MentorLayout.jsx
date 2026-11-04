
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  GraduationCap, Home, BookOpen, FolderOpen, ClipboardList,
  FileQuestion, Video, CalendarCheck, Users, MessageSquare,
  Bell, UserRound, Settings, LogOut,
  Menu, X, AlertCircle,
} from "lucide-react";
import "./MentorLayout.css";
import { toast } from "sonner";

const LOGOUT_GRACE_SECONDS = 5;
const LOGOUT_COUNTDOWN_TOAST_ID = "mentor-logout-countdown";

const navItems = [
  { label: "Home", path: "/mentor", icon: Home, end: true },
  { label: "My Courses", path: "/mentor/courses", icon: BookOpen },
  { label: "Topics & Materials", path: "/mentor/topics-materials", icon: FolderOpen },
  { label: "Assignments", path: "/mentor/assignments", icon: ClipboardList },
  { label: "Online Exams", path: "/mentor/exams", icon: FileQuestion },
  { label: "Live Classes", path: "/mentor/live-classes", icon: Video },
  { label: "Attendance", path: "/mentor/attendance", icon: CalendarCheck },
  { label: "Students", path: "/mentor/students", icon: Users },
  { label: "Messages", path: "/mentor/messages", icon: MessageSquare },
  { label: "Notifications", path: "/mentor/notifications", icon: Bell },
  { label: "Profile", path: "/mentor/profile", icon: UserRound },
  { label: "Settings", path: "/mentor/settings", icon: Settings },
];

export default function MentorLayout() {
  const navigate = useNavigate();

  const [theme] = useState(
    () => localStorage.getItem("mentor-theme") || "yellow"
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutCountdown, setLogoutCountdown] = useState(null);
  const isLoggingOut = logoutCountdown !== null;

  const [user] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  });

  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.name ||
    "Mentor";

  useEffect(() => {
    document.documentElement.dataset.mentorTheme = theme;
  }, [theme]);

  const openLogoutModal = () => {
    setAccountOpen(false);
    setShowLogoutModal(true);
  };

  const cancelLogout = () => {
    if (isLoggingOut) return;
    setShowLogoutModal(false);
  };

  const confirmLogout = () => {
    if (isLoggingOut) return;
    setShowLogoutModal(false);
    setAccountOpen(false);
    setLogoutCountdown(LOGOUT_GRACE_SECONDS);
  };

  useEffect(() => {
    if (logoutCountdown === null) return undefined;

    if (logoutCountdown <= 0) {
      toast.dismiss(LOGOUT_COUNTDOWN_TOAST_ID);

      ["access", "refresh", "access_token", "refresh_token", "user"].forEach((key) => {
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
        <div className="mentor-logout-toast" role="status" aria-live="polite">
          <div className="mentor-logout-toast-content">
            <span className="mentor-logout-toast-icon">
              <AlertCircle size={18} />
            </span>
            <div className="mentor-logout-toast-copy">
              <strong>LOGOUT</strong>
              <span>
                Logging out in {logoutCountdown} second
                {logoutCountdown === 1 ? "" : "s"}...
              </span>
            </div>
            <button
              type="button"
              className="mentor-logout-toast-close"
              onClick={() => toast.dismiss(toastId)}
              aria-label="Close logout notification"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mentor-logout-toast-progress">
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
    <div className="mentor-app">
      <style>{`
        .mentor-logout-toast {
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
        .mentor-logout-toast-content {
          display: flex;
          align-items: center;
          gap: 13px;
          min-height: 74px;
          padding: 12px 13px 14px 17px;
        }
        .mentor-logout-toast-icon {
          display: grid;
          flex: 0 0 32px;
          width: 32px;
          height: 32px;
          place-items: center;
          border-radius: 50%;
          background: #ed515b;
          color: #ffffff;
        }
        .mentor-logout-toast-copy {
          display: flex;
          flex: 1;
          min-width: 0;
          flex-direction: column;
          gap: 5px;
        }
        .mentor-logout-toast-copy strong {
          color: #292929;
          font-size: 17px;
          font-weight: 750;
          line-height: 1.1;
        }
        .mentor-logout-toast-copy span {
          overflow-wrap: anywhere;
          color: #666666;
          font-size: 14px;
          line-height: 1.3;
        }
        .mentor-logout-toast-close {
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
          cursor: pointer;
        }
        .mentor-logout-toast-close:hover { background: #f1f1f1; }
        .mentor-logout-toast-progress {
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          height: 3px;
          background: #f2dfe0;
        }
        .mentor-logout-toast-progress span {
          display: block;
          height: 100%;
          background: #ed515b;
          transition: width 1s linear;
        }
        @media (max-width: 520px) {
          .mentor-logout-toast {
            width: min(320px, calc(100vw - 24px));
            min-height: 72px;
            border-radius: 12px;
          }
          .mentor-logout-toast-content {
            min-height: 69px;
            gap: 10px;
            padding: 10px 10px 12px 13px;
          }
          .mentor-logout-toast-icon {
            flex-basis: 29px;
            width: 29px;
            height: 29px;
          }
          .mentor-logout-toast-copy strong { font-size: 15px; }
          .mentor-logout-toast-copy span { font-size: 12px; }
        }
      `}</style>
      {sidebarOpen && (
        <button
          className="mentor-overlay"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`mentor-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="mentor-brand">
          <span className="mentor-logo">
            <GraduationCap size={22} />
          </span>
          <span>EduTrack</span>
          <button
            className="mentor-mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mentor-nav-title">MENTOR WORKSPACE</div>

        <nav className="mentor-nav">
          {navItems.map(({ label, path, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `mentor-nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
              {label === "Notifications" }
            </NavLink>
          ))}

          <button
            className="mentor-nav-item mentor-logout"
            onClick={openLogoutModal}
            disabled={isLoggingOut}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </nav>

        <div className="mentor-help">
          <strong>A little help goes a long way.</strong>
          <p>Find answers in the help center.</p>
          <button onClick={() => navigate("/mentor/messages")}>
            Get support →
          </button>
        </div>
      </aside>

      <div className="mentor-main">
        <header className="mentor-topbar">
          <div className="mentor-breadcrumb">
            <button
              className="mentor-menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
            <span>Mentor workspace</span>
            <span>›</span>
            <span>Home</span>
          </div>

          <div className="mentor-topbar-right">
            <span className="mentor-date">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>

            <div className="mentor-account">
              <button
                className="mentor-account-btn"
                onClick={() => setAccountOpen((value) => !value)}
                aria-expanded={accountOpen}
              >
                <span className="mentor-avatar">
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="mentor-account-info">
                  <strong>{name}</strong>
                  <small>Mentor account</small>
                </span>
              </button>

              {accountOpen && (
                <div className="mentor-account-menu">
                  <button onClick={() => navigate("/mentor/profile")}>
                    <UserRound size={15} /> Profile
                  </button>
                  <button onClick={() => navigate("/mentor/settings")}>
                    <Settings size={15} /> Settings
                  </button>
                  <button onClick={openLogoutModal}>
                    <LogOut size={15} /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mentor-content">
          <Outlet />
        </main>
      </div>

      {showLogoutModal && (
        <div
          className="mentor-logout-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelLogout();
          }}
        >
          <section
            className="mentor-logout-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mentor-logout-title"
            aria-describedby="mentor-logout-description"
          >
            <div className="mentor-logout-icon">
              <LogOut size={23} />
            </div>
            <h2 id="mentor-logout-title">Are you sure you want to logout?</h2>
            <p id="mentor-logout-description">
              You will be signed out of your EduTrack mentor account.
            </p>
            <div className="mentor-logout-actions">
              <button
                type="button"
                className="mentor-logout-cancel"
                onClick={cancelLogout}
                disabled={isLoggingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mentor-logout-confirm"
                onClick={confirmLogout}
                disabled={isLoggingOut}
              >
                Yes, Logout
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
