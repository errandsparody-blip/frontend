"use client";

/**
 * Shared admin filter primitives — the canonical "inventory filter" look.
 *
 * Every admin list page composes these so the filter shell stays pixel-
 * identical: a bordered section, a responsive Field-wrapped grid, h-11
 * inputs/selects on a white background, mono-uppercase labels. Reach for
 * these instead of hand-rolling a filter row.
 *
 *   <FilterBar cols="1fr 200px 200px">
 *     <FilterField label="Search" type="search" value={q} onChange={setQ} />
 *     <FilterSelect label="Status" value={status} onChange={setStatus}
 *       options={[{ value: "", label: "All statuses" }, ...]} />
 *     <FilterDateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
 *   </FilterBar>
 */

import type { ReactNode } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Bordered section + responsive grid. Pass the responsive grid columns as a
 * Tailwind class via `gridClassName` (e.g. "md:grid-cols-[1fr_200px_200px]" or
 * "sm:grid-cols-2 lg:grid-cols-4"). It stacks to one column on mobile by
 * default. The class string lives in the calling page so Tailwind's JIT picks
 * it up.
 */
export function FilterBar({
  children,
  gridClassName = "sm:grid-cols-2 lg:grid-cols-4",
  className,
  onClear,
  canClear = true,
}: {
  children: ReactNode;
  gridClassName?: string;
  className?: string;
  /** When provided, renders a "Clear filters" button above the grid. */
  onClear?: () => void;
  /** Whether the Clear button is enabled (i.e. any filter is active). */
  canClear?: boolean;
}): JSX.Element {
  return (
    <section className={cn("rounded-md border border-line bg-white p-5", className)}>
      {onClear ? (
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClear}
            disabled={!canClear}
            className="font-mono text-[11px] uppercase tracking-[1.2px] text-text-muted transition-colors hover:text-ink disabled:opacity-40 disabled:hover:text-text-muted"
          >
            Clear filters
          </button>
        </div>
      ) : null}
      <div className={cn("grid grid-cols-1 items-end gap-4", gridClassName)}>{children}</div>
    </section>
  );
}

/** Field-wrapped text/search/datetime input matching the inventory look. */
export function FilterField({
  label,
  hint,
  type = "text",
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  hint?: string;
  type?: "text" | "search" | "datetime-local" | "date" | "number";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}): JSX.Element {
  return (
    <Field label={label} hint={hint} className={className}>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/** Field-wrapped native <select> matching the inventory dropdown styling. */
export function FilterSelect({
  label,
  hint,
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<FilterOption>;
  disabled?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <Field label={label} hint={hint} className={className}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        className="h-11 w-full rounded-sm border border-line-strong bg-white px-3 font-sans text-body text-text outline-none focus:border-ink disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A From/To datetime-local pair — two FilterFields side by side in the grid. */
export function FilterDateRange({
  from,
  to,
  onFrom,
  onTo,
  fromLabel = "From",
  toLabel = "To",
}: {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  fromLabel?: string;
  toLabel?: string;
}): JSX.Element {
  return (
    <>
      <FilterField label={fromLabel} type="datetime-local" value={from} onChange={onFrom} />
      <FilterField label={toLabel} type="datetime-local" value={to} onChange={onTo} />
    </>
  );
}

/**
 * Multi-select toggle group (e.g. transaction types) rendered as pills inside
 * a Field, so a multi-select filter still lives in the inventory shell. The
 * empty-selection state is surfaced by an "All" reset the caller can render,
 * or simply by no pills being active.
 */
export function FilterMulti({
  label,
  hint,
  options,
  selected,
  onToggle,
  onClear,
  className,
}: {
  label: string;
  hint?: string;
  options: ReadonlyArray<FilterOption>;
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  className?: string;
}): JSX.Element {
  return (
    <Field label={label} hint={hint} className={cn("col-span-full", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className={cn(
            "rounded-sm border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[1.2px]",
            selected.size === 0
              ? "border-ink bg-ink text-text-inv"
              : "border-line-strong bg-white text-text hover:border-ink",
          )}
        >
          All
        </button>
        {options.map((o) => {
          const active = selected.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              aria-pressed={active}
              className={cn(
                "rounded-sm border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[1.2px]",
                active
                  ? "border-amber bg-amber text-ink"
                  : "border-line-strong bg-white text-text hover:border-ink",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
