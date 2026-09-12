import { useEffect, useRef, useState, type DragEvent } from "react";
import { ImageUp, LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/kit/Button";
import { Monogram } from "@/components/Monogram";
import { useUploadPhoto, type HelperMe } from "@/features/helpers/queries";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Mirrors ALLOWED_PHOTO_TYPES and MAX_PHOTO_BYTES in backend/app/api/v1/helpers.py. */
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The upload half of background removal.
 *
 * The server does the work (rembg, in helpers.py) and keeps two files: the
 * original for the profile page, and the cutout for the card. Both are shown
 * side by side here, because someone choosing a photo needs to see what
 * families will see in both places.
 *
 * A failed cutout is never an error (DECISIONS.md 009): the card falls back to
 * a round crop of the original, and this says so in plain words.
 */
export function PhotoUpload({ helper }: { helper: HelperMe }) {
  const upload = useUploadPhoto();
  const input = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The preview is an object URL; hand the memory back when it is replaced.
  useEffect(() => {
    return () => {
      if (local) URL.revokeObjectURL(local);
    };
  }, [local]);

  function take(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) {
      setError("Use a JPEG, PNG or WebP photo.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That photo is over 8 MB. Try a smaller one.");
      return;
    }
    setError(null);
    setLocal(URL.createObjectURL(file));
    upload.mutate(file, {
      onError: (e) => setError(errorMessage(e, "The upload did not finish. Try again.")),
      onSettled: () => setLocal(null),
    });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files[0]);
  }

  const busy = upload.isPending;
  const hasPhoto = Boolean(helper.photo_url);
  const failed = !busy && hasPhoto && helper.cutout_status === "failed";
  const justCut = !busy && upload.data?.cutout_status === "done";

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-[15px] transition-shadow duration-200",
        dragging && "ring-2 ring-moss ring-offset-8 ring-offset-paper",
      )}
    >
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_190px]">
        <figure className="min-w-0">
          <CardPreview helper={helper} pending={local} />
          <figcaption className="mt-2 text-[13px] text-ink-muted">
            On your card, with the background removed
          </figcaption>
        </figure>

        <figure>
          <div className="relative aspect-[4/5] w-full max-w-[190px] overflow-hidden rounded-[15px] bg-oat">
            {local || helper.photo_url ? (
              <img
                src={local ?? helper.photo_url!}
                alt=""
                className={cn("size-full object-cover object-top", local && "opacity-70")}
              />
            ) : (
              <div className="grid size-full place-items-center">
                <Monogram name={helper.full_name || "?"} size={88} />
              </div>
            )}
          </div>
          <figcaption className="mt-2 text-[13px] text-ink-muted">
            On your profile page, as you took it
          </figcaption>
        </figure>
      </div>

      {busy && (
        <p
          role="status"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-oat px-3 py-1.5 text-[13px] text-ink"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Uploading and removing the background…
        </p>
      )}

      {justCut && (
        <p role="status" className="mt-5 inline-flex items-center gap-2 text-[13px] font-medium text-verified">
          <Sparkles className="size-4" aria-hidden />
          Background removed. Your card is updated.
        </p>
      )}

      {failed && (
        <div className="mt-5 rounded-[15px] bg-oat p-4 text-[14px] leading-relaxed text-ink-muted">
          <p className="font-semibold text-ink">We could not cut you out of this photo cleanly.</p>
          <p className="mt-1">
            {upload.data?.cutout_note ? `${upload.data.cutout_note} ` : ""}
            You are still listed: your card uses a round crop of the photo instead. For a
            cut-out, try a photo against a plain wall, in daylight, with your shoulders in
            the frame.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-5 text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          variant={hasPhoto ? "secondary" : "primary"}
          busy={busy}
          onClick={() => input.current?.click()}
        >
          {!busy && <ImageUp className="size-4" aria-hidden />}
          {hasPhoto ? "Replace photo" : "Upload a photo"}
        </Button>
        <p className="text-[13px] text-ink-faint">
          Or drop one here. JPEG, PNG or WebP, up to 8 MB.
        </p>
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPT.join(",")}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * The card's header, at the card's own measurements (docs/design.md 4.7): the
 * cutout breaks 34px above the header; a photo or monogram stays inside it.
 */
function CardPreview({ helper, pending }: { helper: HelperMe; pending: string | null }) {
  const cutout = helper.cutout_status === "done" ? helper.cutout_url : null;

  return (
    <div className="@container/card max-w-[393px] pt-[34px]">
      <div className="relative h-[111px] rounded-[15px] bg-moss pl-6 pt-[33px] @max-[340px]/card:pl-4">
        <p className="max-w-[52%] truncate font-display text-[19px] font-semibold leading-none text-on-moss @max-[393px]/card:max-w-[calc(100%-136px)] @max-[340px]/card:max-w-[calc(100%-120px)]">
          {helper.full_name || "Your name"}
        </p>
        <p className="mt-2 text-[12px] text-on-moss-muted">How families see you</p>

        {pending ? (
          <img
            src={pending}
            alt=""
            className="absolute bottom-3 right-[13px] size-[84px] rounded-full object-cover opacity-70 ring-2 ring-on-moss/25 @max-[340px]/card:right-[8px] @max-[340px]/card:size-[72px]"
          />
        ) : cutout ? (
          <img
            src={cutout}
            alt=""
            className="pointer-events-none absolute -top-[34px] right-[13px] size-[145px] object-cover object-top @max-[393px]/card:-top-[28px] @max-[393px]/card:right-[10px] @max-[393px]/card:size-[118px] @max-[340px]/card:-top-[24px] @max-[340px]/card:right-[8px] @max-[340px]/card:size-[104px]"
          />
        ) : helper.photo_url ? (
          <img
            src={helper.photo_url}
            alt=""
            className="absolute bottom-3 right-[13px] size-[84px] rounded-full object-cover ring-2 ring-on-moss/25 @max-[340px]/card:right-[8px] @max-[340px]/card:size-[72px]"
          />
        ) : (
          <Monogram
            name={helper.full_name || "?"}
            size={84}
            className="absolute bottom-3 right-[13px] ring-2 ring-on-moss/25"
          />
        )}
      </div>
    </div>
  );
}
