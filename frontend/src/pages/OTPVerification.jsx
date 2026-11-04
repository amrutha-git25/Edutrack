
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FaGraduationCap } from "react-icons/fa6";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheckCircle,
  FiMail,
  FiRefreshCw,
  FiShield,
} from "react-icons/fi";
import { toast } from "sonner";
import "./OTPVerification.css";

const API_BASE = "http://127.0.0.1:8000/api/auth";
const PENDING_KEY = "edutrack_pending_registration";
const TOKEN_KEY = "edutrack_email_verification_token";

function getApiError(data, fallback) {
  if (data?.errors) {
    const errors = Object.entries(data.errors)
      .map(([field, messages]) =>
        `${field}: ${
          Array.isArray(messages) ? messages.join(", ") : String(messages)
        }`
      )
      .join("; ");

    if (errors) return errors;
  }

  return data?.detail || data?.message || fallback;
}

export default function OTPVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRefs = useRef([]);

  const [email, setEmail] = useState(location.state?.email || "");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState(
    sessionStorage.getItem(TOKEN_KEY) || ""
  );

  useEffect(() => {
    try {
      const pending = JSON.parse(
        sessionStorage.getItem(PENDING_KEY) || "null"
      );

      if (!pending?.email) {
        toast.error("Registration details were not found. Please register again.");
        navigate("/register", { replace: true });
        return;
      }

      setEmail(location.state?.email || pending.email);
    } catch {
      toast.error(
        "Unable to recover your registration details. Please register again."
      );
      navigate("/register", { replace: true });
    }
  }, [location.state, navigate]);

  const updateDigit = (index, rawValue) => {
    if (loading || verified) return;

    const value = rawValue.replace(/\D/g, "");

    if (!value) {
      setDigits((previous) =>
        previous.map((digit, i) => (i === index ? "" : digit))
      );
      return;
    }

    // Automatically distribute pasted or autofilled digits.
    if (value.length > 1) {
      const pasted = value.slice(0, 6).split("");

      setDigits(
        Array.from({ length: 6 }, (_, i) => pasted[i] || "")
      );

      inputRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
      return;
    }

    setDigits((previous) =>
      previous.map((digit, i) => (i === index ? value : digit))
    );

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (event, index) => {
    if (
      event.key === "Backspace" &&
      !digits[index] &&
      index > 0
    ) {
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!pasted) return;

    event.preventDefault();

    setDigits(
      Array.from({ length: 6 }, (_, i) => pasted[i] || "")
    );

    inputRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
  };

  const verifyOtp = async (event) => {
    event.preventDefault();

    if (loading) return;

    const otp = digits.join("");

    if (!/^\d{6}$/.test(otp)) {
      toast.error("Enter the complete 6-digit OTP.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE}/register/verify-otp/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            otp,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          getApiError(data, "OTP verification failed.")
        );
      }

      const token =
        data.verification_token ||
        data.token ||
        data.data?.verification_token ||
        data.data?.token ||
        "";

      if (!token) {
        throw new Error(
          "OTP verified, but the server did not return a verification token. Check the verify-OTP API response."
        );
      }

      sessionStorage.setItem(TOKEN_KEY, token);
      setVerificationToken(token);
      setVerified(true);

      toast.success(data.message || "Email verified successfully.");
    } catch (error) {
      toast.error(error.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (loading) return;

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE}/register/resend-otp/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          getApiError(data, "Unable to resend OTP.")
        );
      }

      setDigits(["", "", "", "", "", ""]);
      setVerified(false);
      setVerificationToken("");
      sessionStorage.removeItem(TOKEN_KEY);
      inputRefs.current[0]?.focus();

      toast.success(
        data.message || "A new verification code has been sent."
      );
    } catch (error) {
      toast.error(error.message || "Unable to resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async () => {
    if (loading) return;

    if (!verified || !verificationToken) {
      toast.error("Please verify your email first.");
      return;
    }

    let pending;

    try {
      pending = JSON.parse(
        sessionStorage.getItem(PENDING_KEY) || "null"
      );
    } catch {
      pending = null;
    }

    if (!pending) {
      toast.error("Registration details were not found. Please register again.");
      navigate("/register", { replace: true });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/register/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Email-Verification-Token": verificationToken,
        },
        body: JSON.stringify({
          ...pending,
          verification_token: verificationToken,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          getApiError(data, "Registration failed. Please try again.")
        );
      }

      sessionStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem(TOKEN_KEY);

      toast.success(data.message || "Account created successfully.");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(error.message || "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  };

  const goBackToRegistration = () => {
    sessionStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  };

  return (
    <main className="otp-page">
      <header className="otp-header">
        <Link to="/" className="otp-brand">
          <span className="otp-brand-icon">
            <FaGraduationCap />
          </span>
          <span>EduTrack</span>
        </Link>

        <span className="otp-secure-label">
          <FiShield /> Secure verification
        </span>
      </header>

      <section className="otp-card">
        <div className={`otp-hero-icon ${verified ? "is-verified" : ""}`}>
          {verified ? <FiCheckCircle /> : <FiMail />}
        </div>

        <p className="otp-eyebrow">EMAIL VERIFICATION</p>

        <h1>{verified ? "Email verified!" : "Check your inbox"}</h1>

        <p className="otp-description">
          {verified
            ? "Your email address has been verified. Create your EduTrack account to continue."
            : "We sent a 6-digit verification code to"}
        </p>

        <strong className="otp-email">{email}</strong>

        {!verified ? (
          <form onSubmit={verifyOtp}>
            <label className="otp-label">
              Enter your 6-digit code
            </label>

            <div className="otp-inputs" onPaste={handlePaste}>
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputRefs.current[index] = element;
                  }}
                  className={`otp-digit ${digit ? "has-value" : ""}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`OTP digit ${index + 1}`}
                  value={digit}
                  maxLength={6}
                  onChange={(event) =>
                    updateDigit(index, event.target.value)
                  }
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  disabled={loading}
                />
              ))}
            </div>

            <button
              className="otp-primary-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Verifying..." : "Verify email"}
              {loading ? (
                <FiRefreshCw className="otp-spin" />
              ) : (
                <FiArrowRight />
              )}
            </button>

            <p className="otp-resend-text">
              Didn't receive the code?{" "}
              <button
                type="button"
                onClick={resendOtp}
                disabled={loading}
              >
                Resend OTP
              </button>
            </p>
          </form>
        ) : (
          <button
            className="otp-primary-button"
            type="button"
            onClick={createAccount}
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create account"}
            {loading ? (
              <FiRefreshCw className="otp-spin" />
            ) : (
              <FiArrowRight />
            )}
          </button>
        )}

        <Link
          to="/register"
          className="otp-back-link"
          onClick={goBackToRegistration}
        >
          <FiArrowLeft /> Back to registration
        </Link>

        <div className="otp-security-note">
          <FiShield />
          <span>
            Your verification code is private. Never share it with anyone.
          </span>
        </div>
      </section>

      <footer className="otp-footer">
        © EduTrack · Learn. Grow. Achieve.
      </footer>
    </main>
  );
}
