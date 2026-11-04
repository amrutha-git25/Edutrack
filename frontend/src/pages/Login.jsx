
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiUser,
  FiEye,
  FiEyeOff,
  FiMail,
  FiLock,
  FiArrowRight,
  FiShield,
  FiBookOpen,
  FiAward,
  FiTrendingUp,
  FiMonitor,
} from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import { FaGraduationCap } from "react-icons/fa6";
import { toast } from "sonner";
import "./Login.css";

const API_URL = "http://127.0.0.1:8000/api/auth/login/";

const roles = [
  {
    value: "Student",
    label: "Student",
    description: "Learner",
    icon: FaGraduationCap,
    dashboard: "/student/dashboard",
  },
  {
    value: "Mentor",
    label: "Mentor",
    description: "Educator",
    icon: FiUser,
    dashboard: "/mentor",
  },
  {
    value: "Admin",
    label: "Admin",
    description: "Manager",
    icon: FiShield,
    dashboard: "/admin/dashboard",
  },
];

function getLoginError(result, response) {
  if (result?.errors) {
    const validationErrors = Object.entries(result.errors)
      .map(([field, messages]) => {
        const messageText = Array.isArray(messages)
          ? messages.join(", ")
          : String(messages);

        return `${field}: ${messageText}`;
      })
      .join("; ");

    if (validationErrors) return validationErrors;
  }

  if (response.status === 401) {
    return "Invalid email or password. Please try again.";
  }

  if (response.status === 403) {
    return "Access denied. Check that you selected the correct portal role.";
  }

  if (response.status >= 500) {
    return "EduTrack's server encountered an error. Please try again later.";
  }

  return (
    result?.message ||
    result?.detail ||
    "Login failed. Please check your credentials and portal role."
  );
}

