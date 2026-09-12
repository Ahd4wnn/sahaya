import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Field, Segmented, TextArea } from "@/components/kit/Form";
import {
  EmptyState,
  Skeleton,
  StatusPill,
  Surface,
  type PillTone,
} from "@/components/kit/Surface";
import {
  useAdminDocuments,
  useDocumentDecision,
  type AdminDocument,
} from "@/features/admin/queries";
import { apiBlobUrl, errorMessage } from "@/lib/api";
import { longDate, shortDate } from "@/lib/time";
import { AdminPage } from "./AdminLayout";
import { DOCUMENT_KIND } from "./labels";
import { Table, Td, Th } from "./table";

type View = AdminDocument["status"];

const STATUS: Record<View, { label: string; tone: PillTone }> = {
  pending: { label: "Waiting", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
};

/**
 * One document, open. The file is private -- it is fetched with the admin's
 * token and shown as a blob: URL, which is revoked when the dialog closes.
 * Opening it writes an audit row (DECISIONS.md 019).
 */
function DocumentReview({ doc, onClose }: { doc: AdminDocument; onClose: () => void }) {
  const decide = useDocumentDecision();
  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState(doc.review_note);
  const [error, setError] = useState<string | null>(null);
  const label = DOCUMENT_KIND[doc.kind] ?? doc.kind;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    apiBlobUrl(`/admin/documents/${doc.id}/file`).then(
      (blobUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        objectUrl = blobUrl;
        setUrl(blobUrl);
      },
      (e: unknown) => {
        if (!cancelled) setLoadError(errorMessage(e, "The file could not be opened."));
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id]);

  function decideAs(decision: "approve" | "reject") {
    if (decision === "reject" && !note.trim()) {
      setError("Say why it was not accepted. The helper sees this note.");
      return;
    }
    setError(null);
    decide.mutate(
      { id: doc.id, decision, note: note.trim() },
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
      size="lg"
      title={`${label} · ${doc.user_name}`}
      description={`Uploaded ${longDate(doc.created_at)}${doc.user_phone ? ` · ${doc.user_phone}` : ""}. Opening this is recorded in the audit log.`}
      footer={
        doc.status === "pending" ? (
          <>
            <Button variant="danger" disabled={decide.isPending} onClick={() => decideAs("reject")}>
              Reject
            </Button>
            <Button busy={decide.isPending} onClick={() => decideAs("approve")}>
              Approve
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="overflow-hidden rounded-[15px] bg-oat">
        {loadError ? (
          <p className="p-6 text-[14px] text-danger">{loadError}</p>
        ) : !url ? (
          <Skeleton className="h-[50dvh] rounded-none" />
        ) : doc.content_type === "application/pdf" ? (
          <iframe title={`${label} uploaded by ${doc.user_name}`} src={url} className="h-[60dvh] w-full" />
        ) : (
          <img
            src={url}
            alt={`${label} uploaded by ${doc.user_name}`}
            className="max-h-[60dvh] w-full object-contain"
          />
        )}
      </div>

      {doc.status === "pending" ? (
        <Field
          className="mt-4"
          label="Note to the helper"
          htmlFor="doc-note"
          hint="Required when rejecting. The helper sees it."
          error={error}
        >
          <TextArea
            id="doc-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      ) : (
        doc.review_note && (
          <p className="mt-4 text-[14px] text-ink-muted">
            <span className="font-semibold text-ink">Note:</span> {doc.review_note}
          </p>
        )
      )}
    </Dialog>
  );
}

export function AdminVerification() {
  const [view, setView] = useState<View>("pending");
  const docs = useAdminDocuments(view);
  const [open, setOpen] = useState<AdminDocument | null>(null);

  return (
    <AdminPage
      title="Verification"
      subtitle="Check each document against the name on the account. Approving an ID or a police certificate turns that badge on for the helper's card."
    >
      <Segmented
        id="docs-view"
        label="Which documents"
        value={view}
        onChange={setView}
        options={[
          { value: "pending", label: "Waiting" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Rejected" },
        ]}
      />

      <Surface className="mt-5">
        {docs.isLoading ? (
          <Skeleton className="h-48" />
        ) : !docs.data?.length ? (
          <EmptyState
            icon={BadgeCheck}
            title={view === "pending" ? "Nothing waiting" : "Nothing here"}
            body={view === "pending" ? "New uploads appear here as helpers send them." : undefined}
          />
        ) : (
          <Table minWidth={680}>
            <thead>
              <tr>
                <Th>Document</Th>
                <Th>Person</Th>
                <Th>Uploaded</Th>
                <Th>Status</Th>
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {docs.data.map((doc) => (
                <tr key={doc.id}>
                  <Td className="font-semibold">{DOCUMENT_KIND[doc.kind] ?? doc.kind}</Td>
                  <Td>
                    <p>{doc.user_name}</p>
                    {doc.user_phone && (
                      <p data-numeric className="text-[12px] text-ink-muted">
                        {doc.user_phone}
                      </p>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">{shortDate(doc.created_at)}</Td>
                  <Td>
                    <StatusPill tone={STATUS[doc.status].tone}>{STATUS[doc.status].label}</StatusPill>
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant={doc.status === "pending" ? "primary" : "secondary"} onClick={() => setOpen(doc)}>
                      {doc.status === "pending" ? "Review" : "Open"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Surface>

      {open && <DocumentReview key={open.id} doc={open} onClose={() => setOpen(null)} />}
    </AdminPage>
  );
}
