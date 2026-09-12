import { useRef, useState } from "react";
import { FileUp } from "lucide-react";

import { Button } from "@/components/kit/Button";
import { SectionHeading, StatusPill, type PillTone } from "@/components/kit/Surface";
import {
  useMyDocuments,
  useUploadDocument,
  type DocumentKind,
  type VerificationDocument,
} from "@/features/account/queries";
import type { HelperMe } from "@/features/helpers/queries";
import { errorMessage } from "@/lib/api";
import { shortDate } from "@/lib/time";

/** Mirrors the limits in backend/app/api/v1/documents.py. */
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

const KINDS: { kind: DocumentKind; title: string; body: string; badge?: "id" | "police" }[] = [
  {
    kind: "id_proof",
    title: "Government photo ID",
    body: "Aadhaar, voter ID, driving licence or passport. Earns the ID verified badge.",
    badge: "id",
  },
  {
    kind: "police_verification",
    title: "Police clearance certificate",
    body: "From your local police station or the Kerala Police portal. Earns the police verified badge.",
    badge: "police",
  },
  {
    kind: "address_proof",
    title: "Address proof",
    body: "Optional. A utility bill or ration card.",
  },
];

function describe(
  doc: VerificationDocument | undefined,
  badge: HelperMe["id_verification_status"] | null,
): { label: string; tone: PillTone } | null {
  if (badge === "verified") return { label: "Verified", tone: "good" };
  if (!doc) return null;
  if (doc.status === "pending") return { label: "Being checked", tone: "warn" };
  if (doc.status === "rejected") return { label: "Not accepted", tone: "bad" };
  return { label: "Accepted", tone: "good" };
}

function DocumentRow({
  title,
  body,
  doc,
  status,
  busy,
  error,
  onFile,
}: {
  title: string;
  body: string;
  doc: VerificationDocument | undefined;
  status: { label: string; tone: PillTone } | null;
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <li className="rounded-[15px] bg-oat p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
            {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{body}</p>
          {doc && (
            <p className="mt-1 text-[12px] text-ink-faint">Uploaded {shortDate(doc.created_at)}</p>
          )}
          {doc?.status === "rejected" && doc.review_note && (
            <p className="mt-2 rounded-[10px] bg-paper px-3 py-2 text-[13px] text-ink">
              {doc.review_note}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          busy={busy}
          className="self-start"
          onClick={() => input.current?.click()}
        >
          {!busy && <FileUp className="size-4" aria-hidden />}
          {doc ? "Upload again" : "Upload"}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </li>
  );
}

export function DocumentsSection({ helper }: { helper: HelperMe }) {
  const docs = useMyDocuments(true);
  const upload = useUploadDocument();
  const [uploading, setUploading] = useState<DocumentKind | null>(null);
  const [error, setError] = useState<{ kind: DocumentKind; text: string } | null>(null);

  function latest(kind: DocumentKind) {
    return docs.data
      ?.filter((doc) => doc.kind === kind)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  }

  function send(kind: DocumentKind, file: File) {
    if (file.size > MAX_BYTES) {
      setError({ kind, text: "That file is over 10 MB. Try a smaller photo or PDF." });
      return;
    }
    setError(null);
    setUploading(kind);
    upload.mutate(
      { kind, file },
      {
        onError: (e) => setError({ kind, text: errorMessage(e, "The upload did not finish.") }),
        onSettled: () => setUploading(null),
      },
    );
  }

  return (
    <>
      <SectionHeading
        title="Verification"
        description="Verified badges help families choose. Documents are private: only the Sahaya team can open them, and every view is logged."
      />
      <ul className="mt-5 space-y-3">
        {KINDS.map((item) => {
          const doc = latest(item.kind);
          const badge =
            item.badge === "id"
              ? helper.id_verification_status
              : item.badge === "police"
                ? helper.police_verification_status
                : null;
          return (
            <DocumentRow
              key={item.kind}
              title={item.title}
              body={item.body}
              doc={doc}
              status={describe(doc, badge)}
              busy={uploading === item.kind}
              error={error?.kind === item.kind ? error.text : null}
              onFile={(file) => send(item.kind, file)}
            />
          );
        })}
      </ul>
    </>
  );
}
