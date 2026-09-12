import { useState } from "react";
import { ImageOff, RefreshCw } from "lucide-react";

import { Button, ButtonLink } from "@/components/kit/Button";
import { EmptyState, Skeleton, Surface } from "@/components/kit/Surface";
import { useCutoutQueue, useRecutout, type AdminHelperRow } from "@/features/admin/queries";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AdminPage } from "./AdminLayout";

interface Result {
  key: number;
  name: string;
  ok: boolean;
  note: string;
}

/**
 * The failed-cutout queue promised by DECISIONS.md 009. These helpers are
 * listed already -- with a round crop on their card -- so nothing here is
 * urgent; it is where a human looks at what rembg could not do.
 */
export function AdminPhotos() {
  const queue = useCutoutQueue();
  const recutout = useRecutout();
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  function run(helper: AdminHelperRow) {
    setRunning(helper.id);
    const record = (ok: boolean, note: string) =>
      setResults((previous) =>
        [{ key: Date.now(), name: helper.full_name, ok, note }, ...previous].slice(0, 5),
      );
    recutout.mutate(helper.id, {
      onSuccess: (result) => record(result.ok, result.ok ? "" : result.note),
      onError: (e) => record(false, errorMessage(e, "The request failed.")),
      onSettled: () => setRunning(null),
    });
  }

  return (
    <AdminPage
      title="Photos"
      subtitle="Photos where the background could not be removed cleanly. These helpers are still listed, with a round crop on their card. Try again, or ask the helper for a photo against a plain wall."
    >
      {results.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {results.map((result) => (
            <li
              key={result.key}
              role="status"
              className={cn(
                "rounded-[12px] px-4 py-2.5 text-[14px]",
                result.ok ? "bg-verified/10 text-verified" : "bg-danger/10 text-danger",
              )}
            >
              <span className="font-semibold">{result.name}:</span>{" "}
              {result.ok
                ? "cut out cleanly. Their card is updated."
                : `still no clean cutout${result.note ? ` (${result.note})` : ""}.`}
            </li>
          ))}
        </ul>
      )}

      <Surface>
        {queue.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : !queue.data?.length ? (
          <EmptyState
            icon={ImageOff}
            title="Every cutout worked"
            body="When a photo cannot be cut out cleanly, it shows up here."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {queue.data.map((helper) => (
              <li key={helper.id} className="flex gap-4 rounded-[15px] bg-oat p-4">
                {helper.photo_url ? (
                  <img
                    src={helper.photo_url}
                    alt={`Photo uploaded by ${helper.full_name}`}
                    className="size-20 shrink-0 rounded-[12px] object-cover object-top sm:size-24"
                  />
                ) : (
                  <div className="grid size-20 shrink-0 place-items-center rounded-[12px] bg-paper sm:size-24">
                    <ImageOff className="size-6 text-ink-faint" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-semibold text-ink">
                    {helper.full_name}
                  </p>
                  <p className="truncate text-[13px] text-ink-muted">
                    {[helper.service_name, helper.district_name].filter(Boolean).join(" · ") ||
                      "No service yet"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      busy={running === helper.id}
                      disabled={Boolean(running) && running !== helper.id}
                      onClick={() => run(helper)}
                    >
                      {running !== helper.id && <RefreshCw className="size-4" aria-hidden />}
                      Try again
                    </Button>
                    {helper.is_listed && !helper.admin_hidden && (
                      <ButtonLink
                        to={`/helpers/${helper.id}`}
                        size="sm"
                        variant="ghost"
                        className="hover:bg-paper"
                      >
                        Profile
                      </ButtonLink>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </AdminPage>
  );
}
