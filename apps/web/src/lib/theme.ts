export type Theme = "dark" | "light";

const THEME_KEY = "advantage.theme";

/**
 * The theme, as a browser concern.
 *
 * For a personal account the stored setting is the source of truth and this is
 * how it gets applied. An admin account has no settings row to read - it has no
 * ledger at all - so for that app this *is* the source of truth, kept in
 * `localStorage` like the pre-paint script in `index.html` expects.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the class is still applied, the choice just will not stick.
  }
}

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
