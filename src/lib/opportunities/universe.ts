import { getAaveDiscoveryOpportunities } from "@/lib/protocols/aave-v3";
import { getKaminoLendOpportunities } from "@/lib/protocols/kamino";

const UNIVERSE_CACHE_TTL_MS = 30_000;
let cachedUniverse: { at: number; opportunities: Awaited<ReturnType<typeof getDisplayOpportunityUniverseUncached>> } | undefined;

async function getDisplayOpportunityUniverseUncached() {
  const [aaveOpportunities, kaminoOpportunities] = await Promise.all([
    getAaveDiscoveryOpportunities(),
    getKaminoLendOpportunities(),
  ]);

  return [...aaveOpportunities, ...kaminoOpportunities].sort((left, right) => right.apy - left.apy);
}

export async function getDisplayOpportunityUniverse() {
  if (cachedUniverse && Date.now() - cachedUniverse.at < UNIVERSE_CACHE_TTL_MS) {
    return cachedUniverse.opportunities;
  }

  const opportunities = await getDisplayOpportunityUniverseUncached();
  cachedUniverse = {
    at: Date.now(),
    opportunities,
  };

  return opportunities;
}
