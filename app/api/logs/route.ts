import { NextRequest, NextResponse } from "next/server";
import { readLogLines, listLogDates } from "@/lib/logger";

// GET /api/logs?date=2026-04-17&lines=200
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const date = searchParams.get("date") || undefined;
  const maxLines = Math.min(500, Math.max(1, parseInt(searchParams.get("lines") || "200", 10)));

  const dates = listLogDates();
  const lines = readLogLines(date, maxLines);

  return NextResponse.json({ dates, lines, currentDate: date || dates[0] || "" });
}
