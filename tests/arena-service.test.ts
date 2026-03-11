import { describe, expect, it } from "vitest";
import { parseMarketPulseResponse, parseRssFeed } from "@/server/services/arena-service";

describe("arena service parsers", () => {
  it("normalizes market pulse payloads from the external price API", () => {
    const parsed = parseMarketPulseResponse([
      {
        symbol: "eth",
        name: "Ethereum",
        current_price: 2450.12,
        price_change_percentage_24h_in_currency: 3.42,
        market_cap: 1000000,
      },
    ]);

    expect(parsed).toEqual([
      {
        symbol: "ETH",
        name: "Ethereum",
        priceUsd: 2450.12,
        change24h: 3.42,
        marketCapUsd: 1000000,
        source: "CoinGecko",
      },
    ]);
  });

  it("extracts a compact research feed from RSS xml", () => {
    const parsed = parseRssFeed(
      `
        <rss>
          <channel>
            <item>
              <title><![CDATA[ETF flows pick up again]]></title>
              <link>https://example.com/etf-flows</link>
              <description><![CDATA[Institutions added risk this week.]]></description>
              <pubDate>Wed, 11 Mar 2026 08:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>
      `,
      "Test Feed",
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      source: "Test Feed",
      title: "ETF flows pick up again",
      url: "https://example.com/etf-flows",
      summary: "Institutions added risk this week.",
      publishedAt: "2026-03-11T08:00:00.000Z",
    });
  });
});
