
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useAdminTheme } from "../../context/ThemeContext";
import "./Profile.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api"
).replace(/\/$/, "");

const PROFILE_URL = `${API_BASE}/auth/profile/`;
const UPDATE_URL = `${API_BASE}/auth/profile/update/`;
const PHOTO_URL = `${API_BASE}/auth/profile/photo/`;
const REMOVE_PHOTO_URL = `${API_BASE}/auth/profile/photo/remove/`;
const PASSWORD_URL = `${API_BASE}/auth/change-password/`;

const emptyProfile = {
  first_name: "",
  last_name: "",
  email: "",
  phone_number: "",
  profile_picture: null,
};

function getAccessToken() {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");

  if (!token) return null;

  const normalizedToken = token.replace(/^Bearer\s+/i, "").trim();

  try {
    const parts = normalizedToken.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");

    const payload = JSON.parse(atob(base64));

    if (
      payload.token_type !== "access" ||
      !payload.exp ||
      payload.exp * 1000 <= Date.now()
    ) {
      return null;
    }

    return normalizedToken;
  } catch {
    return null;
  }
}

async function apiRequest(url, options = {}) {
  const token = getAccessToken();

  if (!token) {
    throw new Error(
      "Your login token is invalid or expired. Please log out of EduTrack and log in again."
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  // Let the browser set the multipart boundary for FormData.
  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errors = data.errors || data;

    const detail =
      data.message ||
      data.detail ||
      data.code ||
      Object.values(errors)
        .flat()
        .filter((item) => typeof item === "string")
        .join(" ") ||
      "Something went wrong. Please try again.";

    if (response.status === 401) {
      throw new Error(
        "Your session is invalid or expired. Log out of EduTrack and log in again."
      );
    }

    if (response.status === 403) {
      throw new Error(
        "Access denied. You do not have permission to perform this action."
      );
    }

    throw new Error(detail);
  }

  return data;
}

function getProfileData(response) {
  return response?.data || response?.profile || response || emptyProfile;
}

export default function Profile() {
  const { theme } = useAdminTheme();

  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  const [profile, setProfile] = useState(emptyProfile);
  const [form, setForm] = useState(emptyProfile);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [authenticatedPhotoSrc, setAuthenticatedPhotoSrc] = useState("");
  const [activeTab, setActiveTab] = useState("personal");

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const notify = (type, message) => {
    if (type === "success") {
      toast.success(message);
    } else if (type === "info") {
      toast.info(message);
    } else if (type === "warning") {
      toast.warning(message);
    } else {
      toast.error(message);
    }
  };

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);

      try {
        const response = await apiRequest(PROFILE_URL);
        const data = getProfileData(response);

        if (!active) return;

        const normalized = {
          ...emptyProfile,
          ...data,
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          email: data.email || "",
          phone_number: data.phone_number || "",
          profile_picture: data.profile_picture || null,
        };

        setProfile(normalized);

        setForm({
          first_name: normalized.first_name,
          last_name: normalized.last_name,
          email: normalized.email,
          phone_number: normalized.phone_number,
        });
      } catch (error) {
        if (active) {
          notify("error", error.message || "Unable to load your profile.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      active = false;

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // Fetch the protected profile image with the JWT; <img> cannot attach
  // the Authorization header itself.
  useEffect(() => {
    let active = true;
    let objectUrl = null;

    async function loadAuthenticatedPhoto() {
      const photoUrl = profile.profile_picture;

      if (!photoUrl) {
        setAuthenticatedPhotoSrc("");
        return;
      }

      const token = getAccessToken();

      if (!token) {
        setAuthenticatedPhotoSrc("");
        return;
      }

      try {
        const response = await fetch(photoUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Unable to load profile photo.");
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (active) {
          setAuthenticatedPhotoSrc(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (active) setAuthenticatedPhotoSrc("");
      }
    }

    loadAuthenticatedPhoto();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile.profile_picture]);

  const fullName =
    `${profile.first_name} ${profile.last_name}`.trim() || "Administrator";

  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  const setField = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();

    if (saving) return;

    if (!form.first_name.trim() || !form.last_name.trim()) {
      notify("error", "Please enter your first and last name.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      notify("error", "Enter a valid email address.");
      return;
    }

    if (form.phone_number && !/^[6-9]\d{9}$/.test(form.phone_number)) {
      notify("error", "Enter a valid 10-digit Indian mobile number.");
      return;
    }

    setSaving(true);

    try {
      const response = await apiRequest(UPDATE_URL, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone_number: form.phone_number.trim(),
        }),
      });

      const updated = getProfileData(response);

      setProfile((current) => ({
        ...current,
        ...updated,
      }));

      setForm({
        first_name: updated.first_name ?? form.first_name.trim(),
        last_name: updated.last_name ?? form.last_name.trim(),
        email: updated.email ?? form.email.trim(),
        phone_number: updated.phone_number ?? form.phone_number.trim(),
      });

      notify(
        "success",
        response?.message || "Your profile details have been saved."
      );
    } catch (error) {
      notify("error", error.message || "Unable to save profile details.");
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];

    // Permit selecting the same file again after validation or cancellation.
    event.target.value = "";

    if (!file) return;

    const validType = ["image/jpeg", "image/png"].includes(file.type);

    if (!validType) {
      notify("error", "Choose a JPG or PNG image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notify("error", "The image must be 5 MB or smaller.");
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    const objectUrl = URL.createObjectURL(file);

    previewUrlRef.current = objectUrl;
    setSelectedFile(file);
    setPreview(objectUrl);

    notify("success", "Preview ready. Select Save photo to upload it.");
  };

  const handleUploadPhoto = async () => {
    if (uploading || removingPhoto) return;

    if (!selectedFile) {
      fileInputRef.current?.click();
      return;
    }

    setUploading(true);

    try {
      const body = new FormData();
      body.append("profile_picture", selectedFile);

      const response = await apiRequest(PHOTO_URL, {
        method: "POST",
        body,
      });

      const updated = getProfileData(response);

      setProfile((current) => ({
        ...current,
        ...updated,
        profile_picture:
          updated.profile_picture ?? current.profile_picture,
      }));

      setSelectedFile(null);
      setPreview("");

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      notify("success", "Profile photo updated successfully.");
    } catch (error) {
      notify("error", error.message || "Unable to upload profile photo.");
    } finally {
      setUploading(false);
    }
  };

  const handleCancelPreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setSelectedFile(null);
    setPreview("");

    notify("info", "Photo preview cancelled.");
  };

  const handleRemovePhoto = async () => {
    if (uploading || removingPhoto) return;

    if (selectedFile) {
      handleCancelPreview();
      return;
    }

    if (!profile.profile_picture) {
      notify("info", "There is no profile photo to remove.");
      return;
    }

    setRemovingPhoto(true);

    try {
      const response = await apiRequest(REMOVE_PHOTO_URL, {
        method: "DELETE",
      });

      const updated = getProfileData(response);

      setProfile((current) => ({
        ...current,
        ...updated,
        profile_picture: null,
      }));

      notify("success", "Profile photo removed.");
    } catch (error) {
      notify("error", error.message || "Unable to remove profile photo.");
    } finally {
      setRemovingPhoto(false);
    }
  };

  const setPasswordField = (event) => {
    const { name, value } = event.target;

    setPasswords((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const togglePassword = (field) => {
    setShowPasswords((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();

    if (changingPassword) return;

    if (
      !passwords.current_password ||
      !passwords.new_password ||
      !passwords.confirm_password
    ) {
      notify("error", "Complete all password fields.");
      return;
    }

    if (passwords.new_password === passwords.current_password) {
      notify(
        "error",
        "Your new password must be different from your current password."
      );
      return;
    }

    if (
      passwords.new_password.length < 8 ||
      !/[A-Z]/.test(passwords.new_password) ||
      !/[a-z]/.test(passwords.new_password) ||
      !/\d/.test(passwords.new_password) ||
      !/[^A-Za-z0-9]/.test(passwords.new_password)
    ) {
      notify(
        "error",
        "Use at least 8 characters with uppercase, lowercase, a number and a special symbol."
      );
      return;
    }

    if (passwords.new_password !== passwords.confirm_password) {
      notify("error", "New password and confirmation do not match.");
      return;
    }

    setChangingPassword(true);

    try {
      await apiRequest(PASSWORD_URL, {
        method: "POST",
        body: JSON.stringify(passwords),
      });

      setPasswords({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });

      setShowPasswords({
        current: false,
        next: false,
        confirm: false,
      });

      notify("success", "Password changed successfully.");
    } catch (error) {
      notify("error", error.message || "Unable to change password.");
    } finally {
      setChangingPassword(false);
    }
  };

  const avatarSrc = preview || authenticatedPhotoSrc;

  if (loading) {
    return (
      <main className="admin-profile-page" data-admin-theme={theme}>
        <div className="profile-loading">
          <LoaderCircle className="profile-spinner" size={28} />
          <p>Loading your profile...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-profile-page" data-admin-theme={theme}>
      <header className="profile-page-header">
        <div>
          <div className="profile-eyebrow">
            <span className="profile-eyebrow-dot" />
            ACCOUNT MANAGEMENT
          </div>

          <h1>My Profile</h1>
          <p>Manage your personal information and account security.</p>
        </div>

        <div className="profile-header-badge">
          <ShieldCheck size={18} />
          <span>Administrator account</span>
        </div>
      </header>

      <section className="profile-hero-card">
        <div className="profile-hero-glow profile-hero-glow-one" />
        <div className="profile-hero-glow profile-hero-glow-two" />

        <div className="profile-hero-content">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">
              {avatarSrc ? (
                <img src={avatarSrc} alt={`${fullName}'s profile`} />
              ) : (
                <span>{initials || "AD"}</span>
              )}
            </div>

            <button
              type="button"
              className="profile-avatar-camera"
              title="Choose profile photo"
              aria-label="Choose profile photo"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera size={17} />
            </button>
          </div>

          <div className="profile-hero-info">
            <span className="profile-role-chip">
              <ShieldCheck size={14} />
              Admin
            </span>

            <h2>{fullName}</h2>
            <p>{profile.email || "Add your email address"}</p>

            <div className="profile-hero-meta">
              <span>
                <Mail size={15} />
                {profile.email || "Email not set"}
              </span>

              <span>
                <Phone size={15} />
                {profile.phone_number || "Phone not added"}
              </span>
            </div>
          </div>

          <div className="profile-hero-status">
            <span className="profile-status-icon">
              <Check size={18} />
            </span>

            <div>
              <strong>Account profile</strong>
              <span>Personal settings</span>
            </div>
          </div>
        </div>
      </section>

      <nav className="profile-tabs" aria-label="Profile settings">
        <button
          type="button"
          className={activeTab === "personal" ? "active" : ""}
          onClick={() => setActiveTab("personal")}
        >
          <UserRound size={17} />
          Personal information
        </button>

        <button
          type="button"
          className={activeTab === "security" ? "active" : ""}
          onClick={() => setActiveTab("security")}
        >
          <KeyRound size={17} />
          Password &amp; security
        </button>
      </nav>

      {activeTab === "personal" ? (
        <div className="profile-content-grid">
          <section className="profile-panel profile-details-panel">
            <div className="profile-panel-heading">
              <div className="profile-heading-icon">
                <UserRound size={19} />
              </div>

              <div>
                <h3>Personal information</h3>
                <p>Update the details associated with your account.</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="profile-form">
              <div className="profile-form-grid">
                <label className="profile-field">
                  <span>First name</span>

                  <div className="profile-input-wrap">
                    <UserRound size={17} />
                    <input
                      name="first_name"
                      value={form.first_name}
                      onChange={setField}
                      placeholder="Enter first name"
                      maxLength={150}
                      required
                      disabled={saving}
                    />
                  </div>
                </label>

                <label className="profile-field">
                  <span>Last name</span>

                  <div className="profile-input-wrap">
                    <UserRound size={17} />
                    <input
                      name="last_name"
                      value={form.last_name}
                      onChange={setField}
                      placeholder="Enter last name"
                      maxLength={150}
                      required
                      disabled={saving}
                    />
                  </div>
                </label>

                <label className="profile-field profile-field-full">
                  <span>Email address</span>

                  <div className="profile-input-wrap">
                    <Mail size={17} />
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={setField}
                      placeholder="admin@edutrack.com"
                      required
                      disabled={saving}
                    />
                  </div>

                  <small>
                    Must be a valid email address not used by another account.
                  </small>
                </label>

                <label className="profile-field profile-field-full">
                  <span>Phone number</span>

                  <div className="profile-input-wrap">
                    <Phone size={17} />
                    <input
                      type="tel"
                      name="phone_number"
                      value={form.phone_number}
                      onChange={setField}
                      placeholder="10-digit mobile number"
                      inputMode="numeric"
                      maxLength={10}
                      disabled={saving}
                    />
                  </div>

                  <small>Enter a 10-digit Indian mobile number.</small>
                </label>
              </div>

              <div className="profile-form-footer">
                <span className="profile-save-hint">
                  Changes are saved to your account.
                </span>

                <button
                  type="submit"
                  className="profile-primary-btn"
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
            </form>
          </section>

          <aside className="profile-panel profile-photo-panel">
            <div className="profile-panel-heading">
              <div className="profile-heading-icon">
                <ImagePlus size={19} />
              </div>

              <div>
                <h3>Profile photo</h3>
                <p>Personalize your account.</p>
              </div>
            </div>

            <div className="profile-photo-preview">
              {avatarSrc ? (
                <img src={avatarSrc} alt="Profile preview" />
              ) : (
                <div className="profile-photo-placeholder">
                  <UserRound size={38} />
                  <span>No photo yet</span>
                </div>
              )}
            </div>

            <p className="profile-photo-help">
              Use a clear JPG or PNG image. Maximum file size: 5 MB.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              className="profile-file-input"
              onChange={handleFileSelect}
            />

            <div className="profile-photo-actions">
              <button
                type="button"
                className="profile-primary-btn profile-full-btn"
                onClick={
                  selectedFile
                    ? handleUploadPhoto
                    : () => fileInputRef.current?.click()
                }
                disabled={uploading || removingPhoto}
              >
                {uploading ? (
                  <LoaderCircle
                    className="profile-spinner"
                    size={17}
                  />
                ) : (
                  <Camera size={17} />
                )}

                {uploading
                  ? "Uploading..."
                  : selectedFile
                    ? "Save photo"
                    : "Choose photo"}
              </button>

              {selectedFile && (
                <button
                  type="button"
                  className="profile-secondary-btn profile-full-btn"
                  onClick={handleCancelPreview}
                  disabled={uploading}
                >
                  <X size={17} />
                  Cancel preview
                </button>
              )}

              {profile.profile_picture && !selectedFile && (
                <button
                  type="button"
                  className="profile-danger-btn profile-full-btn"
                  onClick={handleRemovePhoto}
                  disabled={removingPhoto || uploading}
                >
                  {removingPhoto ? (
                    <LoaderCircle
                      className="profile-spinner"
                      size={17}
                    />
                  ) : (
                    <Trash2 size={17} />
                  )}

                  {removingPhoto ? "Removing..." : "Remove photo"}
                </button>
              )}
            </div>

            <div className="profile-photo-tip">
              <ShieldCheck size={17} />
              <p>Your photo is associated with your admin profile.</p>
            </div>
          </aside>
        </div>
      ) : (
        <section className="profile-panel profile-security-panel">
          <div className="profile-panel-heading">
            <div className="profile-heading-icon">
              <KeyRound size={19} />
            </div>

            <div>
              <h3>Change password</h3>
              <p>Use a strong password to help protect your account.</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="profile-form">
            <div className="profile-password-fields">
              {[
                {
                  name: "current_password",
                  label: "Current password",
                  key: "current",
                },
                {
                  name: "new_password",
                  label: "New password",
                  key: "next",
                },
                {
                  name: "confirm_password",
                  label: "Confirm new password",
                  key: "confirm",
                },
              ].map((field) => (
                <label className="profile-field" key={field.name}>
                  <span>{field.label}</span>

                  <div className="profile-input-wrap">
                    <KeyRound size={17} />

                    <input
                      type={
                        showPasswords[field.key] ? "text" : "password"
                      }
                      name={field.name}
                      value={passwords[field.name]}
                      onChange={setPasswordField}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      autoComplete="current-password"
                      required
                      disabled={changingPassword}
                    />

                    <button
                      type="button"
                      className="profile-password-toggle"
                      aria-label={
                        showPasswords[field.key]
                          ? "Hide password"
                          : "Show password"
                      }
                      onClick={() => togglePassword(field.key)}
                    >
                      {showPasswords[field.key] ? (
                        <EyeOff size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                    </button>
                  </div>
                </label>
              ))}
            </div>

            <div className="profile-password-rules">
              <strong>Password requirements</strong>

              <ul>
                <li>At least 8 characters</li>
                <li>One uppercase and one lowercase letter</li>
                <li>At least one number and one special character</li>
                <li>New password and confirmation must match</li>
              </ul>
            </div>

            <div className="profile-form-footer">
              <span className="profile-save-hint">
                Your password is never displayed or stored in this form after
                submission.
              </span>

              <button
                type="submit"
                className="profile-primary-btn"
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <LoaderCircle
                    className="profile-spinner"
                    size={17}
                  />
                ) : (
                  <KeyRound size={17} />
                )}

                {changingPassword
                  ? "Updating..."
                  : "Update password"}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
