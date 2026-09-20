"use client";

import { useState } from "react";
import { Avatar } from "@/components/ledger/avatar";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ButtonLink } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { Hue } from "@/lib/ui/hue";

/**
 * Account actions live behind the avatar (docs/design.md 4.7): the primary screen of a social product should not
 * end in a way to leave it. Not drawn in the canvas; derived as the app's one sheet with the fewest things in it.
 */
export function AccountMenu({ name, hue, href }: { name: string; hue: Hue; href: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="You and your account" aria-haspopup="dialog" onClick={() => setOpen(true)} className="inline-flex h-12 w-12 items-center justify-center rounded-pill">
        <Avatar name={name} hue={hue} size={28} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="account-title">
        <div className="flex items-center gap-3">
          <Avatar name={name} hue={hue} size={44} />
          <h2 id="account-title" className="text-card-question text-ink">
            {name}
          </h2>
        </div>
        <div className="flex flex-col gap-1">
          <ButtonLink href={href} variant="secondary" data-autofocus>
            Everything with your name on it
          </ButtonLink>
          <SignOutButton />
        </div>
      </Sheet>
    </>
  );
}
