"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { redeemInviteAction } from "@/lib/actions/groups";

export function JoinGroup({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    redeemInviteAction(token).then((r) => {
      if (cancelled) return;
      if ("error" in r) setError(r.error);
      else router.replace(`/g/${r.groupId}`);
    });
    return () => {
      cancelled = true;
    };
  }, [token, router]);
  return <p className="text-body text-ink-2">{error ?? "Joining…"}</p>;
}
