import { useState } from "react";

import { Monogram } from "@/components/Monogram";
import { cn } from "@/lib/utils";

/**
 * A person in a circle: their original photo, or their initials.
 *
 * Always the original photo, never the cutout. A cut-out portrait squeezed
 * into a small circle loses the shoulders that make it read as a person, and
 * the transparent corners show the ground through. The cutout belongs to the
 * card header and nowhere else (docs/design-lessons.md section 4).
 */
export function Avatar({
  name,
  photoUrl,
  size = 40,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className={cn("shrink-0 rounded-full bg-oat object-cover object-top", className)}
      />
    );
  }
  return <Monogram name={name} size={size} className={className} />;
}
