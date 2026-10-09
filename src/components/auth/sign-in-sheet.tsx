"use client";

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { AccountStep } from "@/components/auth/account-step";
import { Sheet } from "@/components/ui/sheet";

const SignIn = createContext<{ open: () => void; isOpen: boolean }>({ open: () => undefined, isOpen: false });

/**
 * Signing in, in the app's own sheet (the touch-ups round, section 5): one sheet at the root, opened by every "Sign
 * in" and "Get started" and by the line that asks this phone to sign in, holding the step a link's join flow keeps an
 * entry with (`AccountStep`: Google, then an email or a phone number, and Dynamic's own code), instead of Dynamic's
 * modal. The login's bootstrap takes it from the code, as it does from the join flow, and the sheet steps aside once
 * the SDK holds the login.
 */
export function SignInSheetHost({ children }: { children: ReactNode }) {
  const { user } = useDynamicContext();
  const [isOpen, setOpen] = useState(false);
  const titleId = useId();
  // Signed in: the bootstrap has the screen from here (state from what the SDK says, in render).
  const [seenUser, setSeenUser] = useState(user);
  if (user !== seenUser) {
    setSeenUser(user);
    if (user && isOpen) setOpen(false);
  }
  const value = useMemo(() => ({ open: () => setOpen(true), isOpen }), [isOpen]);
  return (
    <SignIn.Provider value={value}>
      {children}
      <Sheet open={isOpen} onClose={() => setOpen(false)} labelledBy={titleId}>
        {isOpen ? <AccountStep mode="sign-in" titleId={titleId} closeWord="Not now" onClose={() => setOpen(false)} /> : null}
      </Sheet>
    </SignIn.Provider>
  );
}

export function useSignInSheet(): { open: () => void; isOpen: boolean } {
  return useContext(SignIn);
}
