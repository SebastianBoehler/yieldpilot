import { NextResponse } from "next/server";
import { getExecutionLogs } from "@/server/services/strategy-service";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet") ?? undefined;
  const logs = await getExecutionLogs(wallet);
  return NextResponse.json(logs);
}
