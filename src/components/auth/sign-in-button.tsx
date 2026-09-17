"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";

export function SignInButton({ label = "Get started" }: { label?: string }) {
  const { setShowAuthFlow, sdkHasLoaded } = useDynamicContext();
  return (
    <Button size="primary" disabled={!sdkHasLoaded} onClick={() => setShowAuthFlow(true)}>
      {label}
    </Button>
  );
}
