import { useState } from "react";
import { BadgeIndianRupee } from "lucide-react";

import { Button } from "@/components/kit/Button";
import { ConfirmDialog } from "@/components/kit/Dialog";
import { Field, Segmented, TextArea } from "@/components/kit/Form";
import { EmptyState, Skeleton, StatusPill, Surface } from "@/components/kit/Surface";
import {
  useAdminSubscriptions,
  useCancelSubscription,
  type AdminSubscriptionRow,
} from "@/features/admin/queries";
import { errorMessage } from "@/lib/api";
import { shortDate } from "@/lib/time";
import { useDebounced } from "@/lib/useDebounced";
import { AdminPage } from "./AdminLayout";
import { ROLE_LABEL } from "./labels";
import { Pager, SearchBox, Table, Td, Th } from "./table";

type View = "live" | "all";

/** An admin cancel is immediate -- unlike a member's own "turn off renewal",
 *  which keeps the days already paid for (billing.py). The dialog says so. */
function CancelDialog({ row, onClose }: { row: AdminSubscriptionRow; onClose: () => void }) {
  const cancel = useCancelSubscription();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!note.trim()) {
      setError("Add a reason. The member is shown it, and it goes in the audit log.");
      return;
    }
    setError(null);
    cancel.mutate(
      { id: row.id, note: note.trim() },
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
      danger
      busy={cancel.isPending}
      title={`End ${row.user_name}'s membership now?`}
      description="This ends it immediately, not at the end of the period, and stops renewal with Razorpay. Members can switch off renewal themselves in Settings; use this for refunds or abuse."
      confirmLabel="End membership"
    >
      <Field label="Reason" htmlFor="cancel-note" error={error}>
        <TextArea id="cancel-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}

export function AdminMemberships() {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [view, setView] = useState<View>("live");
  const [offset, setOffset] = useState(0);
  const subs = useAdminSubscriptions({
    q: query || undefined,
    live: view === "live" ? true : undefined,
    offset,
  });
  const [ending, setEnding] = useState<AdminSubscriptionRow | null>(null);

  return (
    <AdminPage
      title="Memberships"
      subtitle="Paid and complimentary memberships. To give someone a free month, find them under Users."
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          value={q}
          label="Search members"
          onChange={(next) => {
            setQ(next);
            setOffset(0);
          }}
        />
        <Segmented
          id="memberships-view"
          label="Which memberships"
          value={view}
          onChange={(next) => {
            setView(next);
            setOffset(0);
          }}
          options={[
            { value: "live", label: "Active" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      <Surface>
        {subs.isLoading ? (
          <Skeleton className="h-64" />
        ) : !subs.data?.items.length ? (
          <EmptyState
            icon={BadgeIndianRupee}
            title={view === "live" ? "No active memberships" : "No memberships yet"}
          />
        ) : (
          <>
            <Table minWidth={880}>
              <thead>
                <tr>
                  <Th>Member</Th>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                  <Th>Paid until</Th>
                  <Th>Renewal</Th>
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {subs.data.items.map((row) => (
                  <tr key={row.id}>
                    <Td>
                      <p className="font-semibold">{row.user_name}</p>
                      <p className="text-[12px] text-ink-muted">
                        {ROLE_LABEL[row.role] ?? row.role}
                        {row.user_phone && <span data-numeric> · {row.user_phone}</span>}
                      </p>
                    </Td>
                    <Td>
                      <span className="text-ink-muted">{row.plan_code}</span>
                      {row.is_comp && (
                        <StatusPill tone="sage" className="ml-2">
                          Free
                        </StatusPill>
                      )}
                    </Td>
                    <Td>
                      {row.is_live ? (
                        <StatusPill tone="good">Active</StatusPill>
                      ) : (
                        <StatusPill>{row.status}</StatusPill>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {row.current_end ? shortDate(row.current_end) : "—"}
                    </Td>
                    <Td className="text-ink-muted">
                      {!row.is_live ? "—" : row.cancelled_at || row.is_comp ? "Off" : "On"}
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        {row.is_live && (
                          <Button size="sm" variant="secondary" onClick={() => setEnding(row)}>
                            End now
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager offset={offset} total={subs.data.total} onChange={setOffset} />
          </>
        )}
      </Surface>

      {ending && <CancelDialog key={ending.id} row={ending} onClose={() => setEnding(null)} />}
    </AdminPage>
  );
}