function Login() {
  const navigate = useNavigate();

  const [role, setRole] = useState("Student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();

    if (loading) return;

    if (!email.trim() || !password) {
      toast.error("Please enter your email address and password.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          role: role.toUpperCase(),
          remember_device: rememberDevice,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) {
        throw new Error(getLoginError(result, response));
      }

      // The EduTrack API may wrap the login payload in result.data.
      const payload = result.data ?? result;
      const user = payload.user ?? result.user;
      const accessToken = payload.access ?? payload.access_token;
      const refreshToken = payload.refresh ?? payload.refresh_token;
      const returnedRole = user?.role ?? payload.role ?? result.role;

      if (!accessToken) {
        throw new Error(
          "The API did not return an access token. Please check the backend login response."
        );
      }

      const normalizedSelectedRole = role.toUpperCase();
      const normalizedReturnedRole = returnedRole
        ? String(returnedRole).toUpperCase()
        : "";

      if (
        normalizedReturnedRole &&
        normalizedReturnedRole !== normalizedSelectedRole
      ) {
        throw new Error(
          "This account does not belong to the selected portal. Please select the correct role."
        );
      }

      const selectedRole = roles.find(
        (item) => item.value.toUpperCase() === normalizedSelectedRole
      );

      if (!selectedRole) {
        throw new Error("Please select a valid EduTrack portal role.");
      }

      const storage = rememberDevice ? localStorage : sessionStorage;
      const otherStorage = rememberDevice ? sessionStorage : localStorage;

      // Remove old credentials from the other storage location.
      otherStorage.removeItem("access_token");
      otherStorage.removeItem("refresh_token");
      otherStorage.removeItem("user");

      storage.setItem("access_token", accessToken);

      if (refreshToken) {
        storage.setItem("refresh_token", refreshToken);
      } else {
        storage.removeItem("refresh_token");
      }

      if (user) {
        storage.setItem("user", JSON.stringify(user));
      } else {
        storage.removeItem("user");
      }

      toast.success(`Welcome to EduTrack, ${selectedRole.label}!`);

      navigate(selectedRole.dashboard, { replace: true });
    } catch (error) {
      console.error("EduTrack login error:", error);

      if (error instanceof TypeError) {
        toast.error(
          "Unable to connect to EduTrack. Check that the backend server is running."
        );
      } else {
        toast.error(
          error.message || "Unable to sign in. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    toast.info(
      "Google sign-in is not connected yet. Configure Google OAuth in your backend to enable it."
    );
  };

  return (
    <main className="login-page">
      <section className="login-layout">
        <aside className="login-promo">
          <Link to="/" className="login-brand">
            <span className="login-brand-icon">
              <FaGraduationCap />
            </span>
            <span>EduTrack</span>
            <span className="login-portal-badge">PORTAL</span>
          </Link>

          <div className="login-welcome">
            <h1>Welcome Back!</h1>
            <p>
              Login to continue your tailored learning journey
              with personalized mentor feedback.
            </p>
          </div>

          <blockquote className="login-quote">
            <span className="login-quote-mark">“</span>
            <p>
              Education is not just about learning, but about
              creating a better future for yourself and the world.
            </p>
            <footer>— EDUTRACK COMMUNITY</footer>
          </blockquote>

          <div className="login-preview">
            <div className="login-preview-top">
              <span>
                <FaGraduationCap /> EduTrack
              </span>
              <span>LEARN · GROW · ACHIEVE</span>
            </div>

            <div className="login-preview-content">
              <div className="login-preview-copy">
                <span className="login-preview-kicker">
                  YOUR LEARNING SPACE
                </span>
                <h3>Welcome Back to EduTrack</h3>
                <p>Continue your journey toward success.</p>
                <div className="login-preview-line" />
                <div className="login-preview-line short" />
                <div className="login-preview-button">
                  Open Dashboard →
                </div>
              </div>

              <div className="login-preview-art">
                <div className="login-art-glow" />
                <FiMonitor />
                <FiBookOpen />
                <FiAward />
              </div>
            </div>

            <div className="login-preview-bottom">
              <span>✦ Live Class Connected</span>
              <strong>ACTIVE SESSION</strong>
            </div>
          </div>

          <div className="login-promo-footer">
            <span>
              <FiShield /> Learn
            </span>
            <i />
            <span>
              <FiBookOpen /> Practice
            </span>
            <i />
            <span>
              <FiTrendingUp /> Grow
            </span>
            <i />
            <span>
              <FiAward /> Achieve
            </span>
          </div>
        </aside>

        <section className="login-form-panel">
          <header className="login-heading">
            <h2>Login to EduTrack</h2>
            <p>
              Enter your credentials to access your interactive
              learning dashboard.
            </p>
          </header>

          <form
  className="login-form"
  onSubmit={handleLogin}
  autoComplete="off"
>
            <div className="login-role-section">
              <label className="login-section-label">
                Select Your Portal Role
              </label>

              <div className="login-role-grid">
                {roles.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      type="button"
                      key={item.value}
                      className={`login-role-card ${
                        role === item.value ? "selected" : ""
                      }`}
                      onClick={() => setRole(item.value)}
                      aria-pressed={role === item.value}
                      disabled={loading}
                    >
                      <span className="login-role-icon">
                        <Icon />
                      </span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="login-field">
              <span className="login-field-heading">
                <span>
                  Email Address <b>*</b>
                </span>
                <small>{role.toUpperCase()} ACCOUNT</small>
              </span>

              <span className="login-input-wrap">
                <FiMail />
               <input
  type="email"
  name="email"
  value={email}
  onChange={(event) => setEmail(event.target.value)}
  placeholder="Enter your email address"
  autoComplete="off"
  required
  disabled={loading}
/>
              </span>
            </label>

            <label className="login-field">
              <span className="login-field-heading">
                <span>
                  Password <b>*</b>
                </span>
              </span>

              <span className="login-input-wrap">
                <FiLock />
                <input
  type={showPassword ? "text" : "password"}
  name="password"
  value={password}
  onChange={(event) => setPassword(event.target.value)}
  placeholder="Enter your password"
  autoComplete="new-password"
  required
  disabled={loading}
/>

                <button
                  type="button"
                  className="login-eye-button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </span>
            </label>

            <div className="login-options">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(event) =>
                    setRememberDevice(event.target.checked)
                  }
                  disabled={loading}
                />
                <span>Remember my device</span>
              </label>

              <Link to="/forgot-password" className="login-forgot">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Login"}
              {!loading && <FiArrowRight />}
            </button>

            <div className="login-divider">
              <span />
              <small>OR</small>
              <span />
            </div>

            <button
              type="button"
              className="login-google"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <FcGoogle size={22} />
              Continue with Google
            </button>

            <p className="login-register">
              Don't have an account?{" "}
              <Link to="/register">Register here</Link>
            </p>
          </form>
        </section>
      </section>
    </main>
  );
}

export default Login;