import { NextResponse } from "next/server";
import { getApprovalQueue } from "@/server/services/approval-service";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet") ?? undefined;
  const approvals = await getApprovalQueue(wallet);
  return NextResponse.json(approvals);
}
