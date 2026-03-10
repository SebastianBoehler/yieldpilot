import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { runAgentCycle } from "@/server/services/agent-service";

let batchRunning = false;

async function runBatch() {
  if (batchRunning) {
    console.warn("[worker] Previous cycle is still running. Skipping overlapping tick.");
    return;
  }

  batchRunning = true;

  try {
    const users = await prisma.user.findMany({
      where: {
        strategies: {
          some: {
            emergencyPause: false,
          },
        },
      },
      select: {
        walletAddress: true,
      },
    });

    if (!users.length) {
      console.log("[worker] No active strategies found.");
      return;
    }

    for (const user of users) {
      console.log(`[worker] Running YieldPilot agent loop for ${user.walletAddress}`);

      try {
        const result = await runAgentCycle(user.walletAddress as `0x${string}`);
        console.log(`[worker] ${user.walletAddress}: ${result.runStatus} / ${result.decisionStatus} / ${result.summary}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[worker] ${user.walletAddress}: ${message}`);
      }
    }
  } finally {
    batchRunning = false;
  }
}

async function shutdown(signal: string) {
  console.log(`[worker] Received ${signal}. Disconnecting Prisma and stopping.`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.log(`[worker] Starting YieldPilot worker. Interval: ${env.AGENT_LOOP_INTERVAL_MINUTES} minutes.`);
await runBatch();
setInterval(() => {
  void runBatch();
}, env.AGENT_LOOP_INTERVAL_MINUTES * 60_000);
