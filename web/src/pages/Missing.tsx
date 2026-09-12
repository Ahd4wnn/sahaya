import { Compass } from "lucide-react";

import { ButtonLink } from "@/components/kit/Button";
import { EmptyState, PageShell, Surface } from "@/components/kit/Surface";

export function Missing() {
  return (
    <PageShell
      title="Page not found"
      subtitle="The link may be old, or the page may have moved."
      width="narrow"
    >
      <Surface>
        <EmptyState
          icon={Compass}
          title="Nothing lives at this address"
          body="Browsing helpers is always free, and the front page is one tap away."
          action={<ButtonLink to="/">Back to the front page</ButtonLink>}
        />
      </Surface>
    </PageShell>
  );
}
