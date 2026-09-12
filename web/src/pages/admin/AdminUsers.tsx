import { useState } from "react";
import { Users } from "lucide-react";

import { Monogram } from "@/components/Monogram";
import { Button, ButtonLink } from "@/components/kit/Button";
import { ConfirmDialog, Dialog } from "@/components/kit/Dialog";
import { Field, Select, TextArea } from "@/components/kit/Form";
import {
  EmptyState,
  Skeleton,
  StatusPill,
  Surface,
  type PillTone,
} from "@/components/kit/Surface";
import {
  useAdminUsers,
  useCompMembership,
  useSetUserStatus,
  type AdminUserRow,
} from "@/features/admin/queries";
import { errorMessage } from "@/lib/api";
import { shortDate } from "@/lib/time";
import { useDebounced } from "@/lib/useDebounced";
import { AdminPage } from "./AdminLayout";
import { ROLE_LABEL } from "./labels";
import { Pager, SearchBox, Table, Td, Th } from "./table";

const STATUS: Record<AdminUserRow["status"], { label: string; tone: PillTone }> = {
  active: { label: "Active", tone: "good" },
  suspended: { label: "Suspended", tone: "bad" },
  deleted: { label: "Deactivated", tone: "neutral" },
};

function StatusDialog({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const setStatus = useSetUserStatus();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const suspending = user.status === "active";

  function confirm() {
    if (suspending && !note.trim()) {
      setError("Add a reason. It goes in the audit log.");
      return;
    }
    setError(null);
    setStatus.mutate(
      { id: user.id, status: suspending ? "suspended" : "active", note: note.trim() },
      {
        onSuccess: onClose,
        onError: (e) => setError(errorMessage(e, "That did not go through. Try again.")),
      },
    );
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={confirm}
      busy={setStatus.isPending}
      danger={suspending}
      title={suspending ? `Suspend ${user.full_name}?` : `Reinstate ${user.full_name}?`}
      description={
        suspending
          ? "They are signed out everywhere at once, open chats are disconnected, their listing leaves search, and they cannot sign back in until reinstated."
          : "They can sign in again."
      }
      confirmLabel={suspending ? "Suspend" : "Reinstate"}
    >
      <Field
        label={suspending ? "Reason" : "Note (optional)"}
        htmlFor="status-note"
        hint="Kept in the audit log."
        error={error}
      >
        <TextArea id="status-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}

function CompDialog({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const comp = useCompMembership();
  const [days, setDays] = useState("30");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function give() {
    setError(null);
    comp.mutate(
      { userId: user.id, days: Number(days), note: note.trim() },
      {
        onSuccess: onClose,
        onError: (e) => setError(errorMessage(e, "That did not go through. Try again.")),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Give ${user.full_name} a free membership`}
      description="It works like a paid membership for the days you choose. No payment is taken."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={comp.isPending} onClick={give}>
            Give membership
          </Button>
        </>
      }
    >
      <Field label="Length" htmlFor="comp-days">
        <Select id="comp-days" value={days} onChange={(event) => setDays(event.target.value)}>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </Select>
      </Field>
      <Field className="mt-4" label="Reason" htmlFor="comp-note" hint="Kept in the audit log." error={error}>
        <TextArea id="comp-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </Dialog>
  );
}

export function AdminUsers() {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [role, setRole] = useState<AdminUserRow["role"] | "">("");
  const [status, setStatus] = useState<AdminUserRow["status"] | "">("");
  const [offset, setOffset] = useState(0);
  const users = useAdminUsers({
    q: query || undefined,
    role: role || undefined,
    status: status || undefined,
    offset,
  });
  const [changing, setChanging] = useState<AdminUserRow | null>(null);
  const [comping, setComping] = useState<AdminUserRow | null>(null);

  return (
    <AdminPage
      title="Users"
      subtitle="Everyone with an account. Suspending someone signs them out everywhere immediately."
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchBox
          value={q}
          label="Search people"
          onChange={(next) => {
            setQ(next);
            setOffset(0);
          }}
        />
        <div className="w-full sm:w-40">
          <Select
            aria-label="Role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as AdminUserRow["role"] | "");
              setOffset(0);
            }}
          >
            <option value="">All roles</option>
            <option value="hirer">Families</option>
            <option value="helper">Helpers</option>
            <option value="admin">Admins</option>
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select
            aria-label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AdminUserRow["status"] | "");
              setOffset(0);
            }}
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deactivated</option>
          </Select>
        </div>
      </div>

      <Surface>
        {users.isLoading ? (
          <Skeleton className="h-64" />
        ) : !users.data?.items.length ? (
          <EmptyState icon={Users} title="No one matches" body="Try a different search or filter." />
        ) : (
          <>
            <Table minWidth={860}>
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Membership</Th>
                  <Th>Joined</Th>
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((user) => (
                  <tr key={user.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Monogram name={user.full_name || "?"} size={32} />
                        <div className="min-w-0">
                          <p className="font-semibold">{user.full_name || "No name"}</p>
                          <p data-numeric className="text-[12px] text-ink-muted">
                            {user.phone ?? user.email ?? "—"}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>{ROLE_LABEL[user.role] ?? user.role}</Td>
                    <Td>
                      <StatusPill tone={STATUS[user.status].tone}>{STATUS[user.status].label}</StatusPill>
                    </Td>
                    <Td>
                      {user.subscribed ? (
                        <StatusPill tone="moss">Member</StatusPill>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-muted">{shortDate(user.created_at)}</Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        {user.helper_profile_id && (
                          <ButtonLink
                            to={`/helpers/${user.helper_profile_id}`}
                            size="sm"
                            variant="ghost"
                            className="hover:bg-oat"
                          >
                            Card
                          </ButtonLink>
                        )}
                        {user.role !== "admin" && user.status === "active" && !user.subscribed && (
                          <Button size="sm" variant="ghost" className="hover:bg-oat" onClick={() => setComping(user)}>
                            Free month
                          </Button>
                        )}
                        {user.role !== "admin" && user.status !== "deleted" && (
                          <Button size="sm" variant="secondary" onClick={() => setChanging(user)}>
                            {user.status === "active" ? "Suspend" : "Reinstate"}
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager offset={offset} total={users.data.total} onChange={setOffset} />
          </>
        )}
      </Surface>

      {changing && <StatusDialog key={changing.id} user={changing} onClose={() => setChanging(null)} />}
      {comping && <CompDialog key={comping.id} user={comping} onClose={() => setComping(null)} />}
    </AdminPage>
  );
}
