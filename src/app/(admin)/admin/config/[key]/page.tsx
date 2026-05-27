"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { BackButton } from "@/components/portal/back-button";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { normalizeError, useApiErrorHandler } from "@/lib/errors";

interface ConfigRow {
  key: string;
  description: string | null;
  value: unknown;
  updatedAt: string;
  updatedBy: string | null;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function AdminConfigEditPage() {
  const params = useParams<{ key: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const configQ = useQuery({
    queryKey: ["admin", "config", params.key],
    queryFn: () => api.get<ConfigRow>(`/admin/config/${encodeURIComponent(params.key)}`),
    enabled: !!params.key,
  });
  const { data, isLoading } = configQ;

  const [draft, setDraft] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);

  const { bannerError, handle, clear } = useApiErrorHandler();

  useEffect(() => {
    if (data) {
      setDraft(safeStringify(data.value));
    }
  }, [data]);

  const original = useMemo(() => (data ? safeStringify(data.value) : ""), [data]);
  const dirty = draft !== original;

  const save = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(draft);
      } catch (err) {
        throw new Error(`Invalid JSON: ${(err as Error).message}`);
      }
      return api.patch<ConfigRow>(`/admin/config/${encodeURIComponent(params.key)}`, { value: parsed });
    },
    onMutate: clear,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "config"] });
      router.push("/admin/config");
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "retry") void save.mutate();
    else if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
  }

  function tryParse(): void {
    try {
      JSON.parse(draft);
      setParseError(null);
    } catch (err) {
      setParseError((err as Error).message);
    }
  }

  if (isLoading) {
    return <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>;
  }
  if (configQ.error || !data) {
    const normalized = configQ.error ? normalizeError(configQ.error) : null;
    return (
      <div role="alert" className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4">
        <div className="font-mono text-mono-label uppercase text-error">
          {normalized?.entry.title ?? "Configuration key not found"}
        </div>
        <p className="mt-1 text-body-sm text-text">
          {normalized?.entry.body ?? "The key may have been deleted or you don't have access."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`[07] Configuration / ${data.key}`}
        title={data.key}
        description={data.description ?? "Edit the JSON value. The change is recorded in the audit log."}
        actions={<BackButton fallback="/admin/config" />}
      />

      <Field label="JSON value" error={parseError ?? undefined} hint="Click Validate JSON to syntax-check before saving.">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={24}
          spellCheck={false}
          className="block w-full rounded-sm border border-line-strong bg-white p-4 font-mono text-body-sm text-text outline-none focus:border-ink"
        />
      </Field>

      {dirty ? (
        <div className="rounded-md border-l-4 border-amber bg-amber/10 px-5 py-4 font-mono text-body-sm">
          You have unsaved changes. The save will write a `config.updated` audit row with the full before/after JSON.
        </div>
      ) : null}

      <ErrorBanner error={bannerError} onAction={onAction} />

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={tryParse}>
          Validate JSON
        </Button>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => setDraft(original)} disabled={!dirty}>
            Reset
          </Button>
          <Button
            type="button"
            variant="amber"
            withArrow
            disabled={!dirty || !!parseError}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
