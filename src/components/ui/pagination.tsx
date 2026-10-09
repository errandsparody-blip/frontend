/**
 * Pagination — reusable cursor pagination for list pages.
 *
 * Our list endpoints are cursor-based: they take an optional `cursor` (the id
 * to continue after) and return `{ items, nextCursor }`, where `nextCursor` is
 * null on the last page. There is no total count, so numbered pages aren't
 * possible — this is prev/next over a cursor history stack.
 *
 * Two parts:
 *   - `useCursorPagination()` holds the cursor stack and exposes the current
 *     `cursor` to feed the query plus `next`/`prev`/`reset` controls.
 *   - `<Pagination />` renders the Prev/Next bar.
 *
 * Usage:
 *
 *   const page = useCursorPagination();
 *   // reset to page 1 whenever filters change:
 *   useEffect(() => page.reset(), [tab, from, to]);
 *
 *   const params = new URLSearchParams({ limit: "50" });
 *   if (page.cursor) params.set("cursor", page.cursor);
 *
 *   const { data, isFetching } = useQuery({
 *     queryKey: ["admin", "orders", { tab, from, to, cursor: page.cursor }],
 *     queryFn: () => api.get<{ items: Row[]; nextCursor: string | null }>(...),
 *     placeholderData: keepPreviousData, // keep the table while the next page loads
 *   });
 *
 *   <Pagination
 *     page={page.page}
 *     hasPrev={page.hasPrev}
 *     hasNext={Boolean(data?.nextCursor)}
 *     loading={isFetching}
 *     onPrev={page.prev}
 *     onNext={() => page.next(data?.nextCursor ?? null)}
 *   />
 */

"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CursorPagination {
  /** Cursor to send to the API for the current page (undefined on page 1). */
  cursor: string | undefined;
  /** 1-based page number, for display. */
  page: number;
  /** True when a previous page exists (i.e. we're past page 1). */
  hasPrev: boolean;
  /** Advance to the page that starts at `nextCursor`. No-op when null. */
  next: (nextCursor: string | null) => void;
  /** Step back one page. */
  prev: () => void;
  /** Jump back to page 1. Call this whenever filters/search change. */
  reset: () => void;
  /** Current rows-per-page. Feed into the list query's `limit`. */
  pageSize: number;
  /** Change rows-per-page; also jumps back to page 1 (the cursor stack is
   *  only valid for the size it was built with). */
  setPageSize: (n: number) => void;
}

/** Rows-per-page choices offered by the PageSizeSelect dropdown. */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/**
 * Cursor stack. Each entry is the cursor used to open the page one deeper, so
 * an empty stack means page 1 (no cursor sent). The top of the stack is the
 * cursor for the current page.
 */
export function useCursorPagination(initialPageSize = 20): CursorPagination {
  const [stack, setStack] = useState<string[]>([]);
  const [pageSize, setPageSizeState] = useState<number>(initialPageSize);

  const next = useCallback((nextCursor: string | null) => {
    if (!nextCursor) return;
    setStack((s) => [...s, nextCursor]);
  }, []);

  const prev = useCallback(() => {
    setStack((s) => s.slice(0, -1));
  }, []);

  const reset = useCallback(() => {
    setStack([]);
  }, []);

  const setPageSize = useCallback((n: number) => {
    setPageSizeState(n);
    setStack([]); // a cursor from a 50-row page is meaningless at 10 rows.
  }, []);

  return {
    cursor: stack[stack.length - 1],
    page: stack.length + 1,
    hasPrev: stack.length > 0,
    next,
    prev,
    reset,
    pageSize,
    setPageSize,
  };
}

/**
 * Rows-per-page dropdown. Place it at the top of a list (near the filters).
 * Pair with `useCursorPagination`: `value={page.pageSize}` /
 * `onChange={page.setPageSize}`.
 */
export function PageSizeSelect({
  value,
  onChange,
  options = PAGE_SIZE_OPTIONS as unknown as number[],
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  options?: number[];
  className?: string;
}): JSX.Element {
  return (
    <label
      className={cn(
        "flex items-center gap-2 font-mono text-mono-label uppercase tracking-[1.2px] text-text-muted",
        className,
      )}
    >
      Rows
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-sm border border-line-strong bg-white px-2 font-mono text-body-sm text-text outline-none focus:border-ink"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

interface PaginationProps {
  /** 1-based current page number. */
  page: number;
  /** Whether a Prev page exists. */
  hasPrev: boolean;
  /** Whether a Next page exists (usually `Boolean(data?.nextCursor)`). */
  hasNext: boolean;
  /** Disables the buttons while a page is in flight. */
  loading?: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

/**
 * Prev/Next bar. Renders nothing when there's only a single page (no prev and
 * no next), so it's safe to always mount it below a table.
 */
export function Pagination({
  page,
  hasPrev,
  hasNext,
  loading = false,
  onPrev,
  onNext,
  className,
}: PaginationProps): JSX.Element | null {
  if (!hasPrev && !hasNext) return null;

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <span className="font-mono text-mono-label uppercase text-text-muted">
        Page {page}
      </span>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrev || loading}
          onClick={onPrev}
        >
          ← Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext || loading}
          onClick={onNext}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
