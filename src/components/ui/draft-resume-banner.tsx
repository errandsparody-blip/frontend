"use client";

/**
 * DraftResumeBanner — shown at the top of a long form when an autosaved draft
 * from a previous (possibly interrupted) session is found. Lets the vendor
 * resume where they stopped or start fresh. Pairs with `useFormDraft`.
 */

function relativeTime(ms: number | null): string {
  if (!ms) return "earlier";
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function DraftResumeBanner({
  savedAt,
  onResume,
  onDiscard,
}: {
  savedAt: number | null;
  onResume: () => void;
  onDiscard: () => void;
}): JSX.Element {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="font-mono text-mono-label uppercase tracking-[1.2px] text-amber">
          Unsaved draft found
        </div>
        <p className="mt-1 text-body-sm text-text">
          You have an unfinished draft from {relativeTime(savedAt)}. Resume where you
          left off, or start fresh.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onResume}
          className="h-10 rounded-sm border border-ink bg-ink px-4 font-mono text-[11px] uppercase tracking-[1.2px] text-text-inv hover:bg-ink/90"
        >
          Resume draft
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="h-10 rounded-sm border border-line-strong bg-white px-4 font-mono text-[11px] uppercase tracking-[1.2px] text-text hover:border-ink"
        >
          Start fresh
        </button>
      </div>
    </div>
  );
}
