"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useSignInSheet } from "@/components/auth/sign-in-sheet";
import { Button } from "@/components/ui/button";

/** "Get started" and "Sign in": the app's own sign-in sheet (`SignInSheetHost`), never Dynamic's modal (the touch-ups round). */
export function SignInButton({ label = "Get started", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" | "tertiary" }) {
  const { sdkHasLoaded } = useDynamicContext();
  const { open } = useSignInSheet();
  return (
    <Button variant={variant} size={variant === "tertiary" ? undefined : "primary"} disabled={!sdkHasLoaded} onClick={open} data-sign-in="">
      {label}
    </Button>
  );
}
