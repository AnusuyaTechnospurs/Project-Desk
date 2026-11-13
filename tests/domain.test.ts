import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAssign,
  derivedStatus,
  outsideSchedule,
  progress,
  projectSchema,
  taskSchema,
  validDateOrder,
  workItems,
  type Task,
} from "../src/lib/domain";
const task = (
  id: string,
  status: Task["status"] = "Not Started",
  module_id?: string,
): Task => ({
  id,
  name: id,
  status,
  module_id,
  description: "",
  notes: "",
  priority: "Medium",
  assigned_member_id: null,
  start_date: null,
  due_date: null,
});
test("progress replaces parent modules with their leaf work items", () => {
  const modules = [task("a", "Completed"), task("b", "Completed")];
  const sub = [task("b1", "Completed", "b"), task("b2", "In Progress", "b")];
  assert.equal(progress(modules, sub), 67);
  assert.equal(workItems(modules, sub).length, 3);
  assert.equal(progress([], []), 0);
  assert.equal(progress([task("a")], []), 0);
  assert.equal(progress([task("a", "Completed")], []), 100);
});
test("parent status follows children rather than stored status", () => {
  const m = task("m", "Completed");
  assert.equal(
    derivedStatus(m, [task("c", "Not Started", "m")]),
    "Not Started",
  );
  assert.equal(derivedStatus(m, [task("c", "Blocked", "m")]), "Blocked");
  assert.equal(
    derivedStatus(m, [
      task("a", "Completed", "m"),
      task("b", "Not Started", "m"),
    ]),
    "In Progress",
  );
  assert.equal(derivedStatus(m, [task("c", "Completed", "m")]), "Completed");
});
test("date order permits missing and equal dates and rejects reversed dates", () => {
  assert.equal(validDateOrder(null, "2026-01-01"), true);
  assert.equal(validDateOrder("2026-01-01", "2026-01-01"), true);
  assert.equal(validDateOrder("2026-02-01", "2026-01-01"), false);
  assert.equal(
    taskSchema.safeParse({
      ...task("a"),
      start_date: "2026-02-01",
      due_date: "2026-01-01",
    }).success,
    false,
  );
  assert.equal(
    taskSchema.safeParse({ ...task("a"), due_date: "2026-02-30" }).success,
    false,
  );
});
test("schedule warnings check both bounds including a single entered date", () => {
  assert.equal(outsideSchedule("2026-01-01", null, "2026-02-01", null), true);
  assert.equal(outsideSchedule(null, "2026-04-01", null, "2026-03-01"), true);
  assert.equal(outsideSchedule("2026-04-01", null, null, "2026-03-01"), true);
  assert.equal(outsideSchedule(null, "2026-01-01", "2026-02-01", null), true);
  assert.equal(
    outsideSchedule("2026-02-01", "2026-03-01", "2026-02-01", "2026-03-01"),
    false,
  );
});
test("assignment is optional and otherwise limited to project members", () => {
  assert.equal(canAssign(null, []), true);
  assert.equal(canAssign("a", ["a", "b"]), true);
  assert.equal(canAssign("c", ["a", "b"]), false);
});
test("project validation rejects invalid status and empty names", () => {
  const base = {
    name: "Project",
    client_name: "",
    description: "",
    technologies: [],
    lead_id: null,
    member_ids: [],
    start_date: null,
    due_date: null,
    status: "Planned",
    priority: "Medium",
    notes: "",
  };
  assert.equal(projectSchema.safeParse(base).success, true);
  assert.equal(
    projectSchema.safeParse({ ...base, status: "Unknown" }).success,
    false,
  );
  assert.equal(projectSchema.safeParse({ ...base, name: "  " }).success, false);
});
