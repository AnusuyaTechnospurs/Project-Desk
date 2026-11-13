import { z } from "zod";
export const projectStatuses = [
  "Planned",
  "In Progress",
  "On Hold",
  "Completed",
] as const;
export const taskStatuses = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Completed",
] as const;
export const priorities = ["Low", "Medium", "High"] as const;
export const availabilities = [
  "Available",
  "Partially Available",
  "Unavailable",
] as const;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date")
  .nullable();
const text = z.string().trim().max(10000).default("");
const name = z.string().trim().min(1, "Name is required").max(200);
const id = z.uuid();
const dates = { start_date: date, due_date: date };
export function validDateOrder(start?: string | null, end?: string | null) {
  return !start || !end || end >= start;
}
export function outsideSchedule(
  start: string | null,
  end: string | null,
  parentStart: string | null,
  parentEnd: string | null,
) {
  return Boolean(
    (parentStart &&
      ((start && start < parentStart) || (end && end < parentStart))) ||
    (parentEnd && ((end && end > parentEnd) || (start && start > parentEnd))),
  );
}
export function canAssign(member: string | null, members: string[]) {
  return member === null || members.includes(member);
}
export const projectSchema = z
  .object({
    name,
    client_name: text,
    description: text,
    technologies: z.array(z.string().max(100)).max(100),
    lead_id: id.nullable(),
    member_ids: z.array(id),
    ...dates,
    status: z.enum(projectStatuses),
    priority: z.enum(priorities),
    notes: text,
  })
  .refine((v) => validDateOrder(v.start_date, v.due_date), {
    message: "Target date must be on or after start date",
    path: ["due_date"],
  });
export const memberSchema = z.object({
  name,
  email: z.union([z.email(), z.literal("")]),
  role: text,
  skills: z.array(z.string().max(100)).max(100),
  availability: z.enum(availabilities),
  notes: text,
});
export const taskSchema = z
  .object({
    name,
    description: text,
    assigned_member_id: id.nullable(),
    status: z.enum(taskStatuses),
    priority: z.enum(priorities),
    ...dates,
    notes: text,
  })
  .refine((v) => validDateOrder(v.start_date, v.due_date), {
    message: "Due date must be on or after start date",
    path: ["due_date"],
  });
export type Project = Omit<z.infer<typeof projectSchema>, "member_ids"> & {
  id: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};
export type Member = z.infer<typeof memberSchema> & {
  id: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};
export type Task = z.infer<typeof taskSchema> & {
  id: string;
  project_id?: string;
  module_id?: string;
};
export type Membership = { project_id: string; member_id: string };
export type Data = {
  projects: Project[];
  members: Member[];
  memberships: Membership[];
  modules: Task[];
  submodules: Task[];
};
export function workItems(modules: Task[], submodules: Task[]) {
  return modules.flatMap((m) => {
    const children = submodules.filter((s) => s.module_id === m.id);
    return children.length ? children : [m];
  });
}
export function progress(modules: Task[], submodules: Task[]) {
  const items = workItems(modules, submodules);
  return items.length
    ? Math.round(
        (items.filter((t) => t.status === "Completed").length / items.length) *
          100,
      )
    : 0;
}
export function derivedStatus(module: Task, submodules: Task[]) {
  const children = submodules.filter((s) => s.module_id === module.id);
  if (!children.length) return module.status;
  return children.every((s) => s.status === "Completed")
    ? "Completed"
    : children.some((s) => s.status === "Blocked")
      ? "Blocked"
      : children.every((s) => s.status === "Not Started")
        ? "Not Started"
        : "In Progress";
}
