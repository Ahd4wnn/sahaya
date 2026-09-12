import { useState } from "react";
import { IdCard } from "lucide-react";

import { RatingStars } from "@/components/RatingStars";
import { Avatar } from "@/components/kit/Avatar";
import { Button, ButtonLink } from "@/components/kit/Button";
import { ConfirmDialog } from "@/components/kit/Dialog";
import { Field, Segmented, TextArea } from "@/components/kit/Form";
import {
  EmptyState,
  Skeleton,
  StatusPill,
  Surface,
  type PillTone,
} from "@/components/kit/Surface";
import {
  useAdminHelpers,
  useModerateHelper,
  type AdminHelperRow,
} from "@/features/admin/queries";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { AdminPage } from "./AdminLayout";
import { Pager, SearchBox, Table, Td, Th } from "./table";

type View = "all" | "visible" | "hidden";

const CHECK: Record<AdminHelperRow["id_verification_status"], { label: string; tone: PillTone } | null> = {
  verified: { label: "Verified", tone: "good" },
  pending: { label: "Pending", tone: "warn" },
  rejected: { label: "Rejected", tone: "bad" },
  none: null,
};

function Check({ status }: { status: AdminHelperRow["id_verification_status"] }) {
  const check = CHECK[status];
  return check ? (
    <StatusPill tone={check.tone}>{check.label}</StatusPill>
  ) : (
    <span className="text-ink-faint">—</span>
  );
}

function listingState(helper: AdminHelperRow): { label: string; tone: PillTone } {
  if (helper.admin_hidden) return { label: "Hidden", tone: "bad" };
  if (helper.is_listed) return { label: "Live", tone: "good" };
  return { label: "Not listed", tone: "neutral" };
}

/**
 * Hiding uses its own `admin_hidden` flag, never `is_listed`: payment webhooks
 * rewrite `is_listed` on every renewal, which would silently undo an admin's
 * decision (DECISIONS.md 019).
 */
function ModerateDialog({ helper, onClose }: { helper: AdminHelperRow; onClose: () => void }) {
  const moderate = useModerateHelper();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hiding = !helper.admin_hidden;

  function confirm() {
    if (hiding && !note.trim()) {
      setError("Add a reason. The helper is told, and it goes in the audit log.");
      return;
    }
    setError(null);
    moderate.mutate(
      { id: helper.id, hidden: hiding, note: note.trim() },
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
      busy={moderate.isPending}
      danger={hiding}
      title={hiding ? `Hide ${helper.full_name}'s card?` : `Show ${helper.full_name}'s card again?`}
      description={
        hiding
          ? "The card leaves search and the profile page stops loading. They are notified. Their account and membership are not affected."
          : "The card returns to search while their membership is active."
      }
      confirmLabel={hiding ? "Hide card" : "Show card"}
    >
      <Field label={hiding ? "Reason" : "Note (optional)"} htmlFor="moderate-note" error={error}>
        <TextArea id="moderate-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}

export function AdminListings() {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [view, setView] = useState<View>("all");
  const [offset, setOffset] = useState(0);
  const helpers = useAdminHelpers({
    q: query || undefined,
    hidden: view === "all" ? undefined : view === "hidden",
    offset,
  });
  const [moderating, setModerating] = useState<AdminHelperRow | null>(null);

  return (
    <AdminPage title="Listings" subtitle="Every helper card, and whether families can see it.">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          value={q}
          label="Search helpers"
          onChange={(next) => {
            setQ(next);
            setOffset(0);
          }}
        />
        <Segmented
          id="listings-view"
          label="Which listings"
          value={view}
          onChange={(next) => {
            setView(next);
            setOffset(0);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "visible", label: "Not hidden" },
            { value: "hidden", label: "Hidden" },
          ]}
        />
      </div>

      <Surface>
        {helpers.isLoading ? (
          <Skeleton className="h-64" />
        ) : !helpers.data?.items.length ? (
          <EmptyState icon={IdCard} title="No listings match" body="Try a different search or filter." />
        ) : (
          <>
            <Table minWidth={980}>
              <thead>
                <tr>
                  <Th>Helper</Th>
                  <Th>Service</Th>
                  <Th>District</Th>
                  <Th>ID</Th>
                  <Th>Police</Th>
                  <Th>Rating</Th>
                  <Th>Card</Th>
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {helpers.data.items.map((helper) => {
                  const state = listingState(helper);
                  return (
                    <tr key={helper.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={helper.full_name} photoUrl={helper.photo_url} size={36} />
                          <div className="min-w-0">
                            <p className="font-semibold">{helper.full_name}</p>
                            <p data-numeric className="text-[12px] text-ink-muted">
                              {helper.phone ?? "—"}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="text-ink-muted">{helper.service_name ?? "—"}</Td>
                      <Td className="text-ink-muted">{helper.district_name ?? "—"}</Td>
                      <Td>
                        <Check status={helper.id_verification_status} />
                      </Td>
                      <Td>
                        <Check status={helper.police_verification_status} />
                      </Td>
                      <Td>
                        <RatingStars avg={helper.rating_avg} count={helper.rating_count} size={12} />
                      </Td>
                      <Td>
                        <StatusPill tone={state.tone}>{state.label}</StatusPill>
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-2">
                          {helper.is_listed && !helper.admin_hidden && (
                            <ButtonLink
                              to={`/helpers/${helper.id}`}
                              size="sm"
                              variant="ghost"
                              className="hover:bg-oat"
                            >
                              View
                            </ButtonLink>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => setModerating(helper)}>
                            {helper.admin_hidden ? "Show" : "Hide"}
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pager offset={offset} total={helpers.data.total} onChange={setOffset} />
          </>
        )}
      </Surface>

      {moderating && (
        <ModerateDialog key={moderating.id} helper={moderating} onClose={() => setModerating(null)} />
      )}
    </AdminPage>
  );
}
