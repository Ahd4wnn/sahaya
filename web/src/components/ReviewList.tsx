import { Monogram } from "@/components/Monogram";
import { RatingStars } from "@/components/RatingStars";
import type { Review } from "@/features/hires/queries";
import { shortDate } from "@/lib/time";

/** Reviews, newest first as the API returns them. Signed "Anu V." -- the
 *  backend never sends a full surname. */
export function ReviewList({ reviews, empty }: { reviews: Review[]; empty: string }) {
  if (!reviews.length) {
    return <p className="text-[14px] leading-relaxed text-ink-muted">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-line-soft">
      {reviews.map((review) => (
        <li key={review.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
          <Monogram name={review.rater_name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-display text-[15px] font-semibold text-ink">
                {review.rater_name}
              </p>
              <RatingStars avg={review.rating} count={1} showValue={false} size={13} />
              <p className="text-[12px] text-ink-faint">{shortDate(review.created_at)}</p>
            </div>
            {review.comment && (
              <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-ink-muted">
                {review.comment}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
