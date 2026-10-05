"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ErrorCard } from "@/components/ledger/error-card";
import { Screen, TopBar } from "@/components/ledger/screen";
import { report } from "@/lib/usage/client";
import { screenOf } from "@/lib/usage/events";

/**
 * A screen that failed to render (docs/design.md 5.1, 5.4): the error card in the screen's place, with the back
 * control so the person is never stranded. Try again asks the server for the screen again and re-renders it (the
 * framework's `retry`; `reset` alone re-rendered what had already failed). The failure goes to the console and
 * Next's own reporting by its digest, and is counted as an error card on its screen's shape (the first-contact
 * round: an "Add another" that failed on a phone left no trace); none of its words reach the screen.
 */
export default function ScreenError({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    console.error("screen failed", { digest: error.digest, message: error.message });
    report("error_shown", { cause: "screen", screen: screenOf(pathname ?? "/") });
  }, [error, pathname]);
  return (
    <Screen>
      <TopBar back />
      <div className="flex flex-col gap-4 py-4" data-screen-error="">
        <ErrorCard
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            (retry ?? reset)();
          }}
        />
      </div>
    </Screen>
  );
}
