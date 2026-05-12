"use client";

/**
 * NavDropdown — hover-AND-click dropdown for the marketing header.
 *
 * Used for the "About" menu so vendors and buyers can see the company's
 * services at a glance without an extra page-load. Designed to feel
 * like a desktop browser bookmark menu: open on hover, also open on
 * click for touch users + keyboard accessibility.
 *
 * Behaviour:
 *   - Mouse enter the trigger OR the menu → open.
 *   - Mouse leave both with a short grace period → close.
 *     Grace period prevents the menu from flickering closed when the
 *     pointer crosses the small gap between trigger and panel.
 *   - Click the trigger → toggle (so it works with no pointer at all).
 *   - Escape → close.
 *   - Click a link inside → close (so the next page paints clean).
 *   - Click outside → close.
 *
 * Mobile users get a different experience — MobileNav renders the same
 * links as flat entries inside its drawer instead of a nested dropdown.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface DropdownItem {
  href: string;
  label: string;
  /** Optional one-line description shown under the link in the menu. */
  description?: string;
}

interface Props {
  /** Label of the menu trigger (e.g. "About"). */
  label: string;
  /** Where the trigger itself navigates when clicked, IF user goes via keyboard / non-hover. */
  href: string;
  items: ReadonlyArray<DropdownItem>;
}

export function NavDropdown({ label, href, items }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Grace timer — see the mouseleave handler. We hold the timer id in
  // a ref so the handlers can clear each other without state churn.
  const closeTimerRef = useRef<number | null>(null);

  function clearCloseTimer(): void {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClose(): void {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  }

  function handleOpen(): void {
    clearCloseTimer();
    setOpen(true);
  }

  // Close on outside click + Escape. Both effects only attach while
  // open so we don't leak listeners.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Final cleanup — if the component unmounts mid-grace, clear the
  // timer so it can't fire on a dead component.
  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={handleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={handleOpen}
        className="inline-flex items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[1.2px] text-text transition-colors hover:text-amber"
      >
        <span>{label}</span>
        <span
          aria-hidden
          className={`inline-block text-text-muted transition-transform duration-fast ease-out ${
            open ? "rotate-180" : "rotate-0"
          }`}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={`${label} menu`}
          // tabIndex={-1} satisfies jsx-a11y/interactive-supports-focus
          // for the role="menu" wrapper without inserting the panel
          // into the tab order — each inner Link is already focusable
          // and reachable in sequence after the trigger.
          tabIndex={-1}
          // Anchor the panel to the trigger. Top-2 gap reads as
          // intentional rather than glued to the header underline.
          // The mouse-enter on the panel itself keeps the menu open
          // while the user moves between trigger and link rows.
          onMouseEnter={handleOpen}
          onMouseLeave={scheduleClose}
          className="absolute left-0 top-full z-50 mt-2 w-[320px] overflow-hidden rounded-md border border-line bg-white shadow-2"
        >
          {/* "Visit overview" header — clicking it routes to the
              top-level About page. Useful when someone wants the full
              picture instead of the categorised links below. */}
          <Link
            href={href}
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-b border-line bg-cream-soft px-5 py-3 font-mono text-mono-label uppercase tracking-[1.2px] text-text hover:text-amber"
          >
            <span>{label} overview</span>
            <span aria-hidden className="text-text-subtle">→</span>
          </Link>

          <ul className="flex flex-col py-2">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className="block px-5 py-3 transition-colors hover:bg-cream-soft"
                >
                  <div className="text-body-sm font-medium text-ink">
                    {item.label}
                  </div>
                  {item.description ? (
                    <div className="mt-0.5 text-caption text-text-muted">
                      {item.description}
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
