import { describe, expect, it } from "vitest";
import { runTradingBrief } from "@/lib/adk/trading-brief";

describe("trading brief fallback", () => {
  it("produces a deterministic market brief without model credentials", async () => {
    const brief = await runTradingBrief({
      walletAddress: "0x1234",
      indexes: [
        {
          key: "stable-income",
          name: "Stable Income Index",
          projectedApy: 6.2,
          description: "Stable basket",
        },
        {
          key: "depin-market-leaders",
          name: "Top 10 DePIN Index",
          projectedApy: 1.1,
          description: "DePIN basket",
        },
      ],
      marketPulse: [
        { symbol: "ETH", change24h: 2.4, priceUsd: 2000 },
        { symbol: "SOL", change24h: 5.1, priceUsd: 140 },
        { symbol: "BTC", change24h: -0.4, priceUsd: 80000 },
      ],
      newsFeed: [{ source: "CoinDesk", title: "ETF demand stays firm" }],
    });

    expect(brief.marketRegime).toBe("risk-on");
    expect(brief.recommendedAction).toBe("deploy");
    expect(brief.focusAssets).toContain("SOL");
    expect(brief.focusIndexes).toContain("stable-income");
    expect(brief.summary.length).toBeGreaterThan(10);
  });
});
