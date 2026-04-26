/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

declare global {
  var socketIOServer: any;
}

export const GET = async (req: NextRequest) => {
  return NextResponse.json({ message: "socket.io server running" });
};

export async function POST(req: NextRequest) {
  return NextResponse.json({ message: "POST not supported" });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
