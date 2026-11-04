import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const ThemeContext = createContext(null);

const VALID_THEMES = ["dark", "light", "yellow"];
const STORAGE_KEY = "edutrack-admin-theme";

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return VALID_THEMES.includes(saved) ? saved : "dark";
    } catch {
      return "dark";
    }
  });

  const setTheme = useCallback((nextTheme) => {
    if (!VALID_THEMES.includes(nextTheme)) return;

    setThemeState(nextTheme);

    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // The theme still applies for the current session.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.adminTheme = theme;

    // Apply the selected theme to dashboard shells.
    document
      .querySelectorAll(".admin-shell")
      .forEach((shell) => {
        shell.setAttribute("data-theme", theme);
      });
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      "useAdminTheme must be used inside ThemeProvider."
    );
  }

  return context;
}
