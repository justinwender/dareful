"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addGhostToGroupAction } from "@/lib/actions/claims";

type PickedContact = { name?: string[]; tel?: string[] };
type ContactsManager = { select(props: Array<"name" | "tel">, opts?: { multiple?: boolean }): Promise<PickedContact[]> };
function contactPicker(): ContactsManager | null {
  if (typeof navigator === "undefined") return null;
  const c = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  return c && typeof c.select === "function" ? c : null;
}

/**
 * Adds someone to the group before they exist ("Gabe" is in the poker group before Gabe has the app), so
 * everything later in this group just has them. Picked from contacts where the browser can, typed elsewhere.
 * Someone who already has an account is never seated by somebody else: they join by the group's link.
 */
export function AddGhost({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add(person: { name: string; phone?: string }) {
    setNote(null);
    start(async () => {
      const r = await addGhostToGroupAction(groupId, person);
      if ("error" in r) {
        setNote(r.error);
        return;
      }
      setName("");
      setNote("Done. If they’re already on Dareful, send them the group’s link and they can join themselves.");
      router.refresh();
    });
  }

  async function pick() {
    const picker = contactPicker();
    if (!picker) return;
    try {
      const [c] = await picker.select(["name", "tel"], { multiple: false });
      if (!c) return;
      const first = (c.name?.[0] ?? "").trim().split(/\s+/)[0] ?? "";
      if (first) add({ name: first.slice(0, 40), phone: c.tel?.[0] });
    } catch {
      // The sheet was closed without picking anyone.
    }
  }

  if (!open) {
    return (
      <div>
        <Button variant="tertiary" onClick={() => setOpen(true)}>
          Add someone who isn’t here yet
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      {contactPicker() ? (
        <div>
          <Button variant="secondary" size="inline" onClick={pick} disabled={pending}>
            Pick from contacts
          </Button>
        </div>
      ) : null}
      <label className="text-label text-ink-3" htmlFor="ghost-name">
        {contactPicker() ? "Or type a first name" : "Their first name"}
      </label>
      <input
        id="ghost-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="Gabe"
        autoComplete="off"
        className="h-12 rounded-tile border border-line bg-ground px-3 text-body text-ink"
      />
      <div className="flex gap-2">
        <Button variant="primary" size="inline" onClick={() => add({ name: name.trim() })} loading={pending} disabled={!name.trim()}>
          Add them
        </Button>
        <Button variant="tertiary" onClick={() => setOpen(false)} disabled={pending}>
          Never mind
        </Button>
      </div>
      {note ? (
        <p role="alert" className="border-l-2 border-marigold pl-3 text-body-sm text-ink">
          {note}
        </p>
      ) : null}
    </div>
  );
}
