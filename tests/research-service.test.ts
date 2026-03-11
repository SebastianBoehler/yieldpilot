import { describe, expect, it } from "vitest";
import { parseDexScreenerPairs, parseExplorerTransfers, parseTrackedWhalesConfig } from "@/server/services/research-service";

describe("virtuals research service", () => {
  it("parses tracked whale config from env JSON", () => {
    const parsed = parseTrackedWhalesConfig(
      JSON.stringify([
        {
          label: "Base Treasury",
          walletAddress: "0x1111111111111111111111111111111111111111",
          chainKey: "base",
        },
      ]),
    );

    expect(parsed).toEqual([
      {
        label: "Base Treasury",
        walletAddress: "0x1111111111111111111111111111111111111111",
        chainKey: "base",
      },
    ]);
  });

  it("normalizes DexScreener search results into launch analyses", () => {
    const parsed = parseDexScreenerPairs({
      pairs: [
        {
          chainId: "base",
          dexId: "uniswap",
          pairAddress: "0x2222222222222222222222222222222222222222",
          pairCreatedAt: 1741680000000,
          priceUsd: "0.1234",
          priceChange: { h24: 12.4 },
          volume: { h24: 180000 },
          liquidity: { usd: 250000 },
          baseToken: {
            symbol: "ALPHA",
            address: "0x3333333333333333333333333333333333333333",
          },
        },
      ],
    });

    expect(parsed[0]).toMatchObject({
      chainKey: "base",
      dexId: "uniswap",
      label: "ALPHA",
      priceUsd: 0.1234,
      liquidityUsd: 250000,
      volume24hUsd: 180000,
      priceChange24hPct: 12.4,
    });
  });

  it("normalizes explorer token transfers into whale alerts", () => {
    const parsed = parseExplorerTransfers({
      payload: {
        result: [
          {
            from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            contractAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
            tokenSymbol: "USDC",
            tokenDecimal: "6",
            value: "250000000",
            hash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
            timeStamp: "1741680000",
          },
        ],
      },
      walletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      label: "Base Treasury",
      chainKey: "base",
      priceBySymbol: new Map([["USDC", 1]]),
    });

    expect(parsed).toEqual([
      expect.objectContaining({
        label: "Base Treasury",
        direction: "inflow",
        tokenSymbol: "USDC",
        amount: "250",
        amountUsd: 250,
      }),
    ]);
  });
});
