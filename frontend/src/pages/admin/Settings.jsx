
import { useCallback, useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Building2,
  Mail,
  Phone,
  ShieldCheck,
  BellRing,
  Palette,
  Clock3,
  Save,
  RefreshCw,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import adminSettingsService from "../../api/adminSettingsApi";
import "./Settings.css";
import { useAdminTheme } from "../../context/ThemeContext";

const DEFAULT_SETTINGS = {
  platform_name: "EduTrack",
  support_email: "",
  support_phone: "",
  maintenance_mode: false,
  allow_student_registration: true,
  allow_mentor_registration: true,
  email_notifications_enabled: true,
  default_theme: "dark",
  session_timeout_minutes: 30,
};

function getErrorMessage(error) {
  const data = error?.response?.data;

  if (data?.message) return data.message;
  if (data?.detail) return data.detail;

  if (data?.errors) {
    const firstField = Object.values(data.errors)[0];

    if (Array.isArray(firstField)) return firstField[0];
    if (typeof firstField === "string") return firstField;
  }

  if (error?.response?.status === 401) {
    return "Your session has expired. Please log in again.";
  }

  if (error?.response?.status === 403) {
    return "Access denied. Please sign in with your Admin account.";
  }

  return (
    error?.message ||
    "Unable to complete the request. Please check your backend and try again."
  );
}

function SettingToggle({
  title,
  description,
  checked,
  onChange,
  disabled = false,
  danger = false,
}) {
  return (
    <div className={`settings-toggle-row ${danger ? "danger-setting" : ""}`}>
      <div className="settings-toggle-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        className={`settings-switch ${checked ? "is-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, description, children }) {
  return (
    <section className="settings-card">
      <div className="settings-section-heading">
        <div className="settings-section-icon">
          <Icon size={20} />
        </div>

        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div className="settings-section-content">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { setTheme } = useAdminTheme();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSettings = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await adminSettingsService.getSettings();
      const payload = response.data?.data ?? response.data;

      const loaded = {
        ...DEFAULT_SETTINGS,
        ...payload,
      };

      setSettings(loaded);
      setSavedSettings(loaded);

      if (showRefresh) {
        toast.success("Settings refreshed successfully.");
      }
    } catch (err) {
      console.error("Load admin settings error:", err);
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateField = (name, value) => {
    setSettings((current) => ({
      ...current,
      [name]: value,
    }));

    if (name === "default_theme") {
      setTheme(value);
      toast.success(
        `${value.charAt(0).toUpperCase() + value.slice(1)} theme applied.`
      );
    }
  };

  const hasChanges = Object.keys(DEFAULT_SETTINGS).some(
    (key) => settings[key] !== savedSettings[key]
  );

  const handleSave = async (event) => {
    event.preventDefault();

    if (!settings.platform_name.trim()) {
      toast.error("Platform name is required.");
      return;
    }

    const timeout = Number(settings.session_timeout_minutes);

    if (!Number.isInteger(timeout) || timeout < 5 || timeout > 1440) {
      toast.error("Session timeout must be between 5 and 1440 minutes.");
      return;
    }

    if (
      settings.support_email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.support_email.trim())
    ) {
      toast.error("Please enter a valid support email address.");
      return;
    }

    const payload = {
      ...settings,
      platform_name: settings.platform_name.trim(),
      support_email: settings.support_email.trim(),
      support_phone: settings.support_phone.trim(),
      session_timeout_minutes: timeout,
    };

    setSaving(true);

    try {
      const response = await adminSettingsService.updateSettings(payload);
      const result = response.data?.data ?? response.data ?? {};

      const updated = {
        ...payload,
        ...result,
      };

      setSettings(updated);
      setSavedSettings(updated);

      toast.success(
        response.data?.message || "Settings saved successfully."
      );
    } catch (err) {
      console.error("Save admin settings error:", err);
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!hasChanges) return;

    setSettings(savedSettings);
    setTheme(savedSettings.default_theme);
    toast.info("Unsaved changes have been discarded.");
  };

  if (loading) {
    return (
      <div className="admin-settings-page">
        <div className="settings-state-card">
          <LoaderCircle className="settings-loading-icon" size={30} />
          <h2>Loading settings</h2>
          <p>Fetching your saved EduTrack configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-settings-page">
      <div className="settings-page-header">
        <div className="settings-heading-copy">
          <div className="settings-eyebrow">
            <SettingsIcon size={15} />
            ADMINISTRATION
          </div>

          <h1>System Settings</h1>
          <p>
            Configure EduTrack's platform, access, notifications, and
            system preferences.
          </p>
        </div>

        <button
          type="button"
          className="settings-refresh-button"
          onClick={() => loadSettings(true)}
          disabled={refreshing || saving}
        >
          <RefreshCw
            size={16}
            className={refreshing ? "settings-spin" : ""}
          />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="settings-info-banner">
        <ShieldCheck size={21} />
        <div>
          <strong>Administrator controls</strong>
          <p>
            Changes are saved to the backend and apply to the system
            configuration. Some controls require backend enforcement
            before they affect user access or session behavior.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="settings-layout">
          <div className="settings-main-column">
            <SettingsSection
              icon={Building2}
              title="Platform Configuration"
              description="Manage EduTrack's identity and support contact details."
            >
              <div className="settings-form-grid">
                <label className="settings-field settings-field-full">
                  <span>Platform name</span>
                  <input
                    type="text"
                    value={settings.platform_name}
                    onChange={(e) =>
                      updateField("platform_name", e.target.value)
                    }
                    maxLength={100}
                    required
                    placeholder="EduTrack"
                  />
                  <small>Name used to identify the platform.</small>
                </label>

                <label className="settings-field">
                  <span>
                    <Mail size={15} />
                    Support email
                  </span>
                  <input
                    type="email"
                    value={settings.support_email}
                    onChange={(e) =>
                      updateField("support_email", e.target.value)
                    }
                    maxLength={254}
                    placeholder="support@example.com"
                  />
                </label>

                <label className="settings-field">
                  <span>
                    <Phone size={15} />
                    Support phone
                  </span>
                  <input
                    type="tel"
                    value={settings.support_phone}
                    onChange={(e) =>
                      updateField("support_phone", e.target.value)
                    }
                    maxLength={20}
                    placeholder="+91 98765 43210"
                  />
                </label>
              </div>
            </SettingsSection>

            <SettingsSection
              icon={ShieldCheck}
              title="Access & Registration"
              description="Configure registration availability and platform maintenance."
            >
              <SettingToggle
                title="Maintenance mode"
                description="Mark the platform as under maintenance. Access blocking must be implemented separately in the backend."
                checked={settings.maintenance_mode}
                onChange={(value) => updateField("maintenance_mode", value)}
                danger={settings.maintenance_mode}
                disabled={saving}
              />

              <SettingToggle
                title="Student registration"
                description="Allow new student accounts to register."
                checked={settings.allow_student_registration}
                onChange={(value) =>
                  updateField("allow_student_registration", value)
                }
                disabled={saving}
              />

              <SettingToggle
                title="Mentor registration"
                description="Allow new mentor accounts to register."
                checked={settings.allow_mentor_registration}
                onChange={(value) =>
                  updateField("allow_mentor_registration", value)
                }
                disabled={saving}
              />
            </SettingsSection>

            <SettingsSection
              icon={BellRing}
              title="Notifications"
              description="Control the system's email notification preference."
            >
              <SettingToggle
                title="Email notifications"
                description="Enable email notifications where supported by the backend."
                checked={settings.email_notifications_enabled}
                onChange={(value) =>
                  updateField("email_notifications_enabled", value)
                }
                disabled={saving}
              />
            </SettingsSection>

            <SettingsSection
              icon={Palette}
              title="Appearance & Session"
              description="Set the default theme and session timeout preference."
            >
              <div className="settings-form-grid">
                <label className="settings-field">
                  <span>Default dashboard theme</span>
                  <select
                    value={settings.default_theme}
                    disabled={saving}
                    onChange={(e) => {
                      updateField("default_theme", e.target.value);
                    }}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="yellow">Yellow</option>
                  </select>
                  <small>
                    Saved as the system default; existing user theme
                    preferences may remain unchanged.
                  </small>
                </label>

                <label className="settings-field">
                  <span>
                    <Clock3 size={15} />
                    Session timeout (minutes)
                  </span>
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    step="1"
                    value={settings.session_timeout_minutes}
                    onChange={(e) =>
                      updateField(
                        "session_timeout_minutes",
                        e.target.value === ""
                          ? ""
                          : Number(e.target.value)
                      )
                    }
                    required
                    disabled={saving}
                  />
                  <small>Allowed range: 5 to 1440 minutes.</small>
                </label>
              </div>
            </SettingsSection>
          </div>

          <aside className="settings-side-column">
            <div className="settings-summary-card">
              <div className="settings-summary-icon">
                <SettingsIcon size={23} />
              </div>

              <span className="settings-summary-label">CONFIGURATION</span>
              <h2>{settings.platform_name || "EduTrack"}</h2>
              <p>System preferences</p>

              <div className="settings-summary-divider" />

              <div className="settings-summary-row">
                <span>Maintenance</span>
                <strong
                  className={
                    settings.maintenance_mode
                      ? "settings-status-warning"
                      : "settings-status-good"
                  }
                >
                  {settings.maintenance_mode ? "Enabled" : "Disabled"}
                </strong>
              </div>

              <div className="settings-summary-row">
                <span>Student sign-up</span>
                <strong>
                  {settings.allow_student_registration ? "Open" : "Closed"}
                </strong>
              </div>

              <div className="settings-summary-row">
                <span>Mentor sign-up</span>
                <strong>
                  {settings.allow_mentor_registration ? "Open" : "Closed"}
                </strong>
              </div>

              <div className="settings-summary-row">
                <span>Email preference</span>
                <strong>
                  {settings.email_notifications_enabled
                    ? "Enabled"
                    : "Disabled"}
                </strong>
              </div>

              <div className="settings-summary-row">
                <span>Default theme</span>
                <strong>
                  {settings.default_theme.charAt(0).toUpperCase() +
                    settings.default_theme.slice(1)}
                </strong>
              </div>
            </div>

            <div className="settings-help-card">
              <ShieldCheck size={19} />
              <div>
                <strong>Keep your system secure</strong>
                <p>
                  Only authorized administrators should be able to
                  modify system settings. Always verify backend
                  permissions before deployment.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <div className="settings-save-bar">
          <div className="settings-unsaved-indicator">
            <span
              className={`settings-change-dot ${
                hasChanges ? "has-changes" : ""
              }`}
            />
            {hasChanges ? "Unsaved changes" : "All changes saved"}
          </div>

          <div className="settings-save-actions">
            <button
              type="button"
              className="settings-reset-button"
              onClick={handleReset}
              disabled={!hasChanges || saving}
            >
              <RotateCcw size={16} />
              Discard changes
            </button>

            <button
              type="submit"
              className="settings-save-button"
              disabled={!hasChanges || saving}
            >
              {saving ? (
                <LoaderCircle size={17} className="settings-spin" />
              ) : (
                <Save size={17} />
              )}
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
