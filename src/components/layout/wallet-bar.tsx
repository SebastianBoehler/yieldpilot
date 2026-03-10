"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCcw, Wallet } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useSolanaWallet } from "@/components/providers/solana-wallet-provider";
import { shortenAddress } from "@/lib/utils/format";
import type { ConnectedWalletType } from "@/types/domain";

export function WalletBar({
  walletAddress,
  walletType,
}: {
  walletAddress?: string;
  walletType?: ConnectedWalletType;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showConnectors, setShowConnectors] = useState(false);
  const { address, isConnected, chain } = useAccount();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const solanaWallet = useSolanaWallet();

  const activeWalletType = walletType ?? "evm";
  const activeAddress =
    activeWalletType === "solana"
      ? solanaWallet.address ?? walletAddress
      : address ?? walletAddress;
  const availableConnectors = useMemo(
    () => connect.connectors.filter((connector, index, array) => array.findIndex((item) => item.id === connector.id) === index),
    [connect.connectors],
  );

  useEffect(() => {
    const currentWallet = searchParams.get("wallet");
    const currentWalletType = searchParams.get("walletType");
    const evmAddress = address?.toLowerCase();
    const solanaAddress = solanaWallet.address;
    const selectedWalletType =
      currentWalletType === "solana"
        ? "solana"
        : currentWalletType === "evm"
          ? "evm"
          : activeWalletType;

    const replaceWalletParams = (nextAddress?: string, nextType?: ConnectedWalletType) => {
      const nextParams = new URLSearchParams(searchParams.toString());

      if (!nextAddress || !nextType) {
        if (!currentWallet && !currentWalletType) {
          return;
        }

        nextParams.delete("wallet");
        nextParams.delete("walletType");
        startTransition(() => {
          router.replace(nextParams.size ? `${pathname}?${nextParams.toString()}` : pathname);
        });
        return;
      }

      if (currentWallet === nextAddress && currentWalletType === nextType) {
        return;
      }

      nextParams.set("wallet", nextAddress);
      nextParams.set("walletType", nextType);
      startTransition(() => {
        router.replace(`${pathname}?${nextParams.toString()}`);
      });
    };

    if (selectedWalletType === "solana") {
      if (solanaAddress) {
        replaceWalletParams(solanaAddress, "solana");
        return;
      }

      if (evmAddress) {
        replaceWalletParams(evmAddress, "evm");
        return;
      }

      replaceWalletParams();
      return;
    }

    if (evmAddress) {
      replaceWalletParams(evmAddress, "evm");
      return;
    }

    if (solanaAddress) {
      replaceWalletParams(solanaAddress, "solana");
      return;
    }

    replaceWalletParams();
  }, [activeWalletType, address, pathname, router, searchParams, solanaWallet.address]);

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
              {activeWalletType === "solana"
                ? solanaWallet.isConnected
                  ? "Phantom Solana connected."
                  : "Connect Phantom Solana for Solana wallet visibility."
                : chain?.name
                  ? `${chain.name} connected`
                  : "Connect an EVM wallet such as Phantom, MetaMask, or WalletConnect."}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => router.refresh()}>
          <RefreshCcw className="mr-2 size-4" />
          Refresh
        </Button>
        {activeWalletType === "evm" && isConnected ? (
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
        {activeWalletType === "solana" && solanaWallet.isConnected ? (
          <Button
            variant="ghost"
            onClick={async () => {
              await solanaWallet.disconnect();
              setShowConnectors(false);
            }}
          >
            Disconnect
          </Button>
        ) : null}
        <div className="relative">
          <Button onClick={() => setShowConnectors((current) => !current)}>
            {activeAddress ? "Switch wallet" : "Connect wallet"}
            <ChevronDown className="ml-2 size-4" />
          </Button>
          {showConnectors ? (
            <div className="absolute right-0 z-20 mt-3 min-w-64 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_20px_40px_-16px_rgba(15,23,42,0.35)]">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">EVM wallets</p>
              <div className="grid gap-2">
                {availableConnectors.map((connector) => (
                  <button
                    key={connector.uid}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={connect.isPending}
                    onClick={async () => {
                      const result = await connect.connectAsync({ connector });
                      const nextParams = new URLSearchParams(searchParams.toString());
                      const nextAddress = result.accounts[0];
                      if (nextAddress) {
                        nextParams.set("wallet", nextAddress.toLowerCase());
                      }
                      nextParams.set("walletType", "evm");
                      startTransition(() => {
                        router.replace(`?${nextParams.toString()}`);
                      });
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
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Solana wallets</p>
                <button
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!solanaWallet.isPhantomInstalled || solanaWallet.isConnecting}
                  onClick={async () => {
                    const nextAddress = await solanaWallet.connect();
                    const nextParams = new URLSearchParams(searchParams.toString());
                    nextParams.set("wallet", nextAddress);
                    nextParams.set("walletType", "solana");
                    startTransition(() => {
                      router.replace(`?${nextParams.toString()}`);
                    });
                    setShowConnectors(false);
                  }}
                  type="button"
                >
                  {solanaWallet.isPhantomInstalled ? "Phantom (Solana)" : "Phantom (Solana not detected)"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
