import { NextResponse } from "next/server";
import { authorized } from "@/lib/supabase";
import { memberSchema, projectSchema, taskSchema } from "@/lib/domain";
import { z } from "zod";
export async function GET() {
  const db = await authorized();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const names = [
    "projects",
    "members",
    "project_memberships",
    "modules",
    "submodules",
  ] as const;
  const results = await Promise.all(
    names.map(async (n) => {
      const rows: Record<string, unknown>[] = [];
      // Supabase caps individual responses. Fetch all pages so dashboard counts
      // and nested progress do not silently drop work after the first 1,000 rows.
      const size = 500;
      for (let offset = 0; ; offset += size) {
        let query = db
          .from(n)
          .select("*")
          .order("created_at", { ascending: false });
        query =
          n === "project_memberships"
            ? query.order("project_id").order("member_id")
            : query.order("id");
        const { data, error } = await query.range(offset, offset + size - 1);
        if (error) return { data: null, error };
        rows.push(...data);
        if (data.length < size) return { data: rows, error: null };
      }
    }),
  );
  const failure = results.find((r) => r.error);
  if (failure)
    return NextResponse.json(
      { error: failure.error!.message },
      { status: 500 },
    );
  return NextResponse.json(
    Object.fromEntries(
      results.map((r, i) => [i === 2 ? "memberships" : names[i], r.data]),
    ),
    { headers: { "Cache-Control": "no-store" } },
  );
}
const envelope = z.object({
  entity: z.enum(["projects", "members", "modules", "submodules"]),
  action: z.enum(["save", "archive", "delete", "notes"]),
  id: z.uuid().optional(),
  parentId: z.uuid().optional(),
  values: z.unknown().optional(),
  archived: z.boolean().optional(),
});
export async function POST(request: Request) {
  const db = await authorized();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = envelope.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { entity, action, id, parentId, values, archived } = parsed.data;
  if (action !== "save" && !id)
    return NextResponse.json({ error: "Record ID required" }, { status: 400 });
  if (action === "notes") {
    const parsedNotes = z
      .object({ notes: z.string().trim().max(10000) })
      .safeParse(values);
    if (!parsedNotes.success)
      return NextResponse.json(
        { error: "Status notes must be at most 10,000 characters." },
        { status: 400 },
      );
    const { data, error } = await db
      .from(entity)
      .update(parsedNotes.data)
      .eq("id", id!)
      .select("id")
      .maybeSingle();
    return NextResponse.json(
      error
        ? { error: error.message }
        : !data
          ? { error: "Record not found" }
          : { ok: true },
      { status: error ? 400 : !data ? 404 : 200 },
    );
  }
  if (action === "delete") {
    if (entity === "members")
      return NextResponse.json(
        { error: "Archive member records to preserve history." },
        { status: 400 },
      );
    const { data, error } = await db
      .from(entity)
      .delete()
      .eq("id", id!)
      .select("id");
    return NextResponse.json(
      error
        ? { error: error.message }
        : !data?.length
          ? { error: "Record not found" }
          : { ok: true },
      { status: error ? 400 : !data?.length ? 404 : 200 },
    );
  }
  if (action === "archive") {
    if (entity !== "projects" && entity !== "members")
      return NextResponse.json(
        { error: "Invalid archive operation" },
        { status: 400 },
      );
    const { data, error } = await db
      .from(entity)
      .update({ archived: archived ?? true })
      .eq("id", id!)
      .select("id");
    return NextResponse.json(
      error
        ? { error: error.message }
        : !data?.length
          ? { error: "Record not found" }
          : { ok: true },
      { status: error ? 400 : !data?.length ? 404 : 200 },
    );
  }
  const schema =
    entity === "projects"
      ? projectSchema
      : entity === "members"
        ? memberSchema
        : taskSchema;
  const fields = schema.safeParse(values);
  if (!fields.success)
    return NextResponse.json(
      { error: fields.error.issues.map((e) => e.message).join("; ") },
      { status: 400 },
    );
  if (entity === "projects") {
    const { data, error } = await db.rpc("save_project", {
      payload: fields.data,
      project_id: id ?? null,
    });
    return NextResponse.json(
      error ? { error: error.message } : { ok: true, id: data },
      { status: error ? 400 : 200 },
    );
  }
  if (!id && entity !== "members" && !parentId)
    return NextResponse.json({ error: "Parent ID required" }, { status: 400 });
  const payload: Record<string, unknown> = {
    ...fields.data,
    ...(!id && entity === "modules" ? { project_id: parentId } : {}),
    ...(!id && entity === "submodules" ? { module_id: parentId } : {}),
  };
  const query = id
    ? db.from(entity).update(payload).eq("id", id)
    : db.from(entity).insert(payload);
  const { data, error } = await query.select("id").single();
  return NextResponse.json(
    error ? { error: error.message } : { ok: true, id: data.id },
    { status: error ? 400 : 200 },
  );
}
