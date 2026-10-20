import { Moon, Sun } from "lucide-react";

import { useThemeStore } from "../theme";

/** Light / dark switch. The choice is remembered in this browser. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((state) => state.theme);
  const toggle = useThemeStore((state) => state.toggle);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={`btn btn--sm !px-2.5 ${className ?? ""}`}
      onClick={toggle}
      aria-label={isDark ? "Switch to the light theme" : "Switch to the dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
    >
      {isDark ? <Sun size={13} aria-hidden /> : <Moon size={13} aria-hidden />}
    </button>
  );
}
