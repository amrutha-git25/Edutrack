import { useEffect, useRef, useState } from "react";
import {
  UserRound,
  Mail,
  Phone,
  BookOpen,
  Camera,
  Upload,
  Trash2,
  Save,
  LockKeyhole,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import mentorApi from "../../api/mentorApi";
import "./Profile.css";

const EMPTY_PROFILE = {
  first_name: "",
  last_name: "",
  full_name: "",
  email: "",
  phone_number: "",
  specialization: "",
  profile_picture: null,
  joined_at: "",
};

function getErrorMessage(error, fallback) {
  const data = error?.response?.data;

  if (data?.errors) {
    return Object.values(data.errors).flat().join(" ");
  }

  return data?.message || data?.detail || fallback;
}

function formatJoinedDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default function Profile() {
  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingPicture, setRemovingPicture] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [preview, setPreview] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [removeExistingPicture, setRemoveExistingPicture] = useState(false);

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

  // Load mentor profile
  const loadProfile = async () => {
    setLoading(true);

    try {
      const response = await mentorApi.get("mentor/profile/");
      const data = response.data?.data || {};

      const nextProfile = { ...EMPTY_PROFILE, ...data };

      setProfile(nextProfile);
      setForm(nextProfile);
      setPreview(nextProfile.profile_picture || "");
      setSelectedFile(null);
      setRemoveExistingPicture(false);

      return true;
    } catch (error) {
      console.error("Load mentor profile error:", error);

      toast.error(
        getErrorMessage(
          error,
          "Unable to load your profile. Please try again."
        )
      );

      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();

    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  // Refresh profile
  const handleRefreshProfile = async () => {
    const refreshed = await loadProfile();

    if (refreshed) {
      toast.success("Profile refreshed successfully.");
    }
  };

  // Update profile fields
  const updateField = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setFieldErrors((previous) => ({
      ...previous,
      [name]: "",
    }));
  };

  // Update password fields
  const updatePassword = (event) => {
    const { name, value } = event.target;

    setPasswords((previous) => ({
      ...previous,
      [name]: value,
    }));

    setFieldErrors((previous) => ({
      ...previous,
      [name]: "",
    }));
  };

  // Save profile information
  const handleSaveProfile = async (event) => {
    event.preventDefault();

    const requiredFields = [
      ["first_name", form.first_name],
      ["last_name", form.last_name],
      ["email", form.email],
      ["specialization", form.specialization],
    ];

    const missingField = requiredFields.find(
      ([, value]) => !String(value || "").trim()
    );

    if (missingField) {
      toast.error("Please complete all required profile fields.");
      return;
    }

    setSaving(true);
    setFieldErrors({});

    try {
      const response = await mentorApi.patch("mentor/profile/", {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim(),
        specialization: form.specialization.trim(),
      });

      const data = response.data?.data || form;

      setProfile((previous) => ({
        ...previous,
        ...data,
      }));

      setForm((previous) => ({
        ...previous,
        ...data,
      }));

      toast.success(
        response.data?.message || "Profile updated successfully."
      );
    } catch (error) {
      console.error("Save mentor profile error:", error);

      const errors = error.response?.data?.errors;

      if (errors) {
        setFieldErrors(errors);
      }

      toast.error(
        getErrorMessage(error, "Unable to save your profile.")
      );
    } finally {
      setSaving(false);
    }
  };

  // Validate and preview profile picture
  const handleFileSelection = (event) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    const validTypes = ["image/jpeg", "image/png"];

    if (!validTypes.includes(file.type)) {
      toast.error("Invalid image format. Choose a JPG or PNG image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must not exceed 5 MB.");
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const url = URL.createObjectURL(file);

    previewUrlRef.current = url;

    setSelectedFile(file);
    setPreview(url);
    setRemoveExistingPicture(false);

    toast.info("Picture preview ready. Save the picture to upload it.");
  };

  // Upload profile picture
  const handleUploadPicture = async () => {
    if (!selectedFile) {
      toast.error("Choose a profile picture before uploading.");
      return;
    }

    const body = new FormData();

    body.append("profile_picture", selectedFile);

    setUploading(true);

    try {
      const response = await mentorApi.post(
        "mentor/profile/picture/",
        body
      );

      const data = response.data?.data || {};

      setProfile((previous) => ({
        ...previous,
        ...data,
      }));

      setForm((previous) => ({
        ...previous,
        ...data,
      }));

      setPreview(data.profile_picture || "");
      setSelectedFile(null);

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      toast.success(
        response.data?.message || "Profile picture updated successfully."
      );
    } catch (error) {
      console.error("Upload mentor profile picture error:", error);

      toast.error(
        getErrorMessage(error, "Unable to upload the profile picture.")
      );
    } finally {
      setUploading(false);
    }
  };

  // Remove profile picture or cancel the pending preview
  const handleRemovePicture = async () => {
    if (selectedFile) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      setSelectedFile(null);
      setPreview(profile.profile_picture || "");
      setRemoveExistingPicture(false);

      toast.info("Picture preview discarded.");
      return;
    }

    if (!profile.profile_picture) {
      toast.info("There is no profile picture to remove.");
      return;
    }

    setRemovingPicture(true);

    try {
      const response = await mentorApi.delete(
        "mentor/profile/picture/"
      );

      const data = response.data?.data || {};

      setProfile((previous) => ({
        ...previous,
        ...data,
        profile_picture: data.profile_picture || null,
      }));

      setForm((previous) => ({
        ...previous,
        ...data,
        profile_picture: data.profile_picture || null,
      }));

      setPreview("");
      setSelectedFile(null);
      setRemoveExistingPicture(false);

      toast.success(
        response.data?.message || "Profile picture removed successfully."
      );
    } catch (error) {
      console.error("Remove mentor profile picture error:", error);

      toast.error(
        getErrorMessage(error, "Unable to remove the profile picture.")
      );
    } finally {
      setRemovingPicture(false);
    }
  };

  // Password requirements
  const passwordRules = [
    {
      label: "At least 8 characters",
      valid: passwords.new_password.length >= 8,
    },
    {
      label: "One uppercase letter",
      valid: /[A-Z]/.test(passwords.new_password),
    },
    {
      label: "One lowercase letter",
      valid: /[a-z]/.test(passwords.new_password),
    },
    {
      label: "One number",
      valid: /\d/.test(passwords.new_password),
    },
    {
      label: "One special character",
      valid: /[^A-Za-z0-9]/.test(passwords.new_password),
    },
  ];

  // Change password
  const handleChangePassword = async (event) => {
    event.preventDefault();

    setFieldErrors({});

    if (
      !passwords.current_password ||
      !passwords.new_password ||
      !passwords.confirm_password
    ) {
      toast.error("Fill in all three password fields.");
      return;
    }

    if (passwords.new_password !== passwords.confirm_password) {
      setFieldErrors({
        confirm_password: "Passwords do not match.",
      });

      toast.error("New password and confirmation do not match.");
      return;
    }

    if (!passwordRules.every((rule) => rule.valid)) {
      toast.error(
        "Your new password does not meet all the requirements."
      );
      return;
    }

    if (passwords.current_password === passwords.new_password) {
      toast.error("Your new password must differ from your current password.");
      return;
    }

    setChangingPassword(true);

    try {
      const response = await mentorApi.post(
        "mentor/profile/password/",
        passwords
      );

      setPasswords({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });

      setFieldErrors({});

      toast.success(
        response.data?.message || "Password changed successfully."
      );
    } catch (error) {
      console.error("Change mentor password error:", error);

      const errors = error.response?.data?.errors;

      if (errors) {
        setFieldErrors(errors);
      }

      toast.error(
        getErrorMessage(error, "Unable to change your password.")
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const togglePasswordVisibility = (key) => {
    setShowPasswords((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  if (loading) {
    return (
      <main className="mp-page">
        <div className="mp-loading">
          <LoaderCircle className="mp-spin" size={26} />
          <span>Loading your profile...</span>
        </div>
      </main>
    );
  }

  const initials =
    `${profile.first_name?.[0] || ""}${
      profile.last_name?.[0] || ""
    }`.toUpperCase() || "M";

  return (
    <main className="mp-page">
      <header className="mp-header">
        <div>
          <span className="mp-eyebrow">
            <UserRound size={15} />
            MENTOR WORKSPACE
          </span>

          <h1>My Profile</h1>

          <p>
            Manage your personal information and account security.
          </p>
        </div>

        <button
          type="button"
          className="mp-refresh"
          onClick={handleRefreshProfile}
          disabled={saving || uploading || changingPassword || loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <section className="mp-hero">
        <div className="mp-avatar-wrap">
          <div className="mp-avatar">
            {preview ? (
              <img src={preview} alt="Mentor profile" />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <button
            type="button"
            className="mp-camera"
            onClick={() => fileInputRef.current?.click()}
            title="Choose profile picture"
            aria-label="Choose profile picture"
          >
            <Camera size={17} />
          </button>
        </div>

        <div className="mp-hero-info">
          <span className="mp-role-badge">
            <ShieldCheck size={14} />
            Verified mentor account
          </span>

          <h2>{profile.full_name || "Mentor"}</h2>

          <p>{profile.specialization || "Mentor"}</p>

          <span className="mp-joined">
            Member since {formatJoinedDate(profile.joined_at)}
          </span>
        </div>

        <div className="mp-hero-email">
          <Mail size={16} />
          <span>{profile.email || "No email available"}</span>
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        className="mp-hidden-input"
        onChange={handleFileSelection}
      />

      {selectedFile && (
        <section className="mp-picture-pending">
          <div>
            <strong>Picture preview</strong>
            <span>{selectedFile.name}</span>
            <small>
              {(selectedFile.size / 1024).toFixed(0)} KB · JPG/PNG
            </small>
          </div>

          <div className="mp-picture-actions">
            <button
              type="button"
              className="mp-primary"
              onClick={handleUploadPicture}
              disabled={uploading}
            >
              {uploading ? (
                <LoaderCircle size={16} className="mp-spin" />
              ) : (
                <Upload size={16} />
              )}

              {uploading ? "Uploading..." : "Save picture"}
            </button>

            <button
              type="button"
              className="mp-secondary"
              onClick={handleRemovePicture}
              disabled={uploading}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <div className="mp-grid">
        <section className="mp-card">
          <div className="mp-card-heading">
            <div className="mp-card-heading-icon">
              <UserRound size={19} />
            </div>

            <div>
              <h2>Personal information</h2>
              <p>
                Update the details associated with your mentor account.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="mp-form">
            <div className="mp-field-row">
              <label className="mp-field">
                <span>First name</span>

                <input
                  name="first_name"
                  value={form.first_name}
                  onChange={updateField}
                  maxLength={150}
                  required
                />

                {fieldErrors.first_name && (
                  <small className="mp-field-error">
                    {Array.isArray(fieldErrors.first_name)
                      ? fieldErrors.first_name.join(" ")
                      : fieldErrors.first_name}
                  </small>
                )}
              </label>

              <label className="mp-field">
                <span>Last name</span>

                <input
                  name="last_name"
                  value={form.last_name}
                  onChange={updateField}
                  maxLength={150}
                  required
                />

                {fieldErrors.last_name && (
                  <small className="mp-field-error">
                    {Array.isArray(fieldErrors.last_name)
                      ? fieldErrors.last_name.join(" ")
                      : fieldErrors.last_name}
                  </small>
                )}
              </label>
            </div>

            <label className="mp-field">
              <span>Email address</span>

              <span className="mp-input-icon">
                <Mail size={17} />

                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={updateField}
                  required
                />
              </span>

              {fieldErrors.email && (
                <small className="mp-field-error">
                  {Array.isArray(fieldErrors.email)
                    ? fieldErrors.email.join(" ")
                    : fieldErrors.email}
                </small>
              )}
            </label>

            <label className="mp-field">
              <span>Phone number</span>

              <span className="mp-input-icon">
                <Phone size={17} />

                <input
                  name="phone_number"
                  type="tel"
                  value={form.phone_number}
                  onChange={updateField}
                  maxLength={16}
                />
              </span>

              {fieldErrors.phone_number && (
                <small className="mp-field-error">
                  {Array.isArray(fieldErrors.phone_number)
                    ? fieldErrors.phone_number.join(" ")
                    : fieldErrors.phone_number}
                </small>
              )}
            </label>

            <label className="mp-field">
              <span>Specialization</span>

              <span className="mp-input-icon">
                <BookOpen size={17} />

                <input
                  name="specialization"
                  value={form.specialization}
                  onChange={updateField}
                  maxLength={150}
                  required
                />
              </span>

              {fieldErrors.specialization && (
                <small className="mp-field-error">
                  {Array.isArray(fieldErrors.specialization)
                    ? fieldErrors.specialization.join(" ")
                    : fieldErrors.specialization}
                </small>
              )}
            </label>

            <div className="mp-form-footer">
              <button
                type="button"
                className="mp-secondary"
                onClick={() => {
                  setForm(profile);
                  setFieldErrors({});
                  toast.info("Unsaved profile changes discarded.");
                }}
                disabled={saving}
              >
                Discard changes
              </button>

              <button
                type="submit"
                className="mp-primary"
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle size={16} className="mp-spin" />
                ) : (
                  <Save size={16} />
                )}

                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </section>

        <div className="mp-side-column">
          <section className="mp-card">
            <div className="mp-card-heading">
              <div className="mp-card-heading-icon">
                <Camera size={19} />
              </div>

              <div>
                <h2>Profile picture</h2>
                <p>Personalize your mentor account.</p>
              </div>
            </div>

            <div className="mp-picture-preview">
              <div className="mp-avatar mp-avatar-small">
                {preview ? (
                  <img src={preview} alt="Profile preview" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              <div>
                <strong>
                  {selectedFile ? "Preview selected" : "Your photo"}
                </strong>

                <span>JPG or PNG · Maximum 5 MB</span>
              </div>
            </div>

            <div className="mp-picture-actions mp-picture-actions-full">
              <button
                type="button"
                className="mp-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || removingPicture}
              >
                <Upload size={16} />
                Choose picture
              </button>

              <button
                type="button"
                className="mp-danger"
                onClick={handleRemovePicture}
                disabled={
                  (!profile.profile_picture && !selectedFile) ||
                  removingPicture ||
                  uploading
                }
              >
                {removingPicture ? (
                  <LoaderCircle size={16} className="mp-spin" />
                ) : (
                  <Trash2 size={16} />
                )}

                Remove
              </button>
            </div>

            <p className="mp-help">
              Selected pictures are previewed before they are uploaded.
            </p>
          </section>

          <section className="mp-card">
            <div className="mp-card-heading">
              <div className="mp-card-heading-icon">
                <LockKeyhole size={19} />
              </div>

              <div>
                <h2>Change password</h2>
                <p>Keep your account secure.</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="mp-form">
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
              ].map((item) => (
                <label className="mp-field" key={item.name}>
                  <span>{item.label}</span>

                  <span className="mp-input-icon mp-password-input">
                    <LockKeyhole size={16} />

                    <input
                      name={item.name}
                      type={showPasswords[item.key] ? "text" : "password"}
                      value={passwords[item.name]}
                      onChange={updatePassword}
                      autoComplete={
                        item.name === "current_password"
                          ? "current-password"
                          : "new-password"
                      }
                      required
                    />

                    <button
                      type="button"
                      className="mp-eye"
                      onClick={() => togglePasswordVisibility(item.key)}
                      aria-label={
                        showPasswords[item.key]
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {showPasswords[item.key] ? (
                        <EyeOff size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                    </button>
                  </span>

                  {fieldErrors[item.name] && (
                    <small className="mp-field-error">
                      {Array.isArray(fieldErrors[item.name])
                        ? fieldErrors[item.name].join(" ")
                        : fieldErrors[item.name]}
                    </small>
                  )}
                </label>
              ))}

              <div className="mp-password-rules">
                <strong>Password requirements</strong>

                {passwordRules.map((rule) => (
                  <span
                    className={rule.valid ? "is-valid" : ""}
                    key={rule.label}
                  >
                    <CheckCircle2 size={14} />
                    {rule.label}
                  </span>
                ))}
              </div>

              {fieldErrors.password_rules && (
                <small className="mp-field-error">
                  {Array.isArray(fieldErrors.password_rules)
                    ? fieldErrors.password_rules.join(" ")
                    : fieldErrors.password_rules}
                </small>
              )}

              <button
                type="submit"
                className="mp-primary mp-full-button"
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <LoaderCircle size={16} className="mp-spin" />
                ) : (
                  <LockKeyhole size={16} />
                )}

                {changingPassword ? "Updating..." : "Update password"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}