"use client";

import { useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import {
  App,
  Button,
  Checkbox,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Input,
  Pagination,
  Select,
  Tag,
} from "antd";
import {
  CaretDownOutlined,
  CaretRightOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import {
  derivedStatus,
  outsideSchedule,
  projectStatuses,
  taskStatuses,
  type Data,
  type Project,
  type Task,
} from "@/lib/domain";
import type { Editor } from "./record-form";

type Entity = "projects" | "modules" | "submodules";
type QuickValues = { name: string; lead?: string; date?: dayjs.Dayjs | null };
type Props = {
  data: Data;
  onSave: (body: unknown) => Promise<boolean>;
  onEdit: (editor: Editor) => void;
  onDelete: (entity: Entity, id: string) => void;
  onArchive: (project: Project) => void;
};
const phaseLabel = (value: string) =>
  value === "In Progress"
    ? "Kicked off"
    : value === "Not Started"
      ? "Not started"
      : value;
const phaseTone = (value: string) =>
  value === "In Progress" || value === "Completed"
    ? "green"
    : value === "Blocked"
      ? "red"
      : value === "On Hold"
        ? "gold"
        : "default";

export default function ProjectTracker({
  data,
  onSave,
  onEdit,
  onDelete,
  onArchive,
}: Props) {
  const { modal } = App.useApp();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>();
  const [member, setMember] = useState<string>();
  const [lead, setLead] = useState<string>();
  const [archived, setArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [ascending, setAscending] = useState(true);
  const memberName = (id: string | null) =>
    data.members.find((m) => m.id === id)?.name ?? "—";
  const projectModules = (id: string) =>
    data.modules.filter((m) => m.project_id === id);
  const children = (id: string) =>
    data.submodules.filter((s) => s.module_id === id);
  const memberIds = (id: string) =>
    data.memberships.filter((m) => m.project_id === id).map((m) => m.member_id);
  const term = search.trim().toLowerCase();
  const matches = (record: Project | Task) =>
    `${record.name} ${record.notes} ${"client_name" in record ? record.client_name : ""} ${memberName("lead_id" in record ? record.lead_id : record.assigned_member_id)}`
      .toLowerCase()
      .includes(term);
  const visible = data.projects
    .filter(
      (p) =>
        (archived || !p.archived) &&
        (!status || p.status === status) &&
        (!lead || p.lead_id === lead) &&
        (!member || memberIds(p.id).includes(member)) &&
        (!term ||
          matches(p) ||
          projectModules(p.id).some(
            (m) => matches(m) || children(m.id).some(matches),
          )),
    )
    .sort((a, b) => {
      if (!a.start_date || !b.start_date)
        return a.start_date
          ? -1
          : b.start_date
            ? 1
            : a.name.localeCompare(b.name);
      return (
        (ascending ? 1 : -1) * a.start_date.localeCompare(b.start_date) ||
        a.name.localeCompare(b.name)
      );
    });
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(visible.length / pageSize)),
  );
  const toggle = (id: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const formOptions = (projectId?: string) =>
    data.members
      .filter(
        (m) =>
          !m.archived && (!projectId || memberIds(projectId).includes(m.id)),
      )
      .map((m) => ({ value: m.id, label: m.name }));
  const filterOptions = data.members.map((m) => ({
    value: m.id,
    label: m.name + (m.archived ? " (archived)" : ""),
  }));

  async function create(
    entity: Entity,
    raw: QuickValues,
    parent?: Project | Task,
  ) {
    const date = raw.date?.format("YYYY-MM-DD") ?? null;
    if (
      parent &&
      outsideSchedule(date, null, parent.start_date, parent.due_date)
    ) {
      const proceed = await new Promise<boolean>((resolve) =>
        modal.confirm({
          title: "Kick-off date is outside the parent schedule",
          content: "Review the date or continue with this schedule.",
          okText: "Continue",
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        }),
      );
      if (!proceed) return false;
    }
    const values =
      entity === "projects"
        ? {
            name: raw.name,
            client_name: "",
            description: "",
            technologies: [],
            lead_id: raw.lead ?? null,
            member_ids: raw.lead ? [raw.lead] : [],
            start_date: date,
            due_date: null,
            status: "Planned",
            priority: "Medium",
            notes: "",
          }
        : {
            name: raw.name,
            description: "",
            assigned_member_id: raw.lead ?? null,
            start_date: date,
            due_date: null,
            status: "Not Started",
            priority: "Medium",
            notes: "",
          };
    return onSave({ entity, action: "save", parentId: parent?.id, values });
  }

  function phase(entity: Entity, record: Project | Task) {
    const derived = entity === "modules" && children(record.id).length > 0;
    const value = derived
      ? derivedStatus(record as Task, data.submodules)
      : record.status;
    return (
      <Phase
        value={value}
        disabled={derived}
        label={record.name}
        options={entity === "projects" ? projectStatuses : taskStatuses}
        onChange={(status) =>
          onSave({
            entity,
            action: "save",
            id: record.id,
            values: {
              ...record,
              status,
              ...("lead_id" in record
                ? { member_ids: memberIds(record.id) }
                : {}),
            },
          })
        }
      />
    );
  }
  function notes(entity: Entity, record: Project | Task) {
    return (
      <StatusNotes
        key={`${record.id}-${record.notes}`}
        label={record.name}
        initial={record.notes}
        onSave={(notes) =>
          onSave({ entity, action: "notes", id: record.id, values: { notes } })
        }
      />
    );
  }
  function actions(entity: Entity, record: Project | Task, parentId?: string) {
    return (
      <div className="tracker-actions">
        <Button
          type="text"
          size="small"
          onClick={() => onDelete(entity, record.id)}
        >
          Remove
        </Button>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              {
                key: "edit",
                label: "Edit details",
                onClick: () => onEdit({ entity, record, parentId }),
              },
              ...(entity === "projects"
                ? [
                    {
                      key: "archive",
                      label: (record as Project).archived
                        ? "Restore project"
                        : "Archive project",
                      onClick: () => onArchive(record as Project),
                    },
                  ]
                : []),
              ...(entity === "modules"
                ? [
                    {
                      key: "add",
                      label: "Add submodule",
                      onClick: () => {
                        setAdding((old) => new Set(old).add(record.id));
                        setCollapsed((old) => {
                          const next = new Set(old);
                          next.delete(record.id);
                          return next;
                        });
                      },
                    },
                  ]
                : []),
            ],
          }}
        >
          <Button
            size="small"
            type="text"
            icon={<MoreOutlined />}
            aria-label={`More actions for ${record.name}`}
          />
        </Dropdown>
      </div>
    );
  }
  function dateCell(record: Project | Task, parent?: Project | Task) {
    const outside =
      parent &&
      outsideSchedule(
        record.start_date,
        record.due_date,
        parent.start_date,
        parent.due_date,
      );
    return (
      <td className="tracker-date">
        {record.start_date
          ? dayjs(record.start_date).format("DD MMM YYYY")
          : "—"}
        {outside && (
          <span className="tracker-date-warning">Outside parent schedule</span>
        )}
      </td>
    );
  }
  function taskRow(task: Task, project: Project, sub = false, parent?: Task) {
    const list = sub ? [] : children(task.id);
    const open = !collapsed.has(task.id) || Boolean(term);
    return (
      <tbody key={task.id} className="tracker-module-group">
        <tr
          className={sub ? "tracker-child tracker-grandchild" : "tracker-child"}
        >
          <td>
            <div className="tracker-name-cell">
              <span className="tracker-branch" />
              {list.length > 0 && (
                <button
                  className="tracker-toggle"
                  aria-label={`${open ? "Collapse" : "Expand"} ${task.name}`}
                  aria-expanded={open}
                  onClick={() => toggle(task.id)}
                >
                  {open ? <CaretDownOutlined /> : <CaretRightOutlined />}
                </button>
              )}
              <button
                className="tracker-task-name"
                onClick={() =>
                  onEdit({
                    entity: sub ? "submodules" : "modules",
                    record: task,
                    parentId: sub ? task.module_id : project.id,
                  })
                }
              >
                {task.name}
              </button>
              {list.length > 0 && <small>{list.length} submodules</small>}
            </div>
          </td>
          <td>{memberName(task.assigned_member_id)}</td>
          {dateCell(task, parent ?? project)}
          <td>{phase(sub ? "submodules" : "modules", task)}</td>
          <td>{notes(sub ? "submodules" : "modules", task)}</td>
          <td>
            {actions(
              sub ? "submodules" : "modules",
              task,
              sub ? task.module_id : project.id,
            )}
          </td>
        </tr>
        {!sub &&
          open &&
          list.map((s) => (
            <tr key={s.id} className="tracker-child tracker-grandchild">
              <td>
                <div className="tracker-name-cell">
                  <span className="tracker-branch" />
                  <button
                    className="tracker-task-name"
                    onClick={() =>
                      onEdit({
                        entity: "submodules",
                        record: s,
                        parentId: task.id,
                      })
                    }
                  >
                    {s.name}
                  </button>
                </div>
              </td>
              <td>{memberName(s.assigned_member_id)}</td>
              {dateCell(s, task)}
              <td>{phase("submodules", s)}</td>
              <td>{notes("submodules", s)}</td>
              <td>{actions("submodules", s, task.id)}</td>
            </tr>
          ))}
        {!sub && adding.has(task.id) && (
          <tr className="tracker-add-row">
            <td colSpan={6}>
              <QuickAdd
                label="submodule"
                options={formOptions(project.id)}
                onSubmit={(raw) => create("submodules", raw, task)}
                onCancel={() =>
                  setAdding((old) => {
                    const next = new Set(old);
                    next.delete(task.id);
                    return next;
                  })
                }
              />
            </td>
          </tr>
        )}
      </tbody>
    );
  }

  return (
    <section className="project-tracker" aria-label="Project tracker">
      <div className="tracker-topline">
        <Input
          allowClear
          aria-label="Search projects, modules or leads"
          placeholder="Search projects, modules or leads..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <QuickAdd
          label="project"
          options={formOptions()}
          onSubmit={(raw) => create("projects", raw)}
        />
      </div>
      <div className="tracker-filters">
        <Select
          allowClear
          aria-label="Filter by phase"
          placeholder="All phases"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={projectStatuses.map((value) => ({
            value,
            label: phaseLabel(value),
          }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          aria-label="Filter by project lead"
          placeholder="All project leads"
          value={lead}
          onChange={(v) => {
            setLead(v);
            setPage(1);
          }}
          options={filterOptions}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          aria-label="Filter by assigned member"
          placeholder="All assigned members"
          value={member}
          onChange={(v) => {
            setMember(v);
            setPage(1);
          }}
          options={filterOptions}
        />
        <Checkbox
          checked={archived}
          onChange={(e) => {
            setArchived(e.target.checked);
            setPage(1);
          }}
        >
          Include archived
        </Checkbox>
        <span className="tracker-save-hint">
          Current status saves when you leave the field.
        </span>
      </div>
      <div className="tracker-table-scroll">
        <table className="tracker-table">
          <caption className="sr-only">
            Projects with nested modules, team leads, kick-off dates, phases and
            editable current status
          </caption>
          <colgroup>
            <col style={{ width: "27%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "27%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Project / sub-module</th>
              <th scope="col">Team lead</th>
              <th
                scope="col"
                aria-sort={ascending ? "ascending" : "descending"}
              >
                <button onClick={() => setAscending(!ascending)}>
                  Kick-off date {ascending ? "↑" : "↓"}
                </button>
              </th>
              <th scope="col">Phase</th>
              <th scope="col">Current status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          {visible
            .slice((currentPage - 1) * pageSize, currentPage * pageSize)
            .map((p) => {
              const mods = projectModules(p.id);
              const open = !collapsed.has(p.id) || Boolean(term);
              return (
                <ProjectGroup key={p.id}>
                  <tbody className="tracker-project-group">
                    <tr className="tracker-project-row">
                      <td>
                        <div className="tracker-name-cell">
                          <button
                            className="tracker-toggle"
                            aria-label={`${open ? "Collapse" : "Expand"} ${p.name}`}
                            aria-expanded={open}
                            onClick={() => toggle(p.id)}
                          >
                            {open ? (
                              <CaretDownOutlined />
                            ) : (
                              <CaretRightOutlined />
                            )}
                          </button>
                          <Link href={`/projects/${p.id}`}>{p.name}</Link>
                          <small>{mods.length} modules</small>
                          {p.archived && <Tag>Archived</Tag>}
                        </div>
                      </td>
                      <td>{memberName(p.lead_id)}</td>
                      {dateCell(p)}
                      <td>{phase("projects", p)}</td>
                      <td>{notes("projects", p)}</td>
                      <td>{actions("projects", p)}</td>
                    </tr>
                  </tbody>
                  {open && (
                    <>
                      {mods.map((m) => taskRow(m, p))}
                      <tbody className="tracker-add-group">
                        <tr className="tracker-add-row">
                          <td colSpan={6}>
                            <QuickAdd
                              label="module"
                              options={formOptions(p.id)}
                              onSubmit={(raw) => create("modules", raw, p)}
                            />
                            <p className="tracker-assignment-hint">
                              {formOptions(p.id).length
                                ? "Leads are selected from this project's team."
                                : "Assign team members in project details to select a module lead."}
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </>
                  )}
                </ProjectGroup>
              );
            })}
          {!visible.length && (
            <tbody>
              <tr>
                <td colSpan={6}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      data.projects.length
                        ? "No projects match these filters"
                        : "Add your first project above"
                    }
                  />
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={visible.length}
        showSizeChanger
        showTotal={(total) => `${total} projects`}
        onChange={(p, size) => {
          setPage(p);
          setPageSize(size);
        }}
        className="tracker-pagination"
      />
    </section>
  );
}

function ProjectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function QuickAdd({
  label,
  options,
  onSubmit,
  onCancel,
}: {
  label: "project" | "module" | "submodule";
  options: { value: string; label: string }[];
  onSubmit: (values: QuickValues) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [form] = Form.useForm<QuickValues>();
  const [busy, setBusy] = useState(false);
  return (
    <Form
      form={form}
      className={`tracker-quick-add tracker-quick-${label}`}
      layout="inline"
      onFinish={async (values) => {
        setBusy(true);
        try {
          if (await onSubmit(values)) form.resetFields();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Form.Item
        name="name"
        rules={[
          { required: true, whitespace: true, message: "Enter a name" },
          { max: 200 },
        ]}
      >
        <Input
          aria-label={`New ${label} name`}
          placeholder={
            label === "project"
              ? "Project name"
              : label === "module"
                ? "Module name"
                : "Sub-module name"
          }
          disabled={busy}
        />
      </Form.Item>
      <Form.Item name="lead">
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          aria-label={`New ${label} lead`}
          placeholder={label === "project" ? "Team lead" : "Lead"}
          options={options}
          disabled={busy}
          notFoundContent="No available team members"
        />
      </Form.Item>
      <Form.Item name="date">
        <DatePicker
          aria-label={`New ${label} kick-off date`}
          format="DD MMM YYYY"
          placeholder="dd-mmm-yyyy"
          disabled={busy}
        />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={busy}>
        Add {label === "submodule" ? "sub-module" : label}
      </Button>
      {onCancel && (
        <Button type="text" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      )}
    </Form>
  );
}

function StatusNotes({
  initial,
  label,
  onSave,
}: {
  initial: string;
  label: string;
  onSave: (notes: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  async function save() {
    if (value.trim() === saved.trim() || state === "saving") return;
    setState("saving");
    try {
      if (await onSave(value)) {
        setSaved(value);
        setState("idle");
      } else setState("error");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="tracker-notes">
      <Input.TextArea
        aria-label={`Current status for ${label}`}
        value={value}
        placeholder="Add current status..."
        rows={2}
        maxLength={10000}
        disabled={state === "saving"}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        status={state === "error" ? "error" : undefined}
      />
      <span className="tracker-note-state" role="status">
        {state === "saving" ? (
          "Saving…"
        ) : state === "error" ? (
          <>
            Not saved. <button onClick={save}>Retry</button>
          </>
        ) : (
          ""
        )}
      </span>
    </div>
  );
}

function Phase({
  value,
  options,
  disabled,
  label,
  onChange,
}: {
  value: string;
  options: readonly string[];
  disabled: boolean;
  label: string;
  onChange: (status: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Select
      className={`tracker-phase phase-${phaseTone(value)}`}
      aria-label={`Phase for ${label}`}
      title={disabled ? "Phase is derived from submodules" : "Change phase"}
      value={value}
      disabled={disabled || busy}
      loading={busy}
      variant="borderless"
      suffixIcon={null}
      options={options.map((status) => ({
        value: status,
        label: phaseLabel(status),
      }))}
      onChange={async (status) => {
        setBusy(true);
        try {
          await onChange(status);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
