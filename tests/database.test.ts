import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("migration, CRUD, RLS, assignment guards, archive rules and cascading deletion", async () => {
  const db = new PGlite();
  const user = "11111111-1111-4111-8111-111111111111";
  const stranger = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users values('${user}'),('${stranger}');`,
    );
    await db.exec(
      await readFile("supabase/migrations/202611060001_initial.sql", "utf8"),
    );
    await db.exec(
      `insert into public.app_authorization(user_id) values('${user}');set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`,
    );
    const a = (
      await db.query<{ id: string }>(
        "insert into members(name) values('Alex') returning id",
      )
    ).rows[0].id;
    const b = (
      await db.query<{ id: string }>(
        "insert into members(name) values('Blair') returning id",
      )
    ).rows[0].id;
    const payload = {
      name: "Portal",
      client_name: "Client",
      description: "",
      technologies: ["TypeScript"],
      lead_id: a,
      member_ids: [a],
      start_date: "2026-01-01",
      due_date: "2026-02-01",
      status: "Planned",
      priority: "Medium",
      notes: "",
    };
    const p = (
      await db.query<{ id: string }>(
        "select save_project($1::jsonb,null) as id",
        [JSON.stringify(payload)],
      )
    ).rows[0].id;
    const m = (
      await db.query<{ id: string }>(
        "insert into modules(project_id,name,assigned_member_id) values($1,$2,$3) returning id",
        [p, "Core", a],
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(
        "insert into submodules(module_id,name,assigned_member_id) values($1,$2,$3)",
        [m, "Invalid", b],
      ),
      /must belong/,
    );
    const s = (
      await db.query<{ id: string }>(
        "insert into submodules(module_id,name,assigned_member_id) values($1,$2,$3) returning id",
        [m, "Login", a],
      )
    ).rows[0].id;
    await db.query(
      "update submodules set notes='Saved persistently' where id=$1",
      [s],
    );
    assert.equal(
      (
        await db.query<{ notes: string }>(
          "select notes from submodules where id=$1",
          [s],
        )
      ).rows[0].notes,
      "Saved persistently",
    );
    await assert.rejects(
      db.query(
        "update modules set start_date='2026-02-01',due_date='2026-01-01' where id=$1",
        [m],
      ),
      /check constraint/,
    );
    await assert.rejects(
      db.query("delete from project_memberships where project_id=$1", [p]),
      /Resolve/,
    );
    await db.query("update members set archived=true where id=$1", [a]);
    await assert.rejects(
      db.query(
        "insert into modules(project_id,name,assigned_member_id) values($1,$2,$3)",
        [p, "Archived assignment", a],
      ),
      /Archived/,
    );
    // Historical assignments can still be edited after archiving a member.
    await db.query("update submodules set status='Completed' where id=$1", [s]);
    await db.query("select save_project($1::jsonb,$2)", [
      JSON.stringify({ ...payload, lead_id: null, member_ids: [] }),
      p,
    ]);
    assert.equal(
      (
        await db.query(
          "select * from project_memberships where project_id=$1",
          [p],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("update submodules set status='In Progress' where id=$1", [s]),
      /must belong/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${stranger}',false);`,
    );
    for (const table of [
      "projects",
      "members",
      "project_memberships",
      "modules",
      "submodules",
      "app_authorization",
    ])
      assert.equal(
        (await db.query(`select * from ${table}`)).rows.length,
        0,
        `${table} must be hidden from an unauthorized user`,
      );
    await assert.rejects(
      db.query("insert into members(name) values('Intruder')"),
      /row-level security/,
    );
    await assert.rejects(
      db.query("insert into app_authorization(user_id) values($1)", [stranger]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select save_project($1::jsonb,null)", [
        JSON.stringify(payload),
      ]),
      /Unauthorized/,
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from projects"),
      /permission denied/,
    );
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`,
    );
    await db.query("delete from projects where id=$1", [p]);
    assert.equal((await db.query("select * from modules")).rows.length, 0);
    assert.equal((await db.query("select * from submodules")).rows.length, 0);
    assert.equal((await db.query("select * from members")).rows.length, 2);
  } finally {
    await db.close();
  }
});
