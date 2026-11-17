"use client";

/**
 * ErrorToastHost — renders error toasts as pop-up notifications fixed at the
 * top of the viewport. Mounted once in the root layout so a toast appears
 * immediately wherever the vendor is on the page: they don't have to scroll to
 * find an inline message or leave the step they're on. Subscribes to the global
 * toast bus (lib/errors/toast). Each toast auto-dismisses; the vendor can also
 * close it. Stacks newest-on-top and caps the visible count so a burst of
 * errors can't bury the screen.
 */

import { useEffect, useState } from "react";

import { subscribeErrorToast, type ErrorToast } from "@/lib/errors/toast";

const AUTO_DISMISS_MS = 7000;
const MAX_VISIBLE = 4;

export function ErrorToastHost() {
  const [toasts, setToasts] = useState<ErrorToast[]>([]);

  useEffect(() => {
    const unsub = subscribeErrorToast((toast) => {
      setToasts((prev) => [toast, ...prev].slice(0, MAX_VISIBLE));
      // Schedule removal of this specific toast.
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, AUTO_DISMISS_MS);
    });
    return unsub;
  }, []);

  const dismiss = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      role="alert"
      style={{
        position: "fixed",
        top: 16,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
        padding: "0 12px",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: 560,
            background: "#b91c1c",
            color: "#fff",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            padding: "12px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            fontSize: 14,
            lineHeight: 1.4,
            animation: "usaErrToastIn 160ms ease-out",
          }}
        >
          <span
            aria-hidden
            style={{ fontSize: 18, lineHeight: "20px", flexShrink: 0 }}
          >
            ⚠️
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{t.message}</div>
            {t.code ? (
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                Ref: {t.code}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: "18px",
              padding: 0,
              opacity: 0.85,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
      <style>{`@keyframes usaErrToastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
