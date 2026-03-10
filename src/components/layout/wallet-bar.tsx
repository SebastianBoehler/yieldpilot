"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCcw, Wallet } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { shortenAddress } from "@/lib/utils/format";

export function WalletBar({
  walletAddress,
}: {
  walletAddress?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showConnectors, setShowConnectors] = useState(false);
  const { address, isConnected, chain } = useAccount();
  const connect = useConnect();
  const disconnect = useDisconnect();

  const activeAddress = address ?? walletAddress;
  const availableConnectors = useMemo(
    () => connect.connectors.filter((connector, index, array) => array.findIndex((item) => item.id === connector.id) === index),
    [connect.connectors],
  );

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    const currentWallet = searchParams.get("wallet");

    if (address) {
      const normalized = address.toLowerCase();
      if (currentWallet === normalized) {
        return;
      }

      nextParams.set("wallet", normalized);
      startTransition(() => {
        router.replace(`?${nextParams.toString()}`);
      });
      return;
    }

    if (!currentWallet) {
      return;
    }

    nextParams.delete("wallet");
    startTransition(() => {
      router.replace(nextParams.size ? `?${nextParams.toString()}` : window.location.pathname);
    });
  }, [address, router, searchParams]);

  return (
    <Panel className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Active treasury</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="rounded-full bg-slate-950 p-2 text-white">
            <Wallet className="size-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-950">{shortenAddress(activeAddress)}</p>
            <p className="text-sm text-slate-600">
              {chain?.name ? `${chain.name} connected` : "Connect an EVM wallet such as Phantom, MetaMask, or WalletConnect."}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => router.refresh()}>
          <RefreshCcw className="mr-2 size-4" />
          Refresh
        </Button>
        {isConnected ? (
          <Button
            variant="ghost"
            onClick={() => {
              disconnect.disconnect();
              setShowConnectors(false);
            }}
          >
            Disconnect
          </Button>
        ) : null}
        <div className="relative">
          <Button onClick={() => setShowConnectors((current) => !current)}>
            {isConnected ? "Switch wallet" : "Connect wallet"}
            <ChevronDown className="ml-2 size-4" />
          </Button>
          {showConnectors ? (
            <div className="absolute right-0 z-20 mt-3 min-w-64 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_20px_40px_-16px_rgba(15,23,42,0.35)]">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Wallet providers</p>
              <div className="grid gap-2">
                {availableConnectors.map((connector) => (
                  <button
                    key={connector.uid}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={connect.isPending}
                    onClick={async () => {
                      await connect.connectAsync({ connector });
                      setShowConnectors(false);
                    }}
                    type="button"
                  >
                    {connector.name}
                  </button>
                ))}
                {!availableConnectors.length ? (
                  <p className="px-2 py-4 text-sm text-slate-500">No EVM wallet connector is available in this browser.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
