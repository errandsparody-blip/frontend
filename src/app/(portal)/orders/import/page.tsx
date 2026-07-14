/**
 * /orders/import — Vendor CSV bulk import (Migration 0046).
 *
 * Talks to:
 *   POST /v1/orders/import       — process one CSV
 *   GET  /v1/orders/imports      — list past jobs
 *
 * SOLID / UX
 *   * The file picker + the submit mutation are separate concerns —
 *     the picker just yields a string; the mutation is a plain
 *     server round-trip. No hidden state between them.
 *   * The template CSV is generated from the same HEADER_KEYS array
 *     the API expects, keeping the two sides literally in sync
 *     (change here → change the API's HEADER_SPEC and both stay
 *     honest).
 *   * All file reads use `FileReader.readAsText` with a max-bytes
 *     guard mirroring the API's limit. A larger file is rejected
 *     client-side without a wasted round-trip.
 *   * Per-row results are shown inline; the vendor never has to
 *     open a second page to see which rows failed and why.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

const HEADER_KEYS = [
  "external_reference",
  "recipient_name",
  "recipient_email",
  "recipient_phone",
  "ship_address_line1",
  "ship_address_line2",
  "ship_city",
  "ship_state",
  "ship_postal_code",
  "ship_country",
  "sku_id",
  "quantity",
] as const;

// Mirror the backend cap. Client rejects locally so a huge accidental
// paste never crosses the wire.
const MAX_BYTES = 2 * 1024 * 1024;

interface RowResult {
  row: number;
  status: "success" | "error";
  orderId?: string;
  message?: string;
}

interface ImportJob {
  id: string;
  vendorId: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  sourceFilename: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; message: string }>;
  createdAt: string;
  completedAt: string | null;
}

interface ImportResponse extends ImportJob {
  jobId: string;
  results: RowResult[];
}

export default function OrdersImportPage(): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();

  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [lastResult, setLastResult] = useState<ImportResponse | null>(null);

  const jobsQ = useQuery({
    queryKey: ["orders", "imports"],
    queryFn: () => api.get<{ items: ImportJob[] }>("/orders/imports"),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pick a CSV file first.");
      return api.post<ImportResponse>("/orders/import", {
        csv: file.text,
        sourceFilename: file.name,
      });
    },
    onMutate: () => {
      clear();
      setLastResult(null);
    },
    onSuccess: async (data) => {
      setLastResult(data);
      setFile(null);
      await qc.invalidateQueries({ queryKey: ["orders", "imports"] });
    },
    onError: (err) => handle(err),
  });

  async function onFilePicked(f: File): Promise<void> {
    if (f.size > MAX_BYTES) {
      handle(new Error(`File exceeds ${MAX_BYTES / (1024 * 1024)} MB.`));
      return;
    }
    const text = await f.text();
    setFile({ name: f.name, text });
    setLastResult(null);
  }

  function downloadTemplate(): void {
    const header = HEADER_KEYS.join(",");
    const example = [
      "ORD-1001", // external_reference
      "Jane Doe", // recipient_name
      "jane@example.com", // recipient_email
      "3055551212", // recipient_phone
      "123 Main St", // ship_address_line1
      "", // ship_address_line2
      "Miami", // ship_city
      "FL", // ship_state
      "33101", // ship_postal_code
      "US", // ship_country
      "UER-VA0001-T-STD", // sku_id
      "1", // quantity
    ]
      .map((v) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v))
      .join(",");
    const csv = `${header}\n${example}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Orders"
        title="Bulk import from CSV"
        description="Upload a CSV of orders — one line per order. Every row goes through the same validation and wallet checks as the wizard, so a failed row never partially commits."
        actions={
          <Button type="button" variant="outline" size="md" onClick={downloadTemplate}>
            Download template
          </Button>
        }
      />

      {bannerError ? <ErrorBanner error={bannerError} /> : null}

      <section className="rounded-md border border-line bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border border-line bg-white px-3 py-2 text-body-sm font-semibold text-ink hover:bg-cream-soft">
            Choose CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFilePicked(f);
                // Reset input so re-picking the same file re-triggers.
                e.currentTarget.value = "";
              }}
            />
          </label>
          {file ? (
            <>
              <span className="font-mono text-body-sm text-ink">{file.name}</span>
              <span className="font-mono text-body-xs text-text-muted">
                {(new Blob([file.text]).size / 1024).toFixed(1)} KB
              </span>
            </>
          ) : (
            <span className="text-body-sm text-text-muted">
              No file selected. Max 2 MB, 500 rows.
            </span>
          )}
          <Button
            type="button"
            variant="amber"
            size="md"
            onClick={() => submitMut.mutate()}
            loading={submitMut.isPending}
            disabled={submitMut.isPending || file === null}
          >
            {submitMut.isPending ? "Processing…" : "Upload"}
          </Button>
        </div>
        <p className="mt-3 text-body-sm text-text-muted">
          Required columns:{" "}
          <span className="font-mono text-body-xs">{HEADER_KEYS.join(", ")}</span>
        </p>
      </section>

      {lastResult ? (
        <section className="rounded-md border border-line bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-h3 font-semibold text-ink">
                Result · {lastResult.sourceFilename}
              </h2>
              <div className="mt-1 font-mono text-body-sm text-text-muted">
                {lastResult.successCount} succeeded ·{" "}
                {lastResult.errorCount} failed · {lastResult.rowCount} total
              </div>
            </div>
            <StatusPill
              tone={
                lastResult.status === "COMPLETED"
                  ? "success"
                  : lastResult.status === "FAILED"
                    ? "error"
                    : "info"
              }
            >
              {lastResult.status}
            </StatusPill>
          </div>

          <DataTable>
            <THead>
              <Th>Row</Th>
              <Th>Status</Th>
              <Th>Order</Th>
              <Th>Message</Th>
            </THead>
            <TBody>
              {lastResult.results.map((r) => (
                <TR key={r.row}>
                  <Td num>{r.row}</Td>
                  <Td>
                    <StatusPill tone={r.status === "success" ? "success" : "error"}>
                      {r.status}
                    </StatusPill>
                  </Td>
                  <Td mono>{r.orderId ?? "—"}</Td>
                  <Td className="text-body-sm text-text-muted">
                    {r.message ?? ""}
                  </Td>
                </TR>
              ))}
            </TBody>
          </DataTable>
        </section>
      ) : null}

      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="text-h3 font-semibold text-ink">Recent imports</h2>
        <div className="mt-4">
          {jobsQ.isLoading ? (
            <div className="text-body-sm text-text-muted">Loading…</div>
          ) : (jobsQ.data?.items ?? []).length === 0 ? (
            <EmptyState
              title="No imports yet"
              description="Upload your first CSV above — past runs will appear here for audit."
            />
          ) : (
            <DataTable>
              <THead>
                <Th>Filename</Th>
                <Th>Status</Th>
                <Th align="right">Success</Th>
                <Th align="right">Failed</Th>
                <Th align="right">Total</Th>
                <Th>Completed</Th>
              </THead>
              <TBody>
                {(jobsQ.data?.items ?? []).map((j) => (
                  <TR key={j.id}>
                    <Td>{j.sourceFilename}</Td>
                    <Td>
                      <StatusPill
                        tone={
                          j.status === "COMPLETED"
                            ? "success"
                            : j.status === "FAILED"
                              ? "error"
                              : "info"
                        }
                      >
                        {j.status}
                      </StatusPill>
                    </Td>
                    <Td num>{j.successCount}</Td>
                    <Td num>{j.errorCount}</Td>
                    <Td num>{j.rowCount}</Td>
                    <Td mono className="text-text-muted">
                      {j.completedAt
                        ? new Date(j.completedAt).toLocaleString()
                        : "—"}
                    </Td>
                  </TR>
                ))}
              </TBody>
            </DataTable>
          )}
        </div>
      </section>
    </div>
  );
}
