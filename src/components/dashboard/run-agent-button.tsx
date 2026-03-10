"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useState } from "react";
import { Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConnectedWalletType } from "@/types/domain";

export function RunAgentButton({
  walletAddress,
  walletType = "evm",
}: {
  walletAddress?: string;
  walletType?: ConnectedWalletType;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  useSearchParams();

  async function runLoop() {
    setPending(true);
    try {
      await fetch("/api/agent/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
        }),
      });

      startTransition(() => {
        router.refresh();
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={runLoop} disabled={pending || !walletAddress || walletType !== "evm"}>
      <Cpu className="mr-2 size-4" />
      {walletType !== "evm" ? "EVM loop only" : pending ? "Running loop..." : "Run agent loop"}
    </Button>
  );
}
