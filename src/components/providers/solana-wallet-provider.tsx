"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type PhantomPublicKey = {
  toString(): string;
};

type PhantomSolanaProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PhantomPublicKey | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PhantomPublicKey }>;
  disconnect: () => Promise<void>;
  on?: (event: "connect" | "disconnect" | "accountChanged", listener: (publicKey?: PhantomPublicKey | null) => void) => void;
  removeListener?: (event: "connect" | "disconnect" | "accountChanged", listener: (publicKey?: PhantomPublicKey | null) => void) => void;
};

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomSolanaProvider;
    };
    solana?: PhantomSolanaProvider;
  }
}

type SolanaWalletContextValue = {
  address?: string;
  isConnected: boolean;
  isConnecting: boolean;
  isPhantomInstalled: boolean;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
};

const SolanaWalletContext = createContext<SolanaWalletContextValue | null>(null);

function getProvider(): PhantomSolanaProvider | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.phantom?.solana ?? window.solana;
}

export function SolanaWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [address, setAddress] = useState<string>();
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const provider = getProvider();
    if (!provider) {
      return;
    }
    let cancelled = false;

    const handleConnect = (publicKey?: PhantomPublicKey | null) => {
      const nextAddress = publicKey?.toString() ?? provider.publicKey?.toString();
      setAddress(nextAddress);
    };

    const handleDisconnect = () => {
      setAddress(undefined);
    };

    const handleAccountChanged = (publicKey?: PhantomPublicKey | null) => {
      setAddress(publicKey?.toString() ?? undefined);
    };

    if (provider.isConnected && provider.publicKey) {
      setAddress(provider.publicKey.toString());
    }

    void provider
      .connect({ onlyIfTrusted: true })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setAddress(response.publicKey.toString());
      })
      .catch(() => {
        if (!cancelled) {
          setAddress(provider.publicKey?.toString());
        }
      });

    provider.on?.("connect", handleConnect);
    provider.on?.("disconnect", handleDisconnect);
    provider.on?.("accountChanged", handleAccountChanged);

    return () => {
      cancelled = true;
      provider.removeListener?.("connect", handleConnect);
      provider.removeListener?.("disconnect", handleDisconnect);
      provider.removeListener?.("accountChanged", handleAccountChanged);
    };
  }, []);

  const value = useMemo<SolanaWalletContextValue>(() => ({
    address,
    isConnected: Boolean(address),
    isConnecting,
    isPhantomInstalled: Boolean(getProvider()?.isPhantom),
    connect: async () => {
      const provider = getProvider();
      if (!provider) {
        throw new Error("Phantom Solana wallet is not available in this browser.");
      }

      setIsConnecting(true);
      try {
        const response = await provider.connect();
        const nextAddress = response.publicKey.toString();
        setAddress(nextAddress);
        return nextAddress;
      } finally {
        setIsConnecting(false);
      }
    },
    disconnect: async () => {
      const provider = getProvider();
      if (!provider) {
        setAddress(undefined);
        return;
      }

      await provider.disconnect();
      setAddress(undefined);
    },
  }), [address, isConnecting]);

  return (
    <SolanaWalletContext.Provider value={value}>
      {children}
    </SolanaWalletContext.Provider>
  );
}

export function useSolanaWallet() {
  const context = useContext(SolanaWalletContext);
  if (!context) {
    throw new Error("useSolanaWallet must be used within SolanaWalletProvider.");
  }

  return context;
}
