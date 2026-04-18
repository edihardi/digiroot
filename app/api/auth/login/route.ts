import { NextResponse } from "next/server";
import { checkPassword, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json();

  if (!password || !checkPassword(password)) {
    return NextResponse.json({ error: "Password salah" }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}
