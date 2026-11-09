
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FcGoogle } from "react-icons/fc";
import {
  FiArrowRight,
  FiArrowUpRight,
  FiBookOpen,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiPhone,
  FiShield,
  FiUsers,
  FiUser,
  FiAward,
  FiMonitor,
  FiHeadphones,
  FiRefreshCw,
} from 'react-icons/fi';
import { FaGraduationCap } from 'react-icons/fa6';
import { toast } from 'sonner';
import './Registration.css';

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com/api"
).replace(/\/+$/, "") + "/auth";

const initialForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone_number: '',
  password: '',
  confirm_password: '',
  role: 'Student',
};

function getApiError(data, fallback) {
  if (data?.errors) {
    const errors = Object.entries(data.errors)
      .map(([field, messages]) => {
        const text = Array.isArray(messages)
          ? messages.join(', ')
          : String(messages);

        return `${field}: ${text}`;
      })
      .join('; ');

    if (errors) return errors;
  }

  return data?.detail || data?.message || fallback;
}

function Registration() {
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const validateForm = () => {
    if (
      !form.first_name.trim() ||
      !form.last_name.trim() ||
      !form.email.trim() ||
      !form.phone_number.trim() ||
      !form.password ||
      !form.confirm_password
    ) {
      toast.error('Please complete all required fields.');
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error('Please enter a valid email address.');
      return false;
    }

    if (!/^[0-9]{10}$/.test(form.phone_number)) {
      toast.error('Enter a valid 10-digit Indian mobile number.');
      return false;
    }

    const strongPassword =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

    if (!strongPassword.test(form.password)) {
      toast.error(
        'Password must contain 8+ characters, uppercase, lowercase, a number and a special character.'
      );
      return false;
    }

    if (form.password !== form.confirm_password) {
      toast.error('Passwords do not match.');
      return false;
    }

    if (!acceptedTerms) {
      toast.error('Please accept the Terms of Service and Privacy Policy.');
      return false;
    }

    return true;
  };

  const sendOtp = async (event) => {
    event.preventDefault();

    if (loading || !validateForm()) return;

    setLoading(true);

    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone_number: form.phone_number.trim(),
        password: form.password,
        confirm_password: form.confirm_password,
        role: form.role.toUpperCase(),
      };

      const response = await fetch(`${API_BASE}/register/send-otp/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          getApiError(data, 'Unable to send OTP. Please try again.')
        );
      }

      // Keep the pending registration data only for this browser session.
      sessionStorage.setItem(
        'edutrack_pending_registration',
        JSON.stringify(payload)
      );
      sessionStorage.removeItem('edutrack_email_verification_token');

      toast.success(`Verification code sent to ${form.email.trim()}.`);
      navigate('/verify-otp', {
        state: { email: form.email.trim().toLowerCase() },
      });
    } catch (err) {
      console.error('Send OTP error:', err);

      toast.error(
        err.message || 'Could not connect to the backend.'
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (loading) return;

    if (!/^\d{6}$/.test(otp)) {
      toast.error('Enter the 6-digit OTP sent to your email.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/register/verify-otp/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          otp,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          getApiError(data, 'OTP verification failed.')
        );
      }

      const token =
        data.verification_token ||
        data.token ||
        data.data?.verification_token ||
        data.data?.token ||
        '';

      setVerificationToken(token);
      setOtpVerified(true);

      toast.success(
        data.message ||
          'Email verified successfully. Continue to create your account.'
      );
    } catch (err) {
      console.error('OTP verification error:', err);

      toast.error(err.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (loading) return;

    if (!form.email.trim()) {
      toast.error('Enter your email address first.');
      return;
    }

    setLoading(true);
    setOtp('');

    try {
      const response = await fetch(`${API_BASE}/register/resend-otp/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          getApiError(data, 'Unable to resend OTP.')
        );
      }

      setOtpSent(true);
      setOtpVerified(false);
      setVerificationToken('');

      toast.success('A new verification code has been sent to your email.');
    } catch (err) {
      console.error('Resend OTP error:', err);

      toast.error(err.message || 'Unable to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  const registerAccount = async () => {
    if (loading) return;

    if (!otpVerified) {
      toast.error('Please verify your email before registering.');
      return;
    }

    if (!verificationToken) {
      toast.error(
        'Email verification succeeded, but the backend did not return a verification token. Check the verify-OTP API response and backend implementation.'
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Email-Verification-Token': verificationToken,
        },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone_number: form.phone_number.trim(),
          password: form.password,
          confirm_password: form.confirm_password,
          role: form.role.toUpperCase(),
          verification_token: verificationToken,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          getApiError(data, 'Registration failed. Please try again.')
        );
      }

      toast.success(
        data.message || 'Account created successfully! Redirecting to login...'
      );

      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      console.error('Account registration error:', err);

      toast.error(err.message || 'Unable to create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="registration-page">
      <header className="registration-header">
        <Link to="/" className="registration-brand">
          <span className="registration-brand-icon">
            <FaGraduationCap />
          </span>
          <span>EduTrack</span>
        </Link>

        <div className="registration-header-login">
          <span>Already have an account?</span>
          <Link to="/login" className="registration-signin">
            Sign In
          </Link>
        </div>
      </header>

      <section className="registration-layout">
        <aside className="registration-promo">
          <div className="registration-pill">
            <FiUsers />
            JOIN 40,000+ ENROLLED LEARNERS
          </div>

          <h1>
            Start Your Learning
            <br />
            Journey Today!
          </h1>

          <p className="registration-promo-description">
            Empower your potential with world-class mentors,
            tailored tracks, and community-backed credentials.
          </p>

          <div className="registration-benefits">
            <div className="registration-benefit">
              <span className="registration-benefit-icon">
                <FiUsers />
              </span>
              <div>
                <strong>Learn from Expert Mentors</strong>
                <span>One-on-one personalized review sessions</span>
              </div>
            </div>

            <div className="registration-benefit">
              <span className="registration-benefit-icon">
                <FiBookOpen />
              </span>
              <div>
                <strong>Access Quality Courses</strong>
                <span>Updated syllabuses designed by industry leaders</span>
              </div>
            </div>

            <div className="registration-benefit">
              <span className="registration-benefit-icon">
                <FiCheckCircle />
              </span>
              <div>
                <strong>Take Assignments & Exams</strong>
                <span>Real-time benchmark tests and dynamic feedback</span>
              </div>
            </div>

            <div className="registration-benefit">
              <span className="registration-benefit-icon">
                <FiAward />
              </span>
              <div>
                <strong>Earn Certificates</strong>
                <span>Accredited and shareable credentials</span>
              </div>
            </div>
          </div>

          <div className="registration-promo-art">
            <div className="registration-art-top">
              <span>
                <FaGraduationCap /> EduTrack
              </span>
              <span>✦</span>
            </div>

            <div className="registration-art-center">
              <div className="registration-art-icon">
                <FiBookOpen />
              </div>
              <div>
                <strong>Learn without limits.</strong>
                <p>Discover. Practice. Grow.</p>
              </div>
              <FiMonitor className="registration-art-monitor" />
            </div>

            <div className="registration-live">
              <span><i /> Live Class in Progress</span>
              <span>540 watching</span>
            </div>
          </div>

          <div className="registration-promo-footer">
            LEARN <span>•</span> PRACTICE <span>•</span> GROW <span>•</span> ACHIEVE
          </div>
        </aside>

        <section className="registration-form-panel">
          <div className="registration-form-heading">
            <h2>Create Your Account</h2>
            <p>
              Join EduTrack and be a part of our thriving global learning community.
            </p>
          </div>

          <form onSubmit={sendOtp} className="registration-form">
            <div className="registration-field-grid">
              <label className="registration-field">
                <span>First Name <b>*</b></span>
                <div className="registration-input">
                  <FiUser />
                  <input
                    name="first_name"
                    value={form.first_name}
                    onChange={updateField}
                    placeholder="e.g. Alex"
                    autoComplete="given-name"
                    required
                    disabled={loading || otpSent}
                  />
                </div>
              </label>

              <label className="registration-field">
                <span>Last Name <b>*</b></span>
                <div className="registration-input">
                  <FiUser />
                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={updateField}
                    placeholder="e.g. Vance"
                    autoComplete="family-name"
                    required
                    disabled={loading || otpSent}
                  />
                </div>
              </label>

              <label className="registration-field registration-field-full">
                <span>Email Address <b>*</b></span>
                <div className="registration-input">
                  <FiMail />
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={updateField}
                    placeholder="alex.vance@example.com"
                    autoComplete="email"
                    required
                    disabled={otpSent}
                  />
                </div>
              </label>

              <label className="registration-field registration-field-full">
                <span>Phone Number <b>*</b></span>
                <div className="registration-input">
                  <FiPhone />
                  <span className="registration-country-code">+91</span>
                  <input
                    name="phone_number"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.phone_number}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        phone_number: event.target.value.replace(/\D/g, ''),
                      }))
                    }
                    placeholder="98765 43210"
                    autoComplete="tel-national"
                    required
                    disabled={loading || otpSent}
                  />
                </div>
              </label>

              <label className="registration-field">
                <span>Password <b>*</b></span>
                <div className="registration-input">
                  <FiLock />
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={updateField}
                    placeholder="Create password"
                    autoComplete="new-password"
                    required
                    disabled={loading || otpSent}
                  />
                  <button
                    type="button"
                    className="registration-eye"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </label>

              <label className="registration-field">
                <span>Confirm Password <b>*</b></span>
                <div className="registration-input">
                  <FiLock />
                  <input
                    name="confirm_password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={form.confirm_password}
                    onChange={updateField}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    required
                    disabled={loading || otpSent}
                  />
                  <button
                    type="button"
                    className="registration-eye"
                    onClick={() =>
                      setShowConfirmPassword((value) => !value)
                    }
                    aria-label={
                      showConfirmPassword
                        ? 'Hide confirm password'
                        : 'Show confirm password'
                    }
                  >
                    {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </label>
            </div>

            <div className="registration-password-hint">
              <FiShield />
              <span>
                Use at least 8 characters, including uppercase and lowercase
                letters, a number, and a special character.
              </span>
            </div>

            <div className="registration-role-section">
              <span className="registration-role-title">
                Select Role <b>*</b>
              </span>

              <div className="registration-role-grid">
                <button
                  type="button"
                  className={`registration-role-card ${
                    form.role === 'Student' ? 'selected' : ''
                  }`}
                  onClick={() =>
                    setForm((previous) => ({ ...previous, role: 'Student' }))
                  }
                  aria-pressed={form.role === 'Student'}
                  disabled={loading || otpSent}
                >
                  <span className="registration-role-icon">
                    <FaGraduationCap />
                  </span>
                  <strong>Student</strong>
                  <small>I want to learn</small>
                </button>

                <button
                  type="button"
                  className={`registration-role-card ${
                    form.role === 'Mentor' ? 'selected' : ''
                  }`}
                  onClick={() =>
                    setForm((previous) => ({ ...previous, role: 'Mentor' }))
                  }
                  aria-pressed={form.role === 'Mentor'}
                  disabled={loading || otpSent}
                >
                  <span className="registration-role-icon">
                    <FiUsers />
                  </span>
                  <strong>Mentor</strong>
                  <small>I want to teach</small>
                </button>
              </div>
            </div>

            <label className="registration-terms">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                disabled={loading || otpSent}
              />
              <span>
                I agree to EduTrack's <a href="/terms">Terms of Service</a> and
                acknowledge the <a href="/privacy">Privacy Policy</a>.
              </span>
            </label>

            {!otpSent && (
              <button
                type="submit"
                className="registration-submit"
                disabled={loading}
              >
                {loading ? 'Sending OTP...' : 'Send OTP'}
                {loading ? (
                  <FiRefreshCw className="registration-spinner" />
                ) : (
                  <FiArrowRight />
                )}
              </button>
            )}

            {otpSent && !otpVerified && (
              <div className="registration-otp-panel">
                <h3>Verify your email</h3>
                <p>Enter the 6-digit code sent to your email address.</p>

                <label className="registration-field">
                  <span>Email OTP <b>*</b></span>
                  <div className="registration-input">
                    <FiMail />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="Enter 6-digit OTP"
                      value={otp}
                      onChange={(event) =>
                        setOtp(event.target.value.replace(/\D/g, ''))
                      }
                      disabled={loading}
                    />
                  </div>
                </label>

                <button
                  type="button"
                  className="registration-submit"
                  onClick={verifyOtp}
                  disabled={loading}
                >
                  {loading ? 'Verifying...' : 'Verify OTP'}
                  <FiArrowRight />
                </button>

                <button
                  type="button"
                  className="registration-resend"
                  onClick={resendOtp}
                  disabled={loading}
                >
                  {loading ? 'Please wait...' : 'Resend OTP'}
                </button>
              </div>
            )}

            {otpVerified && (
              <div className="registration-verified-panel">
                <FiCheckCircle />
                <span>Email verified successfully</span>
              </div>
            )}

            {otpVerified && (
              <button
                type="button"
                className="registration-submit"
                onClick={registerAccount}
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
                <FiArrowUpRight />
              </button>
            )}

            <div className="registration-divider">
              <span />
              <small>OR JOIN WITH</small>
              <span />
            </div>

            <button
              type="button"
              className="registration-google"
              onClick={() =>
                toast.info(
                  'Google sign-in must be connected to your authentication backend.'
                )
              }
              disabled={loading}
            >
              <FcGoogle size={22} />
              Continue with Google
            </button>

            <p className="registration-bottom-login">
              Already have an account? <Link to="/login">Login here</Link>
            </p>
          </form>
        </section>
      </section>

      <footer className="registration-trust">
        <div>
          <FiShield />
          <span>
            <strong>256-Bit SSL</strong>
            <small>End-to-end data safety</small>
          </span>
        </div>
        <div>
          <FiHeadphones />
          <span>
            <strong>24/7 Support</strong>
            <small>Always ready to help</small>
          </span>
        </div>
        <div>
          <FiMonitor />
          <span>
            <strong>HD Lectures</strong>
            <small>Watch anywhere anytime</small>
          </span>
        </div>
        <div>
          <FiAward />
          <span>
            <strong>Verified Badges</strong>
            <small>Share on professional apps</small>
          </span>
        </div>
      </footer>
    </main>
  );
}

export default Registration;
