import { prisma } from "@/lib/db/prisma";
import { startVirtualsAcpRuntime } from "@/lib/virtuals/acp-runtime";

async function shutdown(signal: string) {
  console.log(`[virtuals] Received ${signal}. Disconnecting Prisma and stopping ACP runtime.`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await startVirtualsAcpRuntime();
await new Promise(() => undefined);
