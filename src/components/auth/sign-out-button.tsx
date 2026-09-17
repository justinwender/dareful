"use client";

import { useRouter } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const { handleLogOut } = useDynamicContext();
  return (
    <Button
      variant="tertiary"
      onClick={async () => {
        await fetch("/api/session", { method: "DELETE" });
        await handleLogOut();
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
