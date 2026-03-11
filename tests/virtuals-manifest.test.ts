import { describe, expect, it } from "vitest";
import { buildVirtualsManifest } from "@/lib/virtuals/manifest";

describe("virtuals manifest", () => {
  it("builds two ACP provider manifests with absolute resource URLs", () => {
    const manifest = buildVirtualsManifest("https://yieldpilot.example");

    expect(manifest.map((agent) => agent.key)).toEqual(["yieldpilot-research", "yieldpilot-trade-planner"]);
    expect(manifest[0].resources[0]?.path).toMatch(/^https:\/\/yieldpilot\.example\/api\/virtuals\/resources\//);
    expect(manifest[1].offerings.map((offering) => offering.key)).toEqual([
      "build_spot_swap_plan",
      "build_rebalance_plan",
    ]);
  });
});
