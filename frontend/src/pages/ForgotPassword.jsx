import { useState } from "react";
import { Link } from "react-router-dom";
import {
  FiArrowLeft,
  FiArrowRight,
  FiBookOpen,
  FiCheckCircle,
  FiLock,
  FiMail,
  FiShield,
} from "react-icons/fi";
import { toast } from "sonner";
import "./ForgotPassword.css";

const API_URL = "http://127.0.0.1:8000/api/auth/password-reset/";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      toast.error("Please enter your registered email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message ||
            result.detail ||
            "Unable to process your request. Please try again."
        );
      }

      setSubmitted(true);
      toast.success("Password-reset request submitted.");
    } catch (error) {
      toast.error(
        error.message ||
          "Unable to connect to EduTrack. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="forgot-page">
      <div className="forgot-background-glow forgot-glow-one" />
      <div className="forgot-background-glow forgot-glow-two" />

      <section className="forgot-shell">
        <aside className="forgot-brand-panel">
          <Link to="/login" className="forgot-brand">
            <span className="forgot-brand-icon">
              <FiBookOpen />
            </span>
            <span>
              <strong>EduTrack</strong>
              <small>LEARN. GROW. ACHIEVE.</small>
            </span>
          </Link>

          <div className="forgot-brand-content">
            <span className="forgot-security-icon">
              <FiShield />
            </span>
            <p className="forgot-eyebrow">ACCOUNT RECOVERY</p>
            <h1>
              Your learning journey
              <span> continues here.</span>
            </h1>
            <p className="forgot-brand-description">
              Recover access to your EduTrack account and get back to
              learning, tracking progress, and achieving your goals.
            </p>

            <div className="forgot-feature">
              <FiCheckCircle />
              <span>Secure password recovery</span>
            </div>
            <div className="forgot-feature">
              <FiCheckCircle />
              <span>Protect your account</span>
            </div>
            <div className="forgot-feature">
              <FiCheckCircle />
              <span>Continue learning without interruption</span>
            </div>
          </div>

          <p className="forgot-brand-footer">
            Your education. Your progress. Your future.
          </p>
        </aside>

        <section className="forgot-form-panel">
          <Link to="/login" className="forgot-back-link">
            <FiArrowLeft />
            Back to login
          </Link>

          {!submitted ? (
            <div className="forgot-form-content">
              <div className="forgot-main-icon">
                <FiLock />
              </div>

              <p className="forgot-form-eyebrow">PASSWORD ASSISTANCE</p>
              <h2>Forgot password?</h2>
              <p className="forgot-description">
                No worries. Enter the email address associated with your
                EduTrack account, and we'll help you reset your password.
              </p>

              <form onSubmit={handleSubmit} className="forgot-form">
                <label htmlFor="forgot-email">Email address</label>

                <div className="forgot-input-wrap">
                  <FiMail />
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Enter your registered email"
                    autoComplete="email"
                    required
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  className="forgot-submit"
                  disabled={loading}
                >
                  {loading ? "Sending request..." : "Send reset link"}
                  {!loading && <FiArrowRight />}
                </button>
              </form>

              <div className="forgot-help-note">
                <FiShield />
                <p>
                  For your security, only use a password-reset link sent
                  through EduTrack's verified recovery process.
                </p>
              </div>
            </div>
          ) : (
            <div className="forgot-success-content">
              <div className="forgot-success-icon">
                <FiCheckCircle />
              </div>

              <p className="forgot-form-eyebrow">REQUEST SUBMITTED</p>
              <h2>Check your email</h2>
              <p className="forgot-description">
                If an account exists for <strong>{email.trim()}</strong>,
                password-reset instructions will be sent to that address.
                Check your inbox and spam folder.
              </p>

              <button
                type="button"
                className="forgot-submit"
                onClick={() => {
                  setSubmitted(false);
                  setEmail("");
                }}
              >
                Try another email
              </button>

              <Link to="/login" className="forgot-return-link">
                <FiArrowLeft />
                Return to login
              </Link>
            </div>
          )}

          <p className="forgot-bottom-text">
            Remember your password? <Link to="/login">Sign in</Link>
          </p>
        </section>
      </section>
    </main>
  );
}