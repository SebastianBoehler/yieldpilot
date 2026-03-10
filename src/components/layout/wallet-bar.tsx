"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { RefreshCcw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { shortenAddress } from "@/lib/utils/format";

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function WalletBar({
  walletAddress,
}: {
  walletAddress?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [address, setAddress] = useState(walletAddress);

  useEffect(() => {
    setAddress(walletAddress);
  }, [walletAddress]);

  async function connect() {
    if (!window.ethereum) {
      return;
    }

    setPending(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      const nextAddress = accounts[0];
      if (!nextAddress) {
        return;
      }

      setAddress(nextAddress);
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("wallet", nextAddress.toLowerCase());
      startTransition(() => {
        router.replace(`?${nextParams.toString()}`);
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Active treasury</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="rounded-full bg-slate-950 p-2 text-white">
            <Wallet className="size-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-950">{shortenAddress(address)}</p>
            <p className="text-sm text-slate-600">Browser wallet for human mode, backend signer for autonomous mode.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => router.refresh()}>
          <RefreshCcw className="mr-2 size-4" />
          Refresh
        </Button>
        <Button onClick={connect} disabled={pending}>
          {address ? "Switch wallet" : "Connect wallet"}
        </Button>
      </div>
    </Panel>
  );
}
