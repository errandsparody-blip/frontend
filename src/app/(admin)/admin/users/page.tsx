/**
 * /admin/users — SUPER_ADMIN-only listing of admin-flavoured users
 * with an inline role-change control.
 *
 * Introduced by migration 0039. Talks to:
 *   GET   /v1/admin/users              list admin users
 *   PATCH /v1/admin/users/:id/role     update role, revokes sessions
 *
 * UX shape:
 *   * Search box (email substring) — cheap client-friendly filter.
 *   * Table row per user: email · current role · dropdown to change
 *     · Save button per row (only enabled when the dropdown differs
 *     from the current role).
 *   * Save shows a confirmation toast noting that the target has
 *     been logged out and will need to re-authenticate.
 *
 * SUPER_ADMIN gate is enforced in three places:
 *   1. Frontend: this page redirects non-SUPER_ADMIN users to /admin.
 *   2. Sidebar: the "Admin users" nav item is `superAdminOnly`, so
 *      other roles never see it.
 *   3. Backend: @Roles(SUPER_ADMIN) on the controller — the only
 *      one that matters for security.
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorBanner } from "@/components/errors/error-banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, TBody, THead, Th, TR, Td } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useApiErrorHandler } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

type AdminRole = "ADMIN" | "FINANCE_ADMIN" | "WAREHOUSE_OPERATOR" | "SUPER_ADMIN";

const ROLE_OPTIONS: readonly AdminRole[] = [
  "ADMIN",
  "FINANCE_ADMIN",
  "WAREHOUSE_OPERATOR",
  "SUPER_ADMIN",
];

interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  status: "ACTIVE" | "PENDING_EMAIL_VERIFICATION" | "SUSPENDED" | "CLOSED";
  mfaEnrolledAt: string | null;
  createdAt: string;
}

interface ListResponse {
  items: AdminUser[];
  nextCursor: string | null;
}

interface PatchRoleResponse {
  id: string;
  email: string;
  role: AdminRole;
  revokedSessions: boolean;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminUsersPage(): JSX.Element | null {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Client-side redirect for non-SUPER_ADMIN. The backend is
  // authoritative — it will 403 the API — so this is only UX.
  useEffect(() => {
    if (!authLoading && user && user.role !== "SUPER_ADMIN") {
      router.replace("/admin");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="p-8 font-mono text-mono-label uppercase text-text-muted">
        Loading…
      </div>
    );
  }
  if (user.role !== "SUPER_ADMIN") return null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="  Users"
        title="Admin users"
        description="Promote, demote, or reassign roles for platform staff. Changes revoke every active session for the target user so they must log in again before their new role takes effect."
      />
      <UserList currentUserId={user.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// User list + role editor
// ---------------------------------------------------------------------------

function UserList({ currentUserId }: { currentUserId: string }): JSX.Element {
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  params.set("limit", "100");
  if (search.trim()) params.set("search", search.trim());

  const usersQ = useQuery({
    queryKey: ["admin", "users", { search: search.trim() }],
    queryFn: () => api.get<ListResponse>(`/admin/users?${params.toString()}`),
  });

  return (
    <>
      <div className="max-w-md">
        <Input
          type="text"
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {usersQ.isLoading ? (
        <div className="font-mono text-mono-label uppercase text-text-muted">Loading…</div>
      ) : usersQ.isError ? (
        <div className="rounded-md border-l-4 border-error bg-error/10 px-5 py-4 text-body-sm text-error">
          Failed to load admin users. Refresh to retry.
        </div>
      ) : !usersQ.data || usersQ.data.items.length === 0 ? (
        <EmptyState
          title="No admin users match"
          description={
            search.trim()
              ? `No results for "${search.trim()}".`
              : "There are no admin-flavoured users on the platform yet."
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Email</Th>
            <Th>Current role</Th>
            <Th>Status</Th>
            <Th>MFA</Th>
            <Th>Change to</Th>
            <Th align="right">Action</Th>
          </THead>
          <TBody>
            {usersQ.data.items.map((u) => (
              <UserRow key={u.id} user={u} currentUserId={currentUserId} />
            ))}
          </TBody>
        </DataTable>
      )}
    </>
  );
}

function UserRow({
  user,
  currentUserId,
}: {
  user: AdminUser;
  currentUserId: string;
}): JSX.Element {
  const qc = useQueryClient();
  const { bannerError, handle, clear } = useApiErrorHandler();
  const [nextRole, setNextRole] = useState<AdminRole>(user.role);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const isSelf = user.id === currentUserId;
  const dirty = nextRole !== user.role;

  const saveMut = useMutation({
    mutationFn: () =>
      api.patch<PatchRoleResponse>(`/admin/users/${user.id}/role`, { role: nextRole }),
    onMutate: () => {
      clear();
      setSavedMessage(null);
    },
    onSuccess: (res) => {
      // Refresh the list so the row's current-role column updates
      // to the new value on the next render.
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setSavedMessage(
        res.revokedSessions
          ? `Role saved. ${res.email} has been logged out and will need to re-authenticate.`
          : "Role saved (no change).",
      );
    },
    onError: (err) => handle(err),
  });

  return (
    <>
      <TR>
        <Td strong>
          {user.email}
          {isSelf ? (
            <span className="ml-2 rounded-sm bg-amber/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[1.2px] text-amber">
              you
            </span>
          ) : null}
        </Td>
        <Td mono className="text-text-muted">
          {user.role}
        </Td>
        <Td>
          <StatusPill
            tone={
              user.status === "ACTIVE"
                ? "success"
                : user.status === "SUSPENDED" || user.status === "CLOSED"
                  ? "error"
                  : "warning"
            }
          >
            {user.status.replace(/_/g, " ")}
          </StatusPill>
        </Td>
        <Td mono className="text-text-muted">
          {user.mfaEnrolledAt ? "enrolled" : "—"}
        </Td>
        <Td>
          <select
            value={nextRole}
            onChange={(e) => setNextRole(e.target.value as AdminRole)}
            disabled={isSelf}
            className="h-9 rounded-sm border border-line-strong bg-white px-2 font-mono text-body-sm text-text outline-none focus:border-ink disabled:cursor-not-allowed disabled:opacity-50"
            title={
              isSelf
                ? "You can't change your own role. Ask another SUPER_ADMIN."
                : "Pick a new role"
            }
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Td>
        <Td align="right">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending || isSelf}
            loading={saveMut.isPending}
          >
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </Td>
      </TR>
      {bannerError || savedMessage ? (
        <TR>
          <Td className="p-0" align="left">
            <div className="col-span-6 px-2 py-2">
              {bannerError ? (
                <ErrorBanner error={bannerError} onAction={() => undefined} />
              ) : null}
              {savedMessage ? (
                <div className="rounded-sm border-l-4 border-success bg-success/10 px-4 py-2 text-body-sm text-text">
                  {savedMessage}
                </div>
              ) : null}
            </div>
          </Td>
        </TR>
      ) : null}
    </>
  );
}
