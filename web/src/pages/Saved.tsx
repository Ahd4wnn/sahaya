import { Heart } from "lucide-react";

import { HelperCard, HelperCardSkeleton } from "@/components/HelperCard";
import { ButtonLink } from "@/components/kit/Button";
import { EmptyState, PageShell, Surface } from "@/components/kit/Surface";
import { useAuth } from "@/features/auth/AuthContext";
import { useFavoriteIds, useFavorites, useToggleFavorite } from "@/features/me/queries";

/** Liked profiles: the same cards as the front page, on the same paper panel. */
export function Saved() {
  const { user } = useAuth();
  const favorites = useFavorites(Boolean(user));
  const ids = useFavoriteIds(Boolean(user));
  const toggle = useToggleFavorite();

  return (
    <PageShell
      title="Liked profiles"
      subtitle="Helpers you saved. Tap the heart on any card to add or remove one."
      width="wide"
    >
      <Surface className="sm:px-9 sm:py-9">
        {favorites.isLoading ? (
          <div className="grid grid-cols-1 gap-x-8 gap-y-[50px] pt-9 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <HelperCardSkeleton key={i} />
            ))}
          </div>
        ) : !favorites.data?.length ? (
          <EmptyState
            icon={Heart}
            title="No liked profiles yet"
            body="Tap the heart on a helper's card to keep them here while you decide."
            action={<ButtonLink to="/">Browse helpers</ButtonLink>}
          />
        ) : (
          // pt-9 leaves room for the cut-out portraits, which break 34px above
          // each card's top edge.
          <div className="grid grid-cols-1 gap-x-8 gap-y-[50px] pt-9 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
            {favorites.data.map((helper) => {
              const saved = ids.data?.has(helper.id) ?? true;
              return (
                <HelperCard
                  key={helper.id}
                  helper={helper}
                  saved={saved}
                  onToggleSave={() => toggle.mutate({ id: helper.id, saved })}
                />
              );
            })}
          </div>
        )}
      </Surface>
    </PageShell>
  );
}
