/**
 * Table primitives — locked to Design System v1.0.
 *
 * Anatomy (mirroring `.ds-table` in USA_Errands_Design_System.html):
 *   - <DataTable>  → wrapper that provides the rounded-md border + overflow
 *   - <THead>      → ink-filled header row
 *   - <Th>         → mono-eyebrow text, white on ink, optional align
 *   - <TR>         → hover state on cream-soft, divider via parent's divide-y
 *   - <Td>         → 14/16 padding, body-sm, optional mono / num / right
 *
 * Always use these instead of raw <table> / <thead> / <th> in vendor + admin
 * pages so the design language stays a single source of truth.
 */

import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface DataTableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function DataTable({ children, className, ...rest }: DataTableProps): JSX.Element {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-line bg-white",
        className,
      )}
      {...rest}
    >
      <table className="min-w-full">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }): JSX.Element {
  return (
    <thead className="bg-ink">
      <tr>{children}</tr>
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }): JSX.Element {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right";
  children: ReactNode;
}

export function Th({ align = "left", className, children, ...rest }: ThProps): JSX.Element {
  return (
    <th
      className={cn(
        "px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[1.6px] text-text-inv",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
}

export function TR({ children, className, ...rest }: TrProps): JSX.Element {
  return (
    <tr className={cn("hover:bg-cream-soft/40", className)} {...rest}>
      {children}
    </tr>
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Align numbers to the right + tabular-nums + mono. */
  num?: boolean;
  /** JetBrains Mono font for identifiers, codes, dates. */
  mono?: boolean;
  /** Visually emphasize a primary cell. */
  strong?: boolean;
  align?: "left" | "right" | "center";
  children: ReactNode;
}

export function Td({
  num,
  mono,
  strong,
  align,
  className,
  children,
  ...rest
}: TdProps): JSX.Element {
  const computedAlign =
    align ?? (num ? "right" : "left");
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-body-sm",
        computedAlign === "right" ? "text-right" : computedAlign === "center" ? "text-center" : "",
        num ? "font-mono tabular-nums" : "",
        mono ? "font-mono" : "",
        strong ? "font-medium text-ink" : "",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
