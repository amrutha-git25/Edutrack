// frontend/src/pages/ResetPassword.jsx

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import "./ResetPassword.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com/api"
).replace(/\/+$/, "") + "/auth";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const uid = searchParams.get("uid");
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const requirements = [
    { label: "At least 8 characters", test: password.length >= 8 },
    { label: "One uppercase letter", test: /[A-Z]/.test(password) },
    { label: "One lowercase letter", test: /[a-z]/.test(password) },
    { label: "One number", test: /\d/.test(password) },
    {
      label: "One special character",
      test: /[^A-Za-z0-9]/.test(password),
    },
  ];

  const passwordValid = requirements.every((item) => item.test);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!uid || !token) {
      toast.error("Invalid reset link", {
        description: "Request a new password-reset email.",
      });
      return;
    }

    if (!passwordValid) {
      toast.error("Password does not meet the requirements.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/password-reset/confirm/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uid,
            token,
            new_password: password,
            confirm_password: confirmPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message || "Unable to reset your password."
        );
      }

      setCompleted(true);

      toast.success("Password reset successfully!", {
        description: "You can now log in with your new password.",
      });
    } catch (error) {
      toast.error("Password reset failed", {
        description:
          error.message ||
          "Unable to connect to the server. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!uid || !token) {
    return (
      <main className="reset-page">
        <section className="reset-card reset-error">
          <div className="reset-icon">
            <ShieldCheck size={30} />
          </div>

          <h1>Invalid Reset Link</h1>
          <p>
            This link is incomplete or invalid. Please request a
            new password-reset email.
          </p>

          <Link to="/forgot-password" className="reset-primary-btn">
            Request New Link
          </Link>

          <Link to="/login" className="reset-back-link">
            <ArrowLeft size={16} /> Back to Login
          </Link>
        </section>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="reset-page">
        <section className="reset-card reset-success">
          <div className="reset-icon">
            <ShieldCheck size={30} />
          </div>

          <h1>Password Updated!</h1>
          <p>
            Your EduTrack password has been changed successfully.
            Log in using your new password.
          </p>

          <button
            type="button"
            className="reset-primary-btn"
            onClick={() => navigate("/login")}
          >
            Continue to Login
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="reset-page">
      <section className="reset-card">
        <Link to="/login" className="reset-back-link">
          <ArrowLeft size={16} />
          Back to Login
        </Link>

        <div className="reset-brand">
          <div className="reset-icon">
            <LockKeyhole size={30} />
          </div>

          <span>EduTrack</span>
        </div>

        <h1>Create New Password</h1>

        <p className="reset-subtitle">
          Choose a strong password to secure your account.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="new-password">New Password</label>

          <div className="reset-input-wrap">
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              required
              disabled={loading}
            />

            <button
              type="button"
              className="reset-eye-btn"
              onClick={() => setShowPassword((previous) => !previous)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>

          <div className="reset-requirements">
            {requirements.map((item) => (
              <div
                key={item.label}
                className={
                  item.test
                    ? "reset-requirement valid"
                    : "reset-requirement"
                }
              >
                <span>{item.test ? "✓" : "○"}</span>
                {item.label}
              </div>
            ))}
          </div>

          <label htmlFor="confirm-password">Confirm Password</label>

          <div className="reset-input-wrap">
            <input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              placeholder="Re-enter new password"
              autoComplete="new-password"
              required
              disabled={loading}
            />

            <button
              type="button"
              className="reset-eye-btn"
              onClick={() =>
                setShowConfirmPassword((previous) => !previous)
              }
              aria-label={
                showConfirmPassword ? "Hide password" : "Show password"
              }
            >
              {showConfirmPassword ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>
          </div>

          {confirmPassword && (
            <p
              className={
                password === confirmPassword
                  ? "reset-match valid"
                  : "reset-match"
              }
            >
              {password === confirmPassword
                ? "Passwords match"
                : "Passwords do not match"}
            </p>
          )}

          <button
            type="submit"
            className="reset-primary-btn"
            disabled={loading}
          >
            {loading ? "Updating Password..." : "Reset Password"}
          </button>
        </form>

        <p className="reset-footer">
          Your security matters. Never share your password with anyone.
        </p>
      </section>
    </main>
  );
}