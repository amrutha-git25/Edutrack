
import { useEffect, useRef, useState } from "react";
import {
  UserRound,
  Camera,
  Mail,
  CalendarDays,
  LockKeyhole,
  Save,
  Pencil,
  X,
  ShieldCheck,
  LoaderCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import "./Profile.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"
).replace(/\/$/, "");

const PROFILE_URL = `${API_BASE}/auth/student/profile/`;
const PICTURE_URL = `${API_BASE}/auth/student/profile/picture/`;
const PASSWORD_URL = `${API_BASE}/auth/student/profile/change-password/`;

function getToken() {
  return (
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("access") ||
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken") ||
    ""
  );
}

async function apiRequest(url, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error("Your login session is missing. Please log in again.");
  }

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Unable to connect to the server. Please check whether Django is running."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : {};

  if (response.status === 401) {
    throw new Error("Your session has expired. Please log in again.");
  }

  if (!response.ok) {
    const message =
      data.detail ||
      data.message ||
      Object.values(data)
        .flat()
        .find((value) => typeof value === "string") ||
      "The request could not be completed.";

    throw new Error(message);
  }

  return data;
}

function getErrorMessage(error) {
  return error?.message || "Something went wrong. Please try again.";
}

function getInitials(firstName = "", lastName = "") {
  const initials = `${firstName.trim().charAt(0)}${lastName
    .trim()
    .charAt(0)}`;

  return initials.toUpperCase() || "ST";
}

function getPictureUrl(profile) {
  const picture = profile?.profile_picture || profile?.profile_image;

  if (!picture) return "";

  if (
    picture.startsWith("http://") ||
    picture.startsWith("https://")
  ) {
    return picture;
  }

  const backendOrigin = API_BASE.replace(/\/api\/?$/, "");

  return `${backendOrigin}${picture.startsWith("/") ? "" : "/"}${picture}`;
}

