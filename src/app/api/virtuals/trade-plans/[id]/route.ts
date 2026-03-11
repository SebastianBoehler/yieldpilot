import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const { id } = await context.params;
  const plan = await prisma.tradePlanRecord.findUnique({
    where: { id },
  });

  if (!plan) {
    return NextResponse.json({ error: "Trade plan not found." }, { status: 404 });
  }

  return NextResponse.json(plan);
}
