import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

import { LinkBadge } from "./RobotStatus";
import { ThemeToggle } from "./ThemeToggle";
import { scrollTo } from "../motion/useLenis";

const LINKS = [
  { id: "overview", label: "Overview" },
  { id: "explorer", label: "3D Explorer" },
  { id: "technology", label: "Technology" },
  { id: "control", label: "Live Control" },
  { id: "about", label: "About" },
];

export function Navigation() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const onLanding = location.pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const go = (id: string) => {
    setOpen(false);
    if (!onLanding) {
      // Jump home first, then scroll to the section.
      window.location.href = `/#${id}`;
      return;
    }
    scrollTo(`#${id}`);
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled || open ? "bg-ink-950/85 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[var(--nav-h)] max-w-[1440px] items-center gap-4 px-5 sm:px-8">
        <Link
          to="/"
          className="group flex shrink-0 items-baseline gap-2"
          aria-label="COBOT / PCB FIXTURE home"
        >
          <span className="mono text-[12.5px] font-semibold tracking-[0.16em] text-mist-100 transition-colors group-hover:text-signal-400">
            COBOT
          </span>
          <span className="mono text-[12.5px] tracking-[0.16em] text-mist-500">/</span>
          <span className="mono text-[12.5px] tracking-[0.16em] text-mist-400">PCB FIXTURE</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Primary">
          {LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              className="rounded-full px-3 py-1.5 text-[12.5px] text-mist-400 transition-colors hover:text-mist-100"
              onClick={() => go(link.id)}
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <span className="hidden sm:block">
            <LinkBadge />
          </span>
          <ThemeToggle />
          <Link to="/control" className="btn btn--primary btn--sm hidden sm:inline-flex">
            Launch controller
          </Link>
          <button
            type="button"
            className="btn btn--sm btn--ghost !px-2 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-ink-800 bg-ink-950/95 px-5 py-4 backdrop-blur-xl lg:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                className="border-b border-ink-850 py-3 text-left text-[14px] text-mist-300 last:border-0"
                onClick={() => go(link.id)}
              >
                {link.label}
              </button>
            ))}
            <Link to="/control" className="btn btn--primary mt-4">
              Launch controller
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