function PasswordField({
  label,
  name,
  value,
  onChange,
  autoComplete,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="profile-field">
      <span>{label}</span>

      <div className="profile-password-input">
        <input
          type={visible ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
        />

        <button
          className="profile-password-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}

export default function Profile() {
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
  });

  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    confirm_new_password: "",
  });

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState("");

  async function loadProfile(showToast = false) {
    setLoading(true);

    try {
      const data = await apiRequest(PROFILE_URL);
      const student = data.data || data.profile || data.user || data;

      setProfile(student);

      setForm({
        first_name: student.first_name || "",
        last_name: student.last_name || "",
        email: student.email || "",
      });

      if (showToast) {
        toast.success("Profile information refreshed successfully.");
      }
    } catch (error) {
      toast.error("Unable to load your profile.", {
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();

    return () => {
      // Clean up any temporary preview URL.
      setSelectedPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
    };
  }, []);

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handlePasswordChange(event) {
    const { name, value } = event.target;

    setPasswords((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (saving) return;

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim();

    if (!firstName || !lastName || !email) {
      toast.error("Please complete all required profile fields.");
      return;
    }

    setSaving(true);

    try {
      const data = await apiRequest(PROFILE_URL, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
        }),
      });

      const updated = data.data || data.profile || data.user || data;

      setProfile((current) => ({
        ...current,
        ...updated,
      }));

      setForm({
        first_name: updated.first_name ?? firstName,
        last_name: updated.last_name ?? lastName,
        email: updated.email ?? email,
      });

      setEditing(false);

      toast.success(data.message || "Your profile has been updated.");
    } catch (error) {
      toast.error("Failed to update your profile.", {
        description: getErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  }

  async function uploadPicture(event) {
    const file = event.target.files?.[0];

    // Allow selecting the same file again after an upload attempt.
    event.target.value = "";

    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid image format.", {
        description: "Please choose a JPG or PNG image.",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image is too large.", {
        description: "The image must be 5 MB or smaller.",
      });
      return;
    }

    if (uploading) return;

    setUploading(true);

    const body = new FormData();
    body.append("profile_picture", file);

    try {
      const data = await apiRequest(PICTURE_URL, {
        method: "POST",
        body,
      });

      const updated = data.data || data.profile || data.user || data;

      setProfile((current) => ({
        ...current,
        ...updated,
      }));

      setSelectedPreview("");

      toast.success(
        data.message || "Profile picture updated successfully."
      );

      await loadProfile();
    } catch (error) {
      toast.error("Failed to update your profile picture.", {
        description: getErrorMessage(error),
      });
    } finally {
      setUploading(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();

    if (changingPassword) return;

    if (
      !passwords.current_password ||
      !passwords.new_password ||
      !passwords.confirm_new_password
    ) {
      toast.error("Please fill in all password fields.");
      return;
    }

    if (passwords.new_password !== passwords.confirm_new_password) {
      toast.error("Password confirmation does not match.", {
        description: "Enter the same new password in both fields.",
      });
      return;
    }

    if (passwords.new_password === passwords.current_password) {
      toast.error("Choose a different password.", {
        description: "Your new password must differ from your current password.",
      });
      return;
    }

    if (passwords.new_password.length < 8) {
      toast.error("Your new password is too short.", {
        description: "Use at least 8 characters.",
      });
      return;
    }

    setChangingPassword(true);

    try {
      const data = await apiRequest(PASSWORD_URL, {
        method: "POST",
        body: JSON.stringify(passwords),
      });

      setPasswords({
        current_password: "",
        new_password: "",
        confirm_new_password: "",
      });

      toast.success(data.message || "Your password has been changed.");
    } catch (error) {
      toast.error("Unable to change your password.", {
        description: getErrorMessage(error),
      });
    } finally {
      setChangingPassword(false);
    }
  }

  function cancelEditing() {
    setForm({
      first_name: profile?.first_name || "",
      last_name: profile?.last_name || "",
      email: profile?.email || "",
    });

    setEditing(false);

    toast.info("Profile editing cancelled.", {
      description: "Your unsaved changes were discarded.",
    });
  }

  const pictureUrl = selectedPreview || getPictureUrl(profile);

  const displayName =
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    "Student";

  if (loading) {
    return (
      <main className="student-profile-page">
        <div className="profile-loading">
          <LoaderCircle className="profile-spinner" size={28} />
          <p>Loading your profile...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="student-profile-page">
      <header className="profile-page-heading">
        <div>
          <p className="profile-eyebrow">ACCOUNT</p>
          <h1>My Profile</h1>
          <p className="profile-page-subtitle">
            Manage your personal information and account security.
          </p>
        </div>

        <div className="profile-secure-label">
          <ShieldCheck size={18} />
          <span>Personal account</span>
        </div>
      </header>

      <section className="profile-overview-card">
        <div className="profile-cover" />

        <div className="profile-overview-content">
          <div className="profile-avatar-wrap">
            {pictureUrl ? (
              <img
                className="profile-avatar"
                src={pictureUrl}
                alt={`${displayName}'s profile`}
              />
            ) : (
              <div className="profile-avatar profile-avatar--placeholder">
                {getInitials(
                  profile?.first_name,
                  profile?.last_name
                )}
              </div>
            )}

            <button
              className="profile-camera-button"
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Change profile picture"
              title="Change profile picture"
            >
              {uploading ? (
                <LoaderCircle
                  className="profile-spinner"
                  size={17}
                />
              ) : (
                <Camera size={17} />
              )}
            </button>

            <input
              ref={fileInputRef}
              className="profile-hidden-file"
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              onChange={uploadPicture}
            />
          </div>

          <div className="profile-overview-info">
            <h2>{displayName}</h2>

            <p className="profile-overview-email">
              <Mail size={16} />
              {profile?.email || "No email added"}
            </p>

            <span className="profile-role-chip">
              <UserRound size={14} />
              Student
            </span>
          </div>

          <button
            type="button"
            className="profile-secondary-button profile-overview-edit"
            onClick={() => {
              setEditing(true);
              toast.info("You can now edit your profile information.");
            }}
          >
            <Pencil size={16} />
            Edit profile
          </button>
        </div>

        <p className="profile-picture-hint">
          JPG or PNG · Maximum file size 5 MB
        </p>
      </section>

      <div className="profile-content-grid">
        <section className="profile-panel">
          <div className="profile-panel-heading">
            <div className="profile-heading-icon">
              <UserRound size={20} />
            </div>

            <div>
              <h2>Personal information</h2>
              <p>Keep your student details up to date.</p>
            </div>
          </div>

          <form className="profile-form" onSubmit={saveProfile}>
            <div className="profile-form-grid">
              <label className="profile-field">
                <span>First name</span>
                <input
                  name="first_name"
                  value={form.first_name}
                  onChange={handleFormChange}
                  disabled={!editing}
                  required
                  maxLength={150}
                  autoComplete="given-name"
                />
              </label>

              <label className="profile-field">
                <span>Last name</span>
                <input
                  name="last_name"
                  value={form.last_name}
                  onChange={handleFormChange}
                  disabled={!editing}
                  required
                  maxLength={150}
                  autoComplete="family-name"
                />
              </label>

              <label className="profile-field profile-field--full">
                <span>Email address</span>

                <div className="profile-input-with-icon">
                  <Mail size={17} />

                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleFormChange}
                    disabled={!editing}
                    required
                    autoComplete="email"
                  />
                </div>
              </label>

              <div className="profile-field profile-field--full">
                <span>Account created</span>

                <div className="profile-readonly-value">
                  <CalendarDays size={17} />
                  {profile?.date_joined
                    ? new Date(
                        profile.date_joined
                      ).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "Not available"}
                </div>
              </div>
            </div>

            {editing && (
              <div className="profile-form-actions">
                <button
                  className="profile-secondary-button"
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  <X size={16} />
                  Cancel
                </button>

                <button
                  className="profile-primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? (
                    <LoaderCircle
                      className="profile-spinner"
                      size={17}
                    />
                  ) : (
                    <Save size={17} />
                  )}

                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            )}
          </form>
        </section>

        <section className="profile-panel profile-security-panel">
          <div className="profile-panel-heading">
            <div className="profile-heading-icon">
              <LockKeyhole size={20} />
            </div>

            <div>
              <h2>Account security</h2>
              <p>Update your password securely.</p>
            </div>
          </div>

          <form className="profile-form" onSubmit={changePassword}>
            <PasswordField
              label="Current password"
              name="current_password"
              value={passwords.current_password}
              onChange={handlePasswordChange}
              autoComplete="current-password"
            />

            <PasswordField
              label="New password"
              name="new_password"
              value={passwords.new_password}
              onChange={handlePasswordChange}
              autoComplete="new-password"
            />

            <PasswordField
              label="Confirm new password"
              name="confirm_new_password"
              value={passwords.confirm_new_password}
              onChange={handlePasswordChange}
              autoComplete="new-password"
            />

            <p className="profile-password-hint">
              Use a strong password that meets your EduTrack password rules.
            </p>

            <button
              className="profile-primary-button profile-password-submit"
              type="submit"
              disabled={changingPassword}
            >
              {changingPassword ? (
                <LoaderCircle
                  className="profile-spinner"
                  size={17}
                />
              ) : (
                <LockKeyhole size={17} />
              )}

              {changingPassword ? "Updating..." : "Change password"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
