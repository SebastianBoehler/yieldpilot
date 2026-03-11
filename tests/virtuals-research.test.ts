import { describe, expect, it } from "vitest";
import { runVirtualsResearchSynthesis } from "@/lib/adk/virtuals-research";

describe("virtuals research synthesis", () => {
  it("falls back to deterministic synthesis without ADK credentials", async () => {
    const result = await runVirtualsResearchSynthesis({
      input: {
        offeringKey: "generate_trade_signal",
        query: "ETH momentum",
      },
      facts: [
        "ETH spot demand is rising across the observed market pulse.",
        "Stablecoin inflows remain constructive.",
      ],
      risks: ["Signals remain advisory and should still pass policy checks."],
      context: {},
    });

    expect(result.signal).toBe("bullish");
    expect(result.supporting_facts).toHaveLength(2);
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
