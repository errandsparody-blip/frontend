/**
 * /admin/config/inventory-locations — SUPER_ADMIN-only editor for the
 * warehouse-location catalog (Migration 0045).
 *
 * Talks to:
 *   GET    /v1/admin/inventory-locations
 *   POST   /v1/admin/inventory-locations
 *   PATCH  /v1/admin/inventory-locations/:id
 *   POST   /v1/admin/inventory-locations/:id/deactivate
 *   POST   /v1/admin/inventory-locations/:id/reactivate
 *
 * Same UX shape as the packaging library: existing rows are
 * inline-editable, an Add form reveals below the table, deactivated
 * rows are kept (they can be reactivated). Backend enforces the
 * same regex + bounds; client validation just spares a round trip.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";

interface InventoryLocation {
  id: string;
  code: string;
  label: string;
  aisle: string | null;
  bay: string | null;
  shelf: string | null;
  bin: string | null;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EditRow {
  id: string;
  code: string; // display only — immutable client-side
  label: string;
  aisle: string;
  bay: string;
  shelf: string;
  bin: string;
  sortOrder: string;
  notes: string;
  isActive: boolean;
  dirty: boolean;
  errors: Record<string, string | undefined>;
}

const CODE_RE = /^[A-Za-z0-9-]{2,32}$/;

function toEditRow(o: InventoryLocation): EditRow {
  return {
    id: o.id,
    code: o.code,
    label: o.label,
    aisle: o.aisle ?? "",
    bay: o.bay ?? "",
    shelf: o.shelf ?? "",
    bin: o.bin ?? "",
    sortOrder: String(o.sortOrder),
    notes: o.notes ?? "",
    isActive: o.isActive,
    dirty: false,
    errors: {},
  };
}

function parseRow(r: EditRow): {
  ok: boolean;
  errors: Record<string, string>;
  payload: {
    label: string;
    aisle: string | null;
    bay: string | null;
    shelf: string | null;
    bin: string | null;
    sortOrder: number;
    notes: string | null;
    isActive: boolean;
  } | null;
} {
  const errors: Record<string, string> = {};
  const label = r.label.trim();
  if (label.length < 1 || label.length > 80) {
    errors.label = "Label must be 1..80 chars.";
  }
  const cleanField = (name: keyof EditRow, human: string): string | null => {
    const v = (r[name] as string).trim();
    if (v.length === 0) return null;
    if (v.length > 16) {
      errors[name as string] = `${human} ≤ 16 chars.`;
      return null;
    }
    return v;
  };
  const aisle = cleanField("aisle", "Aisle");
  const bay = cleanField("bay", "Bay");
  const shelf = cleanField("shelf", "Shelf");
  const bin = cleanField("bin", "Bin");
  const sortN = Number(r.sortOrder.trim());
  let sort = 100;
  if (!Number.isInteger(sortN) || sortN < 0 || sortN > 10_000) {
    errors.sortOrder = "Integer 0..10000.";
  } else {
    sort = sortN;
  }
  const notesTrim = r.notes.trim();
  let notes: string | null = null;
  if (notesTrim.length > 280) errors.notes = "Notes ≤ 280 chars.";
  else if (notesTrim.length > 0) notes = notesTrim;

  const ok = Object.keys(errors).length === 0;
  if (!ok) return { ok: false, errors, payload: null };

  return {
    ok: true,
    errors: {},
    payload: {
      label,
      aisle,
      bay,
      shelf,
      bin,
      sortOrder: sort,
      notes,
      isActive: r.isActive,
    },
  };
}

export default function AdminInventoryLocationsPage(): JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== "SUPER_ADMIN") router.replace("/admin");
  }, [authLoading, user, router]);

  const listQ = useQuery({
    queryKey: ["admin", "inventory-locations"],
    queryFn: () =>
      api.get<{ items: InventoryLocation[] }>("/admin/inventory-locations"),
    enabled: !authLoading && user?.role === "SUPER_ADMIN",
    staleTime: 30_000,
  });

  const [rows, setRows] = useState<EditRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (listQ.data) setRows(listQ.data.items.map(toEditRow));
  }, [listQ.data]);

  function setRow(id: string, patch: Partial<EditRow>): void {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, ...patch, dirty: true, errors: {} } : r,
      ),
    );
  }

  const saveMut = useMutation({
    mutationFn: async (row: EditRow) => {
      const parsed = parseRow(row);
      if (!parsed.ok || !parsed.payload) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, errors: parsed.errors } : r)),
        );
        throw new Error("Fix the highlighted fields.");
      }
      return api.patch<InventoryLocation>(
        `/admin/inventory-locations/${row.id}`,
        parsed.payload,
      );
    },
    onMutate: () => clear(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "inventory-locations"] });
    },
    onError: (err) => handle(err),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) =>
      api.post<InventoryLocation>(
        `/admin/inventory-locations/${id}/${activate ? "reactivate" : "deactivate"}`,
        {},
      ),
    onMutate: () => clear(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "inventory-locations"] });
    },
    onError: (err) => handle(err),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Configuration"
        title="Inventory locations"
        description="Warehouse locations (aisle / bay / shelf / bin) that SKUs can be assigned to. Deactivated locations stay in the catalog so historical SKU assignments still resolve."
        actions={
          <Button
            type="button"
            variant="amber"
            size="md"
            onClick={() => setShowCreate((s) => !s)}
          >
            {showCreate ? "Cancel" : "Add location"}
          </Button>
        }
      />

      {bannerError ? <ErrorBanner error={bannerError} /> : null}

      {showCreate ? (
        <CreateForm
          onCreated={async () => {
            await qc.invalidateQueries({ queryKey: ["admin", "inventory-locations"] });
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
          onError={(e) => handle(e)}
        />
      ) : null}

      {listQ.isLoading ? (
        <div className="rounded-md border border-line bg-white p-6 text-body-sm text-text-muted">
          Loading locations…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No inventory locations"
          description="Add your first location above — pack + PSN receive UIs will pick it up automatically once assigned to a SKU."
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Code</Th>
            <Th>Label</Th>
            <Th>Aisle</Th>
            <Th>Bay</Th>
            <Th>Shelf</Th>
            <Th>Bin</Th>
            <Th align="right">Sort</Th>
            <Th>Notes</Th>
            <Th>State</Th>
            <Th align="right">Actions</Th>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <Td mono className="text-text-muted">
                  {r.code}
                </Td>
                <Td>
                  <Input
                    type="text"
                    value={r.label}
                    onChange={(e) => setRow(r.id, { label: e.target.value })}
                  />
                  {r.errors.label ? (
                    <div className="mt-1 text-body-xs text-red-700">
                      {r.errors.label}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <FieldCell
                    value={r.aisle}
                    error={r.errors.aisle}
                    onChange={(v) => setRow(r.id, { aisle: v })}
                  />
                </Td>
                <Td>
                  <FieldCell
                    value={r.bay}
                    error={r.errors.bay}
                    onChange={(v) => setRow(r.id, { bay: v })}
                  />
                </Td>
                <Td>
                  <FieldCell
                    value={r.shelf}
                    error={r.errors.shelf}
                    onChange={(v) => setRow(r.id, { shelf: v })}
                  />
                </Td>
                <Td>
                  <FieldCell
                    value={r.bin}
                    error={r.errors.bin}
                    onChange={(v) => setRow(r.id, { bin: v })}
                  />
                </Td>
                <Td num>
                  <FieldCell
                    value={r.sortOrder}
                    error={r.errors.sortOrder}
                    onChange={(v) => setRow(r.id, { sortOrder: v })}
                    mono
                  />
                </Td>
                <Td>
                  <FieldCell
                    value={r.notes}
                    error={r.errors.notes}
                    onChange={(v) => setRow(r.id, { notes: v })}
                  />
                </Td>
                <Td>
                  <StatusPill tone={r.isActive ? "success" : "neutral"}>
                    {r.isActive ? "active" : "inactive"}
                  </StatusPill>
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!r.dirty || saveMut.isPending}
                      loading={saveMut.isPending && saveMut.variables?.id === r.id}
                      onClick={() => saveMut.mutate(r)}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={toggleMut.isPending}
                      onClick={() =>
                        toggleMut.mutate({ id: r.id, activate: !r.isActive })
                      }
                    >
                      {r.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </Td>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FieldCell({
  value,
  onChange,
  error,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={mono ? "font-mono" : undefined}
      />
      {error ? (
        <div className="mt-1 text-body-xs text-red-700">{error}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CreateForm({
  onCreated,
  onCancel,
  onError,
}: {
  onCreated: () => Promise<void>;
  onCancel: () => void;
  onError: (e: unknown) => void;
}): JSX.Element {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [aisle, setAisle] = useState("");
  const [bay, setBay] = useState("");
  const [shelf, setShelf] = useState("");
  const [bin, setBin] = useState("");
  const [sortOrder, setSortOrder] = useState("100");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMut = useMutation({
    mutationFn: async () => {
      const next: Record<string, string> = {};
      const codeTrim = code.trim();
      if (!CODE_RE.test(codeTrim)) {
        next.code = "Letters, digits and hyphens only, 2..32 chars.";
      }
      const labelTrim = label.trim();
      if (labelTrim.length < 1 || labelTrim.length > 80) {
        next.label = "1..80 chars.";
      }
      const clampField = (v: string, name: string): string | undefined => {
        const t = v.trim();
        if (t.length === 0) return undefined;
        if (t.length > 16) {
          next[name] = "≤ 16 chars.";
          return undefined;
        }
        return t;
      };
      const aisleV = clampField(aisle, "aisle");
      const bayV = clampField(bay, "bay");
      const shelfV = clampField(shelf, "shelf");
      const binV = clampField(bin, "bin");

      const sortN = Number(sortOrder.trim());
      let sort = 100;
      if (!Number.isInteger(sortN) || sortN < 0 || sortN > 10_000) {
        next.sortOrder = "Integer 0..10000.";
      } else {
        sort = sortN;
      }
      const notesTrim = notes.trim();
      let notesV: string | undefined;
      if (notesTrim.length > 280) next.notes = "≤ 280 chars.";
      else if (notesTrim.length > 0) notesV = notesTrim;

      if (Object.keys(next).length > 0) {
        setErrors(next);
        throw new Error("Fix the highlighted fields.");
      }
      setErrors({});
      return api.post("/admin/inventory-locations", {
        code: codeTrim,
        label: labelTrim,
        ...(aisleV !== undefined ? { aisle: aisleV } : {}),
        ...(bayV !== undefined ? { bay: bayV } : {}),
        ...(shelfV !== undefined ? { shelf: shelfV } : {}),
        ...(binV !== undefined ? { bin: binV } : {}),
        sortOrder: sort,
        ...(notesV !== undefined ? { notes: notesV } : {}),
      });
    },
    onSuccess: async () => {
      await onCreated();
    },
    onError: (e) => onError(e),
  });

  return (
    <section className="rounded-md border border-line bg-cream-soft p-4">
      <h3 className="font-mono text-mono-label uppercase tracking-[1.4px] text-amber">
        New location
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Code" error={errors.code}>
          <Input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="A-01-03-B"
          />
        </Field>
        <Field label="Label" error={errors.label}>
          <Input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Aisle A · Bay 01 · Shelf 03 · Bin B"
          />
        </Field>
        <Field label="Aisle" error={errors.aisle}>
          <Input
            type="text"
            value={aisle}
            onChange={(e) => setAisle(e.target.value)}
          />
        </Field>
        <Field label="Bay" error={errors.bay}>
          <Input
            type="text"
            value={bay}
            onChange={(e) => setBay(e.target.value)}
          />
        </Field>
        <Field label="Shelf" error={errors.shelf}>
          <Input
            type="text"
            value={shelf}
            onChange={(e) => setShelf(e.target.value)}
          />
        </Field>
        <Field label="Bin" error={errors.bin}>
          <Input
            type="text"
            value={bin}
            onChange={(e) => setBin(e.target.value)}
          />
        </Field>
        <Field label="Sort" error={errors.sortOrder}>
          <Input
            type="text"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
        <Field label="Notes" error={errors.notes}>
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={onCancel}
          disabled={createMut.isPending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="amber"
          size="md"
          loading={createMut.isPending}
          disabled={createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          Create location
        </Button>
      </div>
    </section>
  );
}
