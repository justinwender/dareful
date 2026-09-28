"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ChainEnum, useWalletDelegation } from "@dynamic-labs/sdk-react-core";
import { useDevice } from "@/components/auth/device";
import { FIELD_PROBLEM_CLASS, Problem, ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { passThePhoneStatusAction, turnOffPassThePhoneAction, turnOnPassThePhoneAction } from "@/lib/actions/pass-the-phone";
import { hueVar, type Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;
/** How long the row waits for the delegation to land through the webhook before it stops asking. */
const SETUP_WAIT_MS = 15_000;

/**
 * Pass the phone, the row on You (docs/design.md 3.45; 3.34 and 3.41 amended 2026-09-28): in the Account
 * card where One tap was drawn, `body` 600 over a `caption`, with the 48 by 28 switch where the chevron would
 * be. Turning it on is one flow, only from the person's own phone: a sheet with what it allows (getting into
 * a market from a friend's phone, with your PIN), what it never allows (saying what happened, voting,
 * settling, calling it even), that it can be turned off any time, and the PIN typed twice; the chalk delegates
 * the ledger wallet through the SDK's own call and sets the PIN. Turning it off revokes the delegation, wipes
 * the stored material and clears the PIN, at once and asking nothing. A device without the login shows the
 * switch as it is and says where to turn it on. The switch always says what is true.
 */
export function PassThePhoneRow({ status, hue }: { status: { on: boolean; delegated: boolean; pinSet: boolean }; hue: Hue }) {
  const router = useRouter();
  const { state, me } = useDevice();
  const { delegateKeyShares, revokeDelegation, getWalletsDelegatedStatus } = useWalletDelegation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState<"on" | "off" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pinProblem, setPinProblem] = useState<string | null>(null);
  const ownPhone = state === "ready";
  const on = status.on;

  function ledgerRef() {
    if (!me) return null;
    const entry = getWalletsDelegatedStatus().find((w) => w.address.toLowerCase() === me.ledgerWallet.toLowerCase());
    return entry ? { chainName: entry.chain as ChainEnum, accountAddress: entry.address } : { chainName: ChainEnum.Evm, accountAddress: me.ledgerWallet };
  }

  async function turnOn() {
    setProblem(null);
    setPinProblem(null);
    if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return setPinProblem(`A PIN is ${PIN_LENGTH} digits.`);
    if (again !== pin) return setPinProblem("The two don’t match.");
    const ledger = ledgerRef();
    if (!ledger) return setProblem("This phone hasn’t checked it’s you yet.");
    setBusy("on");
    try {
      // The delegation first (the SDK's own call, no screen of Dynamic's), then the PIN; the share lands through the webhook.
      if (!status.delegated) await delegateKeyShares([ledger]);
      const r = await turnOnPassThePhoneAction(pin);
      if ("error" in r) return setProblem(r.error);
      const deadline = Date.now() + SETUP_WAIT_MS;
      while (Date.now() < deadline) {
        const s = await passThePhoneStatusAction();
        if (s.on) break;
        await new Promise((res) => setTimeout(res, 1000));
      }
      setOpen(false);
      setPin("");
      setAgain("");
      router.refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function turnOff() {
    setProblem(null);
    setBusy("off");
    try {
      await turnOffPassThePhoneAction();
      const ledger = ledgerRef();
      if (ledger && ownPhone) await revokeDelegation([ledger]).catch(() => undefined);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const caption = on ? "On. Get into a market from a friend’s phone, with your PIN. Voting always asks." : ownPhone ? "Get into a market from a friend’s phone, with your PIN. Voting always asks." : "Turn it on from the phone you signed in on.";
  return (
    <>
      <div className="flex min-h-14 w-full items-center gap-3 border-t border-line px-4 py-3 first:border-t-0" data-account-row="pass">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-strong text-ink">Pass the phone</span>
          <span className="text-caption text-ink-3">{caption}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Pass the phone"
          aria-busy={busy !== null || undefined}
          disabled={busy !== null || (!on && !ownPhone)}
          onClick={() => (on ? void turnOff() : setOpen(true))}
          data-pass-switch={on ? "on" : "off"}
          className={cn("relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-[120ms] disabled:opacity-60", on ? "" : "bg-surface-2 outline outline-1 outline-line-strong")}
          style={on ? { background: hueVar(hue) } : undefined}
        >
          <span aria-hidden="true" className={cn("absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-pill transition-[left] duration-[120ms]", on ? "left-[26px] bg-ground" : "left-[4px] bg-ink-3")} />
        </button>
      </div>
      <Sheet open={open} onClose={() => (busy ? undefined : setOpen(false))} labelledBy={`${id}-title`}>
        <h2 id={`${id}-title`} className="text-body-strong text-ink">
          Pass the phone
        </h2>
        <div className="flex flex-col gap-4" data-pass-consent="">
          <div className="flex items-start gap-3">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-[2px] shrink-0 text-ink-2">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l2.5 2.5L16 9.5" />
            </svg>
            <span className="flex flex-col">
              <span className="text-label text-ink-2">It allows</span>
              <span className="text-body-sm text-ink">Getting into a market from a friend’s phone, with your PIN.</span>
            </span>
          </div>
          <div className="flex items-start gap-3">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-[2px] shrink-0 text-ink-2">
              <circle cx="12" cy="12" r="9" strokeDasharray="4 3" />
            </svg>
            <span className="flex flex-col">
              <span className="text-label text-ink-2">It never allows</span>
              <span className="text-body-sm text-ink">Saying what happened, voting, settling, or calling it even.</span>
            </span>
          </div>
          <p className="text-caption text-ink-3">Turn it off any time, here.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-2">Your PIN</span>
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="new-password" maxLength={PIN_LENGTH} aria-invalid={pinProblem ? true : undefined} aria-describedby={pinProblem ? `${id}-pin-problem` : undefined} className={cn("h-12 rounded-button border border-line bg-surface px-4 text-body text-ink", pinProblem && FIELD_PROBLEM_CLASS)} data-pin="" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label text-ink-2">Again</span>
              <input value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="new-password" maxLength={PIN_LENGTH} className={cn("h-12 rounded-button border border-line bg-surface px-4 text-body text-ink", pinProblem && FIELD_PROBLEM_CLASS)} data-pin-again="" />
            </label>
          </div>
          <Problem id={`${id}-pin-problem`} message={pinProblem} />
          <ProblemSummary messages={[problem]} />
          <Button variant="primary" onClick={() => void turnOn()} loading={busy === "on"} disabled={pin.length !== PIN_LENGTH || again.length !== PIN_LENGTH} data-pass-turn-on="">
            Turn it on
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy !== null}>
            Not now
          </Button>
        </div>
      </Sheet>
    </>
  );
}
