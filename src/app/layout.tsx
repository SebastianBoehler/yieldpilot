import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { WalletProviders } from "@/components/providers/wallet-providers";
import "./globals.css";

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "YieldPilot",
  description: "Autonomous onchain agent with gas-aware execution, protocol adapters, and yield optimization as the first live strategy pack.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${monoFont.variable} antialiased`}>
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
