"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";

export function SignInButton({ label = "Get started", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" | "tertiary" }) {
  const { setShowAuthFlow, sdkHasLoaded } = useDynamicContext();
  return (
    <Button variant={variant} size={variant === "tertiary" ? undefined : "primary"} disabled={!sdkHasLoaded} onClick={() => setShowAuthFlow(true)}>
      {label}
    </Button>
  );
}
