import { useEffect, useState } from "react";
import { Check, Settings as SettingsIcon, Bell, Video } from "lucide-react";
import { toast } from "sonner";
import {
  getMentorSettings,
  updateMentorSettings,
} from "../../api/mentorApi";
import "./MentorSettings.css";

const DEFAULT_SETTINGS = {
  theme: "yellow",
  email_notifications: true,
  class_reminders: true,
};

const VALID_THEMES = ["light", "dark", "yellow"];

function getInitialTheme() {
  try {
    const theme = localStorage.getItem("mentor-theme");
    return VALID_THEMES.includes(theme) ? theme : "yellow";
  } catch {
    return "yellow";
  }
}

function normalizeSettings(data) {
  let result = data;

  if (result?.data && typeof result.data === "object") {
    result = result.data;
  }

  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    return { ...DEFAULT_SETTINGS, theme: getInitialTheme() };
  }

  const theme = VALID_THEMES.includes(result.theme)
    ? result.theme
    : getInitialTheme();

  return {
    ...DEFAULT_SETTINGS,
    ...result,
    theme,
    email_notifications:
      result.email_notifications ?? DEFAULT_SETTINGS.email_notifications,
    class_reminders:
      result.class_reminders ?? DEFAULT_SETTINGS.class_reminders,
  };
}

function getErrorMessage(err, fallback) {
  const data = err?.response?.data;

  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.error === "string") return data.error;

  if (typeof err?.message === "string" && err.message) {
    return err.message;
  }

  return fallback;
}

export default function MentorSettings() {
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    theme: getInitialTheme(),
  }));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load saved preferences
  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const response = await getMentorSettings();

        if (!active) return;

        const normalized = normalizeSettings(response);

        setSettings(normalized);

        try {
          localStorage.setItem("mentor-theme", normalized.theme);
        } catch {
          // Settings remain usable if browser storage is unavailable.
        }

        document.documentElement.dataset.mentorTheme = normalized.theme;
      } catch (err) {
        if (active) {
          console.error("Load mentor settings error:", err);

          toast.error(
            getErrorMessage(
              err,
              "Unable to load saved preferences. Default settings are shown."
            )
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, []);

  // Apply selected theme immediately as a preview.
  useEffect(() => {
    if (VALID_THEMES.includes(settings.theme)) {
      document.documentElement.dataset.mentorTheme = settings.theme;
    }
  }, [settings.theme]);

  // Change a setting
  const changeSetting = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));

    if (key === "theme") {
      toast.info(
        `${value.charAt(0).toUpperCase() + value.slice(1)} theme preview applied. Save changes to keep it.`
      );
    }

    if (key === "email_notifications") {
      toast.info(
        `Email notifications ${value ? "enabled" : "disabled"}. Save changes to keep this preference.`
      );
    }

    if (key === "class_reminders") {
      toast.info(
        `Live class reminders ${value ? "enabled" : "disabled"}. Save changes to keep this preference.`
      );
    }
  };

  // Save preferences
  const saveSettings = async () => {
    if (saving) return;

    setSaving(true);

    try {
      const payload = {
        theme: settings.theme,
        email_notifications: settings.email_notifications,
        class_reminders: settings.class_reminders,
      };

      const response = await updateMentorSettings(payload);
      const saved = normalizeSettings(response);

      setSettings(saved);

      try {
        localStorage.setItem("mentor-theme", saved.theme);
      } catch {
        // The server can still save preferences without local storage.
      }

      document.documentElement.dataset.mentorTheme = saved.theme;

      toast.success(
        response?.data?.message ||
          response?.message ||
          "Your settings have been saved successfully."
      );
    } catch (err) {
      console.error("Save mentor settings error:", err);

      toast.error(
        getErrorMessage(err, "Unable to save settings. Please try again.")
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ms-loading">
        Loading settings...
      </div>
    );
  }

  const themes = [
    {
      id: "light",
      label: "Light",
      description: "Clean and bright",
    },
    {
      id: "dark",
      label: "Dark",
      description: "Comfortable at night",
    },
    {
      id: "yellow",
      label: "Yellow",
      description: "Warm and focused",
    },
  ];

  return (
    <div className="ms-page">
      <div className="ms-heading">
        <div>
          <span className="ms-eyebrow">PREFERENCES</span>
          <h1>Settings</h1>
          <p>Customize your mentor workspace and notifications.</p>
        </div>

        <span className="ms-heading-icon">
          <SettingsIcon size={23} />
        </span>
      </div>

      <section className="ms-card">
        <div className="ms-card-heading">
          <span className="ms-icon">
            <SettingsIcon size={19} />
          </span>

          <div>
            <h2>Appearance</h2>
            <p>Choose how EduTrack looks on your device.</p>
          </div>
        </div>

        <div className="ms-theme-options">
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`ms-theme-option ${
                settings.theme === theme.id ? "chosen" : ""
              }`}
              onClick={() => changeSetting("theme", theme.id)}
              aria-pressed={settings.theme === theme.id}
            >
              <span className={`ms-theme-preview ${theme.id}`}>
                <i />
                <i />
                <i />
              </span>

              <strong>{theme.label}</strong>
              <small>{theme.description}</small>

              {settings.theme === theme.id && (
                <Check className="ms-theme-check" size={17} />
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="ms-card">
        <div className="ms-card-heading">
          <span className="ms-icon">
            <Bell size={19} />
          </span>

          <div>
            <h2>Notifications</h2>
            <p>Choose which reminders you want to receive.</p>
          </div>
        </div>

        <label className="ms-setting-row">
          <span className="ms-setting-icon">
            <Bell size={18} />
          </span>

          <span className="ms-setting-description">
            <strong>Email notifications</strong>
            <small>
              Receive important EduTrack updates by email.
            </small>
          </span>

          <input
            type="checkbox"
            checked={Boolean(settings.email_notifications)}
            onChange={(event) =>
              changeSetting(
                "email_notifications",
                event.target.checked
              )
            }
          />
        </label>

        <label className="ms-setting-row">
          <span className="ms-setting-icon">
            <Video size={18} />
          </span>

          <span className="ms-setting-description">
            <strong>Live class reminders</strong>
            <small>
              Keep track of your scheduled teaching sessions.
            </small>
          </span>

          <input
            type="checkbox"
            checked={Boolean(settings.class_reminders)}
            onChange={(event) =>
              changeSetting(
                "class_reminders",
                event.target.checked
              )
            }
          />
        </label>
      </section>

      <div className="ms-actions">
        <button
          type="button"
          className="ms-save-button"
          onClick={saveSettings}
          disabled={saving}
        >
          <Check size={16} />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}