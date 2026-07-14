/**
 * /admin/config/packaging — SUPER_ADMIN-only editor for the packaging
 * library (Migration 0043).
 *
 * Talks to:
 *   GET    /v1/admin/packaging-options
 *   POST   /v1/admin/packaging-options
 *   PATCH  /v1/admin/packaging-options/:id
 *   POST   /v1/admin/packaging-options/:id/deactivate
 *   POST   /v1/admin/packaging-options/:id/reactivate
 *
 * UX:
 *   * Grid of existing presets — inline-editable label, dimensions,
 *     tare weight, sort order.
 *   * Deactivate / reactivate toggle per row. Deleted presets are
 *     never actually removed (historical order references).
 *   * "Add preset" reveals a create form with the same validation.
 *   * Save button is disabled while nothing is dirty and shows
 *     inline validation errors. Backend enforces the same rules
 *     (regex code, bounded dims / tare) so a bypass just 400s.
 *
 * Auth: SUPER_ADMIN only. Client-side redirect for non-SUPER_ADMIN;
 * backend is authoritative (403s the API regardless).
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

interface PackagingOption {
  id: string;
  code: string;
  label: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  tareWeightOz: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// String-first edit shape so partially-typed values ("1.") don't
// coerce to NaN during typing. Parsed on submit.
interface EditRow {
  id: string;
  code: string;
  label: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  tareWeightOz: string;
  sortOrder: string;
  isActive: boolean;
  dirty: boolean;
  errors: Record<string, string | undefined>;
}

const MAX_DIM_IN = 48;
const MAX_TARE_OZ = 400;

function toEditRow(o: PackagingOption): EditRow {
  return {
    id: o.id,
    code: o.code,
    label: o.label,
    lengthIn: String(o.lengthIn),
    widthIn: String(o.widthIn),
    heightIn: String(o.heightIn),
    tareWeightOz: String(o.tareWeightOz),
    sortOrder: String(o.sortOrder),
    isActive: o.isActive,
    dirty: false,
    errors: {},
  };
}

function parseRow(r: EditRow): {
  ok: boolean;
  errors: Record<string, string | undefined>;
  payload: {
    label: string;
    lengthIn: number;
    widthIn: number;
    heightIn: number;
    tareWeightOz: number;
    sortOrder: number;
    isActive: boolean;
  } | null;
} {
  const errors: Record<string, string | undefined> = {};
  const label = r.label.trim();
  if (label.length < 1 || label.length > 80) {
    errors.label = "Label must be 1..80 characters.";
  }
  const parseDim = (name: keyof EditRow, human: string): number | null => {
    const raw = (r[name] as string).trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n <= 0) {
      errors[name as string] = `${human} must be a positive number.`;
      return null;
    }
    if (n > MAX_DIM_IN) {
      errors[name as string] = `${human} exceeds ${MAX_DIM_IN} in.`;
      return null;
    }
    return n;
  };
  const lengthIn = parseDim("lengthIn", "Length");
  const widthIn = parseDim("widthIn", "Width");
  const heightIn = parseDim("heightIn", "Height");

  const tareNum = Number(r.tareWeightOz.trim());
  let tare = 0;
  if (!Number.isInteger(tareNum) || tareNum < 0 || tareNum > MAX_TARE_OZ) {
    errors.tareWeightOz = `Tare must be an integer 0..${MAX_TARE_OZ}.`;
  } else {
    tare = tareNum;
  }
  const sortNum = Number(r.sortOrder.trim());
  let sort = 100;
  if (!Number.isInteger(sortNum) || sortNum < 0 || sortNum > 10_000) {
    errors.sortOrder = "Sort must be an integer 0..10000.";
  } else {
    sort = sortNum;
  }

  const ok = Object.keys(errors).length === 0;
  if (!ok) return { ok: false, errors, payload: null };

  return {
    ok: true,
    errors: {},
    payload: {
      label,
      lengthIn: lengthIn as number,
      widthIn: widthIn as number,
      heightIn: heightIn as number,
      tareWeightOz: tare,
      sortOrder: sort,
      isActive: r.isActive,
    },
  };
}

export default function AdminPackagingLibraryPage(): JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== "SUPER_ADMIN") router.replace("/admin");
  }, [authLoading, user, router]);

  const listQ = useQuery({
    queryKey: ["admin", "packaging-options"],
    queryFn: () =>
      api.get<{ items: PackagingOption[] }>("/admin/packaging-options"),
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
      return api.patch<PackagingOption>(
        `/admin/packaging-options/${row.id}`,
        parsed.payload,
      );
    },
    onMutate: () => clear(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "packaging-options"] });
    },
    onError: (err) => handle(err),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) =>
      api.post<PackagingOption>(
        `/admin/packaging-options/${id}/${activate ? "reactivate" : "deactivate"}`,
        {},
      ),
    onMutate: () => clear(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "packaging-options"] });
    },
    onError: (err) => handle(err),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Configuration"
        title="Packaging library"
        description="Preset boxes and mailers the warehouse can pick during the pack step. Deactivated presets stay in the DB but no longer appear in the picker."
        actions={
          <Button
            type="button"
            variant="amber"
            size="md"
            onClick={() => setShowCreate((s) => !s)}
          >
            {showCreate ? "Cancel" : "Add preset"}
          </Button>
        }
      />

      {bannerError ? <ErrorBanner error={bannerError} /> : null}

      {showCreate ? (
        <CreateForm
          onCreated={async () => {
            await qc.invalidateQueries({ queryKey: ["admin", "packaging-options"] });
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
          onError={(e) => handle(e)}
        />
      ) : null}

      {listQ.isLoading ? (
        <div className="rounded-md border border-line bg-white p-6 text-body-sm text-text-muted">
          Loading presets…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No packaging presets"
          description="Add your first preset above — the warehouse pack modal will pick these up automatically."
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Code</Th>
            <Th>Label</Th>
            <Th align="right">L (in)</Th>
            <Th align="right">W (in)</Th>
            <Th align="right">H (in)</Th>
            <Th align="right">Tare (oz)</Th>
            <Th align="right">Sort</Th>
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
                <Td num>
                  <NumInput
                    value={r.lengthIn}
                    onChange={(v) => setRow(r.id, { lengthIn: v })}
                    error={r.errors.lengthIn}
                  />
                </Td>
                <Td num>
                  <NumInput
                    value={r.widthIn}
                    onChange={(v) => setRow(r.id, { widthIn: v })}
                    error={r.errors.widthIn}
                  />
                </Td>
                <Td num>
                  <NumInput
                    value={r.heightIn}
                    onChange={(v) => setRow(r.id, { heightIn: v })}
                    error={r.errors.heightIn}
                  />
                </Td>
                <Td num>
                  <NumInput
                    value={r.tareWeightOz}
                    onChange={(v) => setRow(r.id, { tareWeightOz: v })}
                    error={r.errors.tareWeightOz}
                  />
                </Td>
                <Td num>
                  <NumInput
                    value={r.sortOrder}
                    onChange={(v) => setRow(r.id, { sortOrder: v })}
                    error={r.errors.sortOrder}
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

function NumInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}): JSX.Element {
  return (
    <div>
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <div className="mt-1 text-body-xs text-red-700">{error}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Create-preset form. Kept inline (not modal) to match the existing
 * config-page pattern. Full validation client-side; backend re-validates
 * with the same rules.
 */
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
  const [lengthIn, setLengthIn] = useState("");
  const [widthIn, setWidthIn] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [tareOz, setTareOz] = useState("0");
  const [sortOrder, setSortOrder] = useState("100");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMut = useMutation({
    mutationFn: async () => {
      const next: Record<string, string> = {};
      const codeTrim = code.trim().toLowerCase();
      if (!/^[a-z0-9_-]{2,32}$/.test(codeTrim)) {
        next.code = "Code must match [a-z0-9_-]{2,32}.";
      }
      const labelTrim = label.trim();
      if (labelTrim.length < 1 || labelTrim.length > 80) {
        next.label = "Label must be 1..80 chars.";
      }
      const parseDim = (raw: string, name: string): number | null => {
        const n = Number(raw.trim());
        if (raw.trim() === "" || !Number.isFinite(n) || n <= 0) {
          next[name] = "Must be a positive number.";
          return null;
        }
        if (n > MAX_DIM_IN) {
          next[name] = `Max ${MAX_DIM_IN} in.`;
          return null;
        }
        return n;
      };
      const l = parseDim(lengthIn, "lengthIn");
      const w = parseDim(widthIn, "widthIn");
      const h = parseDim(heightIn, "heightIn");

      const tareN = Number(tareOz.trim());
      let tare = 0;
      if (!Number.isInteger(tareN) || tareN < 0 || tareN > MAX_TARE_OZ) {
        next.tareOz = `Must be an integer 0..${MAX_TARE_OZ}.`;
      } else {
        tare = tareN;
      }
      const sortN = Number(sortOrder.trim());
      let sort = 100;
      if (!Number.isInteger(sortN) || sortN < 0 || sortN > 10_000) {
        next.sortOrder = "Must be an integer 0..10000.";
      } else {
        sort = sortN;
      }

      if (Object.keys(next).length > 0) {
        setErrors(next);
        throw new Error("Fix the highlighted fields.");
      }
      setErrors({});
      return api.post("/admin/packaging-options", {
        code: codeTrim,
        label: labelTrim,
        lengthIn: l as number,
        widthIn: w as number,
        heightIn: h as number,
        tareWeightOz: tare,
        sortOrder: sort,
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
        New preset
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Code (URL-safe)" error={errors.code}>
          <Input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="usps_flat_med"
          />
        </Field>
        <Field label="Label" error={errors.label}>
          <Input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="USPS Medium Flat Rate Box"
          />
        </Field>
        <Field label="Length (in)" error={errors.lengthIn}>
          <Input
            type="text"
            inputMode="decimal"
            value={lengthIn}
            onChange={(e) => setLengthIn(e.target.value)}
          />
        </Field>
        <Field label="Width (in)" error={errors.widthIn}>
          <Input
            type="text"
            inputMode="decimal"
            value={widthIn}
            onChange={(e) => setWidthIn(e.target.value)}
          />
        </Field>
        <Field label="Height (in)" error={errors.heightIn}>
          <Input
            type="text"
            inputMode="decimal"
            value={heightIn}
            onChange={(e) => setHeightIn(e.target.value)}
          />
        </Field>
        <Field label="Tare (oz)" error={errors.tareOz}>
          <Input
            type="text"
            inputMode="numeric"
            value={tareOz}
            onChange={(e) => setTareOz(e.target.value)}
          />
        </Field>
        <Field label="Sort order" error={errors.sortOrder}>
          <Input
            type="text"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
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
          Create preset
        </Button>
      </div>
    </section>
  );
}
