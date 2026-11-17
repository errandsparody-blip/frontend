"use client";

/**
 * ErrorToastHost — renders errors as a centered pop-up modal.
 *
 * Why a modal and not an inline banner or a slide-in toast: a vendor must see
 * the error no matter where they are on the page, without scrolling, and it
 * must stay on screen long enough to read a long message (e.g. an address
 * correction with a suggested fix). So this:
 *   - overlays the whole screen with a dim backdrop (unmissable),
 *   - is centered and on top of everything (highest z-index),
 *   - does NOT auto-dismiss — it stays until the vendor closes it,
 *   - scrolls its own body if the message is long,
 *   - uses clean, neutral styling (no colored left-edge "slop" cards).
 *
 * Mounted once in the root layout; subscribes to the global toast bus
 * (lib/errors/toast). Errors are queued and shown one at a time so a burst
 * can't bury the screen — closing one reveals the next.
 */

import { useEffect, useRef, useState } from "react";

import { subscribeErrorToast, type ErrorToast } from "@/lib/errors/toast";

export function ErrorToastHost() {
  const [queue, setQueue] = useState<ErrorToast[]>([]);
  const dismissBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const unsub = subscribeErrorToast((toast) => {
      setQueue((prev) => {
        // De-dupe an identical message that's already queued (e.g. a double
        // click firing the same error twice).
        if (prev.some((t) => t.message === toast.message)) return prev;
        return [...prev, toast];
      });
    });
    return unsub;
  }, []);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (queue.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQueue((prev) => prev.slice(1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue.length]);

  // Move focus to the dismiss button when a pop-up is showing, so keyboard
  // users land on the actionable control (replaces autoFocus).
  useEffect(() => {
    if (queue.length > 0) dismissBtnRef.current?.focus();
  }, [queue.length]);

  if (queue.length === 0) return null;

  const current = queue[0]!;
  const remaining = queue.length - 1;
  const dismiss = () => setQueue((prev) => prev.slice(1));

  return (
    // Backdrop. Clicking it dismisses, but that's a convenience only — the
    // "Got it" button and Escape are the primary, accessible dismissers, so
    // the a11y lint rules about click-only handlers don't apply here.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "rgba(17, 17, 17, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      {/* Stop backdrop-dismiss when interacting with the card itself. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          color: "#1a1a1a",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
          animation: "usaErrPopIn 150ms ease-out",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "18px 22px 12px",
          }}
        >
          <svg
            aria-hidden
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d97706"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Heads up</div>
        </div>

        <div
          style={{
            padding: "0 22px",
            overflowY: "auto",
            fontSize: 15,
            lineHeight: 1.5,
            color: "#2b2b2b",
          }}
        >
          {current.message}
          {current.code ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "#8a8a8a" }}>
              Reference: {current.code}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 22px 20px",
          }}
        >
          <span style={{ fontSize: 12, color: "#9a9a9a" }}>
            {remaining > 0 ? `${remaining} more` : ""}
          </span>
          <button
            ref={dismissBtnRef}
            type="button"
            onClick={dismiss}
            style={{
              background: "#111111",
              color: "#ffffff",
              border: "none",
              borderRadius: 9,
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
      <style>{`@keyframes usaErrPopIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
