"use client";

import { useEffect, useState } from "react";
import { ErrorCard } from "@/components/ledger/error-card";
import { Screen, TopBar } from "@/components/ledger/screen";

/**
 * A screen that failed to render (docs/design.md 5.1, 5.4): the error card in the screen's place, with the back
 * control so the person is never stranded, and Try again re-rendering the segment. The failure itself goes to the
 * console and Next's own reporting by its digest; none of its words reach the screen.
 */
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    console.error("screen failed", { digest: error.digest, message: error.message });
  }, [error]);
  return (
    <Screen>
      <TopBar back />
      <div className="flex flex-col gap-4 py-4" data-screen-error="">
        <ErrorCard
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            reset();
          }}
        />
      </div>
    </Screen>
  );
}
