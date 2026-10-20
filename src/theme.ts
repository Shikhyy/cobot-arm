import { create } from "zustand";

export type Theme = "dark" | "light";

const STORAGE_KEY = "cobot.pcb-fixture.theme";

function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
  },
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    set({ theme: next });
    applyTheme(next);
  },
}));

/** Writes the theme onto <html> and remembers it. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode */
  }
}

/** Called once at boot so the first paint is already in the right theme. */
export function initTheme(): void {
  applyTheme(useThemeStore.getState().theme);
}
