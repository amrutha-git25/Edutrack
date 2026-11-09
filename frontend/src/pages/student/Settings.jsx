import { useEffect, useState } from "react";
import {
  Moon,
  Sun,
  Palette,
  Check,
  Monitor,
  RotateCcw,
  LoaderCircle,
  Settings as SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAdminTheme } from "../../context/ThemeContext";
import "./Settings.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com/api"
).replace(/\/+$/, "");
const VALID_THEMES = ["dark", "light", "yellow"];

const THEMES = [
  {
    id: "dark",
    name: "Dark",
    description: "A comfortable, low-light workspace",
    icon: Moon,
    preview: "settings-preview-dark",
  },
  {
    id: "light",
    name: "Light",
    description: "A clean and bright workspace",
    icon: Sun,
    preview: "settings-preview-light",
  },
  {
    id: "yellow",
    name: "Yellow",
    description: "A warm theme with golden accents",
    icon: Palette,
    preview: "settings-preview-yellow",
  },
];

function getAccessToken() {
  return (
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("access") ||
    ""
  );
}

async function settingsRequest(method = "GET", body) {
  const token = getAccessToken();

  if (!token) {
    throw new Error("Your login session is missing. Please log in again.");
  }

  const url = `${API_BASE}/users/student/settings/`;

  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(
      "Cannot connect to the server. Please check whether Django is running."
    );
  }

  const responseText = await response.text();
  let payload = {};

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { detail: responseText.slice(0, 300) };
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Your session has expired. Please log in again."
      );
    }

    const details =
      payload.message ||
      payload.detail ||
      payload.errors ||
      payload.error ||
      response.statusText ||
      "Unknown server error";

    throw new Error(
      typeof details === "string"
        ? details
        : JSON.stringify(details)
    );
  }

  return payload;
}

function getValidTheme(value) {
  return VALID_THEMES.includes(value) ? value : "dark";
}

export default function Settings() {
  const { theme, setTheme } = useAdminTheme();

  const [savedTheme, setSavedTheme] = useState(
    getValidTheme(theme)
  );

  const [selectedTheme, setSelectedTheme] = useState(
    getValidTheme(theme)
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setLoading(true);

      try {
        const response = await settingsRequest("GET");

        if (!active) return;

        const saved = getValidTheme(response?.data?.theme);

        setSavedTheme(saved);
        setSelectedTheme(saved);
        setTheme(saved);
      } catch (err) {
        if (active) {
          toast.error(
            err.message || "Unable to load your saved settings."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, [setTheme]);

  function handleThemeSelect(themeId) {
    if (!VALID_THEMES.includes(themeId)) {
      toast.error("Please select a valid theme.");
      return;
    }

    if (themeId === selectedTheme) return;

    setSelectedTheme(themeId);
    setTheme(themeId);

    toast.info(`${THEMES.find((item) => item.id === themeId)?.name} theme preview applied.`, {
      description: "Click Save Changes to keep this preference.",
    });
  }

  function handleReset() {
    if (selectedTheme === savedTheme) {
      toast.info("There are no unsaved changes to reset.");
      return;
    }

    setSelectedTheme(savedTheme);
    setTheme(savedTheme);

    toast.success("Unsaved changes have been reset.", {
      description: "Your previously saved theme has been restored.",
    });
  }

  async function handleSave() {
    if (!VALID_THEMES.includes(selectedTheme)) {
      toast.error("Please select a valid theme.");
      return;
    }

    if (!hasChanges) {
      toast.info("Your settings are already up to date.");
      return;
    }

    setSaving(true);

    try {
      const response = await settingsRequest("PATCH", {
        theme: selectedTheme,
      });

      const persistedTheme = getValidTheme(
        response?.data?.theme || selectedTheme
      );

      setSavedTheme(persistedTheme);
      setSelectedTheme(persistedTheme);
      setTheme(persistedTheme);

      toast.success("Settings saved successfully!", {
        description: `Your ${persistedTheme} theme preference has been saved.`,
      });
    } catch (err) {
      toast.error("Failed to save settings.", {
        description:
          err.message || "Please try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = selectedTheme !== savedTheme;

  return (
    <main className={`student-settings theme-${selectedTheme}`}>
      <header className="student-settings-header">
        <div className="student-settings-heading">
          <div className="student-settings-heading-icon">
            <SettingsIcon size={22} />
          </div>

          <div>
            <p className="student-settings-eyebrow">
              PERSONALIZE YOUR EXPERIENCE
            </p>

            <h1>Settings</h1>

            <p className="student-settings-subtitle">
              Customize your EduTrack learning workspace.
            </p>
          </div>
        </div>

        <div className="student-settings-status">
          <span className="student-settings-status-dot" />
          Student preferences
        </div>
      </header>

      <section className="student-settings-section">
        <div className="student-settings-section-heading">
          <div className="student-settings-section-icon">
            <Palette size={20} />
          </div>

          <div>
            <h2>Appearance</h2>
            <p>Choose the look and feel of your dashboard.</p>
          </div>
        </div>

        {loading ? (
          <div className="student-settings-loading">
            <LoaderCircle
              className="settings-spinner"
              size={22}
            />
            <span>Loading your saved preferences...</span>
          </div>
        ) : (
          <>
            <div className="student-theme-grid">
              {THEMES.map((item) => {
                const Icon = item.icon;
                const isSelected = selectedTheme === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`student-theme-option ${
                      isSelected ? "selected" : ""
                    }`}
                    onClick={() => handleThemeSelect(item.id)}
                    aria-pressed={isSelected}
                  >
                    <div
                      className={`student-theme-preview ${item.preview}`}
                    >
                      <div className="theme-preview-sidebar">
                        <span />
                        <span />
                        <span />
                      </div>

                      <div className="theme-preview-content">
                        <span className="theme-preview-line" />
                        <span className="theme-preview-card" />
                        <span className="theme-preview-line short" />
                      </div>

                      {isSelected && (
                        <span className="theme-preview-check">
                          <Check size={15} />
                        </span>
                      )}
                    </div>

                    <div className="student-theme-option-details">
                      <span className="student-theme-option-icon">
                        <Icon size={18} />
                      </span>

                      <span className="student-theme-option-text">
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </span>

                      <span className="student-theme-radio">
                        {isSelected && <span />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="student-settings-preview-note">
              <Monitor size={18} />
              <span>
                Your selected theme is applied immediately. Save your
                changes to keep this preference across future logins.
              </span>
            </div>
          </>
        )}
      </section>

      <section className="student-settings-info">
        <div className="student-settings-info-icon">
          <Palette size={19} />
        </div>

        <div>
          <h3>Personal workspace</h3>
          <p>
            Your appearance preference is associated with your student
            account. Other students' settings remain separate.
          </p>
        </div>
      </section>

      <footer className="student-settings-actions">
        <div className="student-settings-unsaved">
          {hasChanges
            ? "You have unsaved changes."
            : "All changes are saved."}
        </div>

        <div className="student-settings-buttons">
          <button
            type="button"
            className="student-settings-reset"
            onClick={handleReset}
            disabled={loading || saving || !hasChanges}
          >
            <RotateCcw size={16} />
            Reset
          </button>

          <button
            type="button"
            className="student-settings-save"
            onClick={handleSave}
            disabled={loading || saving || !hasChanges}
          >
            {saving ? (
              <>
                <LoaderCircle
                  size={17}
                  className="settings-spinner"
                />
                Saving...
              </>
            ) : (
              <>
                <Check size={17} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </footer>
    </main>
  );
}