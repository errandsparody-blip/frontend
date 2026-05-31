"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useApiErrorHandler } from "@/lib/errors";

interface Member {
  id: string;
  email: string;
  role: "VENDOR" | "VENDOR_SUB_USER";
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface TeamResp {
  invitations: Invitation[];
  members: Member[];
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email."),
});
type InviteInput = z.infer<typeof inviteSchema>;

const TONE: Record<Invitation["status"], "info" | "success" | "warning" | "error" | "neutral"> = {
  PENDING: "info",
  ACCEPTED: "success",
  REVOKED: "error",
  EXPIRED: "warning",
};

export default function TeamPage() {
  const qc = useQueryClient();

  const teamQ = useQuery({
    queryKey: ["team"],
    queryFn: () => api.get<TeamResp>("/team"),
  });

  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "" },
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  const { bannerError, handle, clear } = useApiErrorHandler(form);

  const inviteMut = useMutation({
    mutationFn: (input: InviteInput) => api.post<Invitation>("/team/invitations", input),
    onMutate: clear,
    onSuccess: async () => {
      reset({ email: "" });
      await qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err) => handle(err),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.post<{ ok: true }>(`/team/invitations/${id}/revoke`),
    onMutate: clear,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err) => handle(err),
  });

  function onAction(handler: NonNullable<NonNullable<typeof bannerError>["entry"]["action"]>["handler"]) {
    if (handler === "support") window.location.href = "mailto:hello@myusaerrands.com";
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="  Team"
        title="Sub-users"
        description="Invite teammates to manage products, PSNs, orders, and returns. Sub-users have read + write access inside this account but cannot invite others or change billing settings."
      />

      <section className="rounded-md border border-line bg-white p-6">
        <h2 className="text-h3 font-semibold text-ink">Invite a sub-user</h2>
        <form
          onSubmit={handleSubmit((v) => inviteMut.mutate(v))}
          className="mt-4 flex items-end gap-3"
          noValidate
        >
          <Field label="Email" error={errors.email?.message} className="flex-1">
            <Input type="email" placeholder="teammate@example.com" {...register("email")} />
          </Field>
          <Button type="submit" variant="amber" loading={isSubmitting || inviteMut.isPending}>
            Send invite
          </Button>
        </form>
        <div className="mt-3">
          <ErrorBanner error={bannerError} onAction={onAction} />
        </div>
      </section>

      {teamQ.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : teamQ.data ? (
        <>
          <section>
            <h2 className="font-mono text-mono-label uppercase text-text-muted">Members</h2>
            <div className="mt-3">
              <DataTable>
                <THead>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Joined</Th>
                </THead>
                <TBody>
                  {teamQ.data.members.map((m) => (
                    <TR key={m.id}>
                      <Td>{m.email}</Td>
                      <Td mono className="text-text-muted">
                        {m.role.replace(/_/g, " ")}
                      </Td>
                      <Td mono className="text-text-muted">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </Td>
                    </TR>
                  ))}
                </TBody>
              </DataTable>
            </div>
          </section>

          <section>
            <h2 className="font-mono text-mono-label uppercase text-text-muted">Invitations</h2>
            <div className="mt-3">
              {teamQ.data.invitations.length === 0 ? (
                <p className="font-mono text-mono-label uppercase text-text-subtle">No invitations yet.</p>
              ) : (
                <DataTable>
                  <THead>
                    <Th>Email</Th>
                    <Th>Status</Th>
                    <Th>Sent</Th>
                    <Th>Expires</Th>
                    <Th align="right">Action</Th>
                  </THead>
                  <TBody>
                    {teamQ.data.invitations.map((inv) => (
                      <TR key={inv.id}>
                        <Td>{inv.email}</Td>
                        <Td>
                          <StatusPill tone={TONE[inv.status]}>{inv.status}</StatusPill>
                        </Td>
                        <Td mono className="text-text-muted">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </Td>
                        <Td mono className="text-text-muted">
                          {new Date(inv.expiresAt).toLocaleDateString()}
                        </Td>
                        <Td align="right">
                          {inv.status === "PENDING" ? (
                            <button
                              type="button"
                              onClick={() => revokeMut.mutate(inv.id)}
                              className="font-mono text-[11px] uppercase tracking-[1.2px] text-error hover:text-ink"
                              disabled={revokeMut.isPending}
                            >
                              Revoke
                            </button>
                          ) : (
                            <span className="font-mono text-mono-label uppercase text-text-subtle">—</span>
                          )}
                        </Td>
                      </TR>
                    ))}
                  </TBody>
                </DataTable>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
