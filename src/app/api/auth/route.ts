import { NextResponse } from "next/server";
import { configured, supabase } from "@/lib/supabase";
export async function POST(request: Request) {
  if (!configured())
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  )
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  const db = await supabase();
  const { data, error } = await db.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });
  if (error)
    return NextResponse.json(
      { error: "Sign-in failed. Check your email and password." },
      { status: 401 },
    );
  const { data: allowed } = await db
    .from("app_authorization")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (data.user.id !== process.env.AUTHORIZED_USER_ID || !allowed) {
    await db.auth.signOut();
    return NextResponse.json(
      { error: "This account is not authorized for this workspace." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
export async function DELETE() {
  if (configured()) {
    const db = await supabase();
    await db.auth.signOut();
  }
  return NextResponse.json({ ok: true });
}
