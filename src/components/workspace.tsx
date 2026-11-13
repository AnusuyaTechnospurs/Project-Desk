"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dayjs from "dayjs";
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Empty,
  Input,
  Progress,
  Skeleton,
  Space,
  Table,
  Tag,
  Tabs,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FolderOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  derivedStatus,
  outsideSchedule,
  progress,
  workItems,
  type Data,
  type Member,
  type Project,
  type Task,
} from "@/lib/domain";
import RecordForm, { type Editor } from "./record-form";
import ProjectTracker from "./project-tracker";
const fmt = (date?: string | null) =>
  date ? dayjs(date).format("DD MMM YYYY") : "—";
const color = (status: string) =>
  ({
    "In Progress": "blue",
    Completed: "green",
    Blocked: "red",
    "On Hold": "orange",
    Planned: "default",
    Available: "green",
    "Partially Available": "gold",
    Unavailable: "default",
  })[status];
const statusTag = (status: string) => <Tag color={color(status)}>{status}</Tag>;
const today = () => dayjs().format("YYYY-MM-DD");
export default function Workspace({
  view,
  projectId,
}: {
  view: "dashboard" | "projects" | "members" | "detail";
  projectId?: string;
}) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/data", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw Error(body.error);
        setData(body);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  async function mutate(body: unknown) {
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      message.success("Changes saved");
      await reload();
      return true;
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Unable to save changes");
      return false;
    }
  }
  if (!data)
    return error ? (
      <Alert
        type="error"
        showIcon
        title="Unable to load workspace"
        description={error}
        action={<Button onClick={reload}>Retry</Button>}
      />
    ) : (
      <Skeleton active paragraph={{ rows: 12 }} />
    );
  const name = (id: string | null) =>
    data.members.find((m) => m.id === id)?.name ?? "Unassigned";
  const modules = (id: string) =>
    data.modules.filter((m) => m.project_id === id);
  const percent = (id: string) => progress(modules(id), data.submodules);
  const items = (id: string) => workItems(modules(id), data.submodules);
  const project = data.projects.find((p) => p.id === projectId);
  const activeProjects = data.projects.filter((p) => !p.archived);
  const membersOf = (id: string) =>
    data.memberships.filter((m) => m.project_id === id).map((m) => m.member_id);
  function confirmDelete(
    entity: "projects" | "modules" | "submodules",
    id: string,
  ) {
    modal.confirm({
      title: `Delete ${entity === "projects" ? "project" : entity === "modules" ? "module" : "submodule"}?`,
      content:
        entity === "projects"
          ? "This permanently deletes the project, its memberships, all modules, and all submodules. Team member records are retained."
          : entity === "modules"
            ? "This permanently deletes this module and all its submodules."
            : "This permanently deletes this submodule.",
      okText: "Delete permanently",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!(await mutate({ entity, action: "delete", id })))
          throw Error("Delete failed");
        if (entity === "projects" && view === "detail")
          router.push("/projects");
      },
    });
  }
  function archive(entity: "projects" | "members", record: Project | Member) {
    modal.confirm({
      title: `${record.archived ? "Restore" : "Archive"} ${record.name}?`,
      content: record.archived
        ? "The record will return to active lists."
        : "Historical assignments will be preserved. Archived records are excluded from active lists and new member selections.",
      okText: record.archived ? "Restore" : "Archive",
      onOk: async () => {
        if (
          !(await mutate({
            entity,
            action: "archive",
            id: record.id,
            archived: !record.archived,
          }))
        )
          throw Error("Archive failed");
      },
    });
  }
  async function save(body: unknown): Promise<boolean> {
    const request = body as {
      entity: string;
      values: { status: string };
      id?: string;
    };
    if (
      request.entity === "projects" &&
      request.values.status === "Completed" &&
      request.id &&
      items(request.id).some((t) => t.status !== "Completed")
    ) {
      return new Promise((resolve) =>
        modal.confirm({
          title: "This project has unfinished work",
          content:
            "Project status is manually controlled. Mark it Completed with unfinished modules or submodules?",
          okText: "Mark Completed",
          onOk: async () => resolve(await mutate(body)),
          onCancel: () => resolve(false),
        }),
      );
    }
    return mutate(body);
  }
  const projectColumns: ColumnsType<Project> = [
    {
      title: "Project",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, p) => (
        <Link className="record-link" href={`/projects/${p.id}`}>
          <span className="project-icon">
            <FolderOutlined />
          </span>
          <span>
            <strong>{p.name}</strong>
            <small>{p.client_name || "Internal project"}</small>
          </span>
        </Link>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: statusTag,
      sorter: (a, b) => a.status.localeCompare(b.status),
    },
    {
      title: "Project lead",
      dataIndex: "lead_id",
      render: (id) => (
        <span className="person">
          <Avatar
            size="small"
            style={{ background: "#eef2fa", color: "#65738a" }}
          >
            {name(id).charAt(0)}
          </Avatar>
          {name(id)}
        </span>
      ),
    },
    {
      title: "Target date",
      dataIndex: "due_date",
      sorter: (a, b) =>
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
      render: (d, p) => (
        <span
          className={
            d && d < today() && p.status !== "Completed" ? "overdue" : ""
          }
        >
          {fmt(d)}
        </span>
      ),
    },
    {
      title: "Progress",
      render: (_, p) => (
        <Progress
          percent={percent(p.id)}
          size="small"
          style={{ minWidth: 100 }}
        />
      ),
    },
  ];
  const taskRows = (list: Task[]): Row[] =>
    list.map((m) => ({
      ...m,
      status: derivedStatus(m, data.submodules),
      children: data.submodules
        .filter((s) => s.module_id === m.id)
        .map((s) => ({ ...s, isSub: true })),
    }));
  type Row = Task & { isSub?: boolean; children?: Row[] };
  const taskColumns: ColumnsType<Row> = [
    {
      title: "Module / submodule",
      dataIndex: "name",
      render: (_, t) => (
        <div>
          <strong>{t.name}</strong>
          {!t.isSub && data.submodules.some((s) => s.module_id === t.id) && (
            <small className="muted block">
              {progress([t], data.submodules)}% complete · derived from
              submodules
            </small>
          )}
          {t.description && (
            <small className="muted block">{t.description}</small>
          )}
        </div>
      ),
    },
    { title: "Assigned to", dataIndex: "assigned_member_id", render: name },
    { title: "Status", dataIndex: "status", render: statusTag },
    {
      title: "Priority",
      dataIndex: "priority",
      render: (p) => (
        <Tag
          color={p === "High" ? "volcano" : p === "Medium" ? "gold" : "default"}
        >
          {p}
        </Tag>
      ),
    },
    {
      title: "Schedule",
      render: (_, t) => {
        const parent = t.isSub
          ? data.modules.find((m) => m.id === t.module_id)
          : project;
        return (
          <>
            <span>
              {fmt(t.start_date)} – {fmt(t.due_date)}
            </span>
            {parent &&
              outsideSchedule(
                t.start_date,
                t.due_date,
                parent.start_date,
                parent.due_date,
              ) && (
                <small className="overdue block">Outside parent schedule</small>
              )}
          </>
        );
      },
    },
    {
      title: "Actions",
      render: (_, t) => (
        <Space wrap>
          <Button
            size="small"
            onClick={() =>
              setEditor({
                entity: t.isSub ? "submodules" : "modules",
                record: (t.isSub ? data.submodules : data.modules).find(
                  (m) => m.id === t.id,
                ),
                parentId: t.isSub ? t.module_id : t.project_id,
              })
            }
          >
            Edit
          </Button>
          {!t.isSub && (
            <Button
              size="small"
              onClick={() =>
                setEditor({ entity: "submodules", parentId: t.id })
              }
            >
              + Submodule
            </Button>
          )}
          <Button
            size="small"
            danger
            onClick={() =>
              confirmDelete(t.isSub ? "submodules" : "modules", t.id)
            }
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];
  const allocation = (m: Member) => {
    const assigned = activeProjects.filter((p) =>
      membersOf(p.id).includes(m.id),
    );
    const active = assigned.filter((p) => p.status === "In Progress");
    const open = assigned
      .flatMap((p) => items(p.id))
      .filter((t) => t.assigned_member_id === m.id && t.status !== "Completed");
    return { active, open, assigned };
  };
  const memberColumns: ColumnsType<Member> = [
    {
      title: "Team member",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, m) => (
        <button className="member-link" onClick={() => setSelectedMember(m)}>
          <Avatar style={{ background: "#eaf0fd", color: "#3168da" }}>
            {m.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </Avatar>
          <span>
            <strong>{m.name}</strong>
            <small>{m.role || m.email || "Team member"}</small>
          </span>
        </button>
      ),
    },
    { title: "Availability", dataIndex: "availability", render: statusTag },
    {
      title: "Skills",
      dataIndex: "skills",
      render: (skills: string[]) => skills.map((s) => <Tag key={s}>{s}</Tag>),
    },
    { title: "Active projects", render: (_, m) => allocation(m).active.length },
    { title: "Open work items", render: (_, m) => allocation(m).open.length },
  ];
  const due = activeProjects
    .filter((p) => p.status !== "Completed")
    .flatMap((p) => [
      {
        id: p.id,
        name: p.name,
        due_date: p.due_date,
        kind: "Project",
        project: p,
      },
      ...items(p.id)
        .filter((t) => t.status !== "Completed")
        .map((t) => ({
          id: t.id,
          name: t.name,
          due_date: t.due_date,
          kind: "module_id" in t ? "Submodule" : "Module",
          project: p,
        })),
    ])
    .filter((t) => t.due_date && t.due_date >= today())
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
    .slice(0, 8);
  const header = (
    title: string,
    subtitle: string,
    action?: React.ReactNode,
  ) => (
    <div className="page-header">
      <div>
        <p className="eyebrow">YOUR WORKSPACE, ORGANIZED</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
  return (
    <div>
      {error && (
        <Alert
          type="error"
          title={error}
          action={<Button onClick={reload}>Retry</Button>}
          style={{ marginBottom: 20 }}
        />
      )}
      {view === "dashboard" && (
        <>
          {header(
            "A clear view of your projects.",
            "Keep your team aligned and every deliverable moving forward.",
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditor({ entity: "projects" })}
            >
              New project
            </Button>,
          )}
          <div className="dashboard-date">
            {dayjs().format("dddd, DD MMM YYYY")}{" "}
            <span>Overview of your active workspace</span>
          </div>
          <div className="stat-grid">
            {[
              {
                label: "Total projects",
                value: activeProjects.length,
                icon: <FolderOutlined />,
                tone: "blue",
                note: "Across your workspace",
              },
              {
                label: "Active projects",
                value: activeProjects.filter((p) => p.status === "In Progress")
                  .length,
                icon: <ClockCircleOutlined />,
                tone: "purple",
                note: "Currently in progress",
              },
              {
                label: "Completed",
                value: activeProjects.filter((p) => p.status === "Completed")
                  .length,
                icon: <CheckCircleOutlined />,
                tone: "green",
                note: "Delivered and done",
              },
              {
                label: "Overdue projects",
                value: activeProjects.filter(
                  (p) =>
                    p.status !== "Completed" &&
                    p.due_date &&
                    p.due_date < today(),
                ).length,
                icon: <ClockCircleOutlined />,
                tone: "orange",
                note: "Need a little attention",
              },
            ].map((s) => (
              <Card key={s.label} className="stat-card">
                <div className={`stat-icon ${s.tone}`}>{s.icon}</div>
                <p>{s.label}</p>
                <strong className="stat-value">{s.value}</strong>
                <small>{s.note}</small>
              </Card>
            ))}
          </div>
          <div className="pending-bar">
            <div>
              <span className="pending-icon">
                <AppIcon />
              </span>
              <strong>Work in motion</strong>
              <span className="muted">A quick look at what’s still open.</span>
            </div>
            <span>
              <b>
                {
                  data.modules.filter(
                    (m) =>
                      activeProjects.some((p) => p.id === m.project_id) &&
                      derivedStatus(m, data.submodules) !== "Completed",
                  ).length
                }
              </b>{" "}
              pending modules <i />{" "}
              <b>
                {
                  data.submodules.filter(
                    (s) =>
                      data.modules.some(
                        (m) =>
                          m.id === s.module_id &&
                          activeProjects.some((p) => p.id === m.project_id),
                      ) && s.status !== "Completed",
                  ).length
                }
              </b>{" "}
              pending submodules
            </span>
          </div>
          <Card
            title="Recent projects"
            extra={
              <Link href="/projects">
                View all projects <ArrowRightOutlined />
              </Link>
            }
            className="section-card"
          >
            <Table
              rowKey="id"
              loading={loading}
              columns={projectColumns}
              dataSource={activeProjects
                .slice()
                .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                .slice(0, 5)}
              pagination={false}
              scroll={{ x: 800 }}
              locale={{
                emptyText: (
                  <Empty description="Your next project starts here">
                    <Button
                      type="primary"
                      onClick={() => setEditor({ entity: "projects" })}
                    >
                      Create your first project
                    </Button>
                  </Empty>
                ),
              }}
            />
          </Card>
          <div className="bottom-grid">
            <Card title="Upcoming due dates" extra={<ClockCircleOutlined />}>
              {due.length ? (
                due.map((t) => (
                  <Link
                    key={`${t.kind}-${t.id}`}
                    href={`/projects/${t.project.id}`}
                    className="due-row"
                  >
                    <div className="date-tile">
                      <b>{dayjs(t.due_date).format("DD")}</b>
                      <small>{dayjs(t.due_date).format("MMM YYYY")}</small>
                    </div>
                    <div>
                      <strong>{t.name}</strong>
                      <small>
                        {t.kind} · {t.project.name}
                      </small>
                    </div>
                    <ArrowRightOutlined />
                  </Link>
                ))
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No upcoming deadlines"
                />
              )}
            </Card>
            <Card
              title="Team allocation"
              extra={
                <Link href="/members">
                  View team <ArrowRightOutlined />
                </Link>
              }
            >
              <Table
                size="small"
                rowKey="id"
                columns={[memberColumns[0], memberColumns[3], memberColumns[4]]}
                dataSource={data.members.filter((m) => !m.archived)}
                pagination={{ pageSize: 5, hideOnSinglePage: true }}
                scroll={{ x: 420 }}
              />
            </Card>
          </div>
        </>
      )}
      {view === "projects" && (
        <>
          {header(
            "Projects",
            "Projects, people and the latest updates, in one clear view.",
            <Button onClick={() => setEditor({ entity: "projects" })}>
              Full project form
            </Button>,
          )}
          <ProjectTracker
            data={data}
            onSave={save}
            onEdit={setEditor}
            onDelete={confirmDelete}
            onArchive={(p) => archive("projects", p)}
          />
        </>
      )}
      {view === "members" && (
        <>
          {header(
            "Team members",
            "The people behind your projects. No member accounts needed.",
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setEditor({ entity: "members" })}
            >
              Add member
            </Button>,
          )}
          <Card>
            <div className="filters">
              <Input
                aria-label="Search members"
                prefix={<SearchOutlined />}
                placeholder="Search name, role or skill…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Checkbox
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              >
                Include archived
              </Checkbox>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={[
                ...memberColumns,
                {
                  title: "Actions",
                  render: (_, m) => (
                    <Space>
                      <Button size="small" onClick={() => setSelectedMember(m)}>
                        View
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          setEditor({ entity: "members", record: m })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        onClick={() => archive("members", m)}
                      >
                        {m.archived ? "Restore" : "Archive"}
                      </Button>
                    </Space>
                  ),
                },
              ]}
              dataSource={data.members.filter(
                (m) =>
                  (archived || !m.archived) &&
                  `${m.name} ${m.role} ${m.skills.join(" ")}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              scroll={{ x: 1000 }}
            />
          </Card>
        </>
      )}
      {view === "detail" &&
        (project ? (
          <>
            <Link className="back-link" href="/projects">
              <ArrowLeftOutlined /> All projects
            </Link>
            {header(
              project.name,
              project.client_name || "Internal project",
              <Space wrap>
                <Button
                  onClick={() =>
                    setEditor({ entity: "projects", record: project })
                  }
                >
                  Edit project
                </Button>
                <Button onClick={() => archive("projects", project)}>
                  {project.archived ? "Restore" : "Archive"}
                </Button>
                <Button
                  danger
                  onClick={() => confirmDelete("projects", project.id)}
                >
                  Delete
                </Button>
              </Space>,
            )}
            {project.archived && (
              <Alert
                type="info"
                title="This project is archived"
                style={{ marginBottom: 16 }}
              />
            )}
            {project.status === "Completed" &&
              items(project.id).some((t) => t.status !== "Completed") && (
                <Alert
                  type="warning"
                  title="Project marked Completed with unfinished work"
                  style={{ marginBottom: 16 }}
                />
              )}
            <Card>
              <div className="detail-summary">
                <Space>
                  {statusTag(project.status)}
                  <Tag>{project.priority} priority</Tag>
                </Space>
                <div className="detail-progress">
                  <span>Project progress</span>
                  <Progress percent={percent(project.id)} size="small" />
                </div>
              </div>
              <Tabs
                items={[
                  {
                    key: "overview",
                    label: "Overview",
                    children: (
                      <>
                        <Descriptions
                          column={{ xs: 1, sm: 2 }}
                          items={[
                            {
                              key: "lead",
                              label: "Project lead",
                              children: name(project.lead_id),
                            },
                            {
                              key: "start",
                              label: "Start date",
                              children: fmt(project.start_date),
                            },
                            {
                              key: "due",
                              label: "Target completion",
                              children: fmt(project.due_date),
                            },
                            {
                              key: "tech",
                              label: "Technologies",
                              children: project.technologies.map((t) => (
                                <Tag key={t}>{t}</Tag>
                              )),
                            },
                            {
                              key: "desc",
                              label: "Description",
                              span: 2,
                              children: (
                                <span className="preserve">
                                  {project.description || "No description yet."}
                                </span>
                              ),
                            },
                          ]}
                        />
                      </>
                    ),
                  },
                  {
                    key: "team",
                    label: `Assigned team (${membersOf(project.id).length})`,
                    children: (
                      <Table
                        rowKey="id"
                        columns={[
                          memberColumns[0],
                          {
                            title: "Project responsibility",
                            render: (_, m) => (
                              <Tag
                                color={
                                  project.lead_id === m.id ? "blue" : undefined
                                }
                              >
                                {project.lead_id === m.id
                                  ? "Project lead"
                                  : "Contributor"}
                              </Tag>
                            ),
                          },
                          {
                            title: "Record",
                            render: (_, m) =>
                              m.archived ? (
                                <Tag>Archived</Tag>
                              ) : (
                                statusTag(m.availability)
                              ),
                          },
                        ]}
                        dataSource={data.members.filter((m) =>
                          membersOf(project.id).includes(m.id),
                        )}
                        pagination={false}
                      />
                    ),
                  },
                  {
                    key: "modules",
                    label: `Modules (${modules(project.id).length})`,
                    children: (
                      <>
                        <div className="section-toolbar">
                          <p className="muted">
                            Expand a module to see its submodules.
                          </p>
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() =>
                              setEditor({
                                entity: "modules",
                                parentId: project.id,
                              })
                            }
                          >
                            Add module
                          </Button>
                        </div>
                        <Table
                          rowKey="id"
                          columns={taskColumns}
                          dataSource={taskRows(modules(project.id))}
                          pagination={false}
                          scroll={{ x: 1000 }}
                          expandable={{ defaultExpandAllRows: true }}
                        />
                      </>
                    ),
                  },
                  {
                    key: "notes",
                    label: "Notes",
                    children: (
                      <p className="preserve">
                        {project.notes ||
                          "No notes yet. Edit the project to add notes."}
                      </p>
                    ),
                  },
                ]}
              />
            </Card>
          </>
        ) : (
          <Empty description="Project not found">
            <Link href="/projects">Back to projects</Link>
          </Empty>
        ))}
      {editor && (
        <RecordForm
          key={`${editor.entity}-${editor.record?.id ?? "new"}-${editor.parentId ?? ""}`}
          editor={editor}
          data={data}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
      {selectedMember && (
        <MemberDetails
          member={
            data.members.find((m) => m.id === selectedMember.id) ??
            selectedMember
          }
          data={data}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}
function AppIcon() {
  return <TeamOutlined />;
}
function MemberDetails({
  member,
  data,
  onClose,
}: {
  member: Member;
  data: Data;
  onClose: () => void;
}) {
  const projects = data.projects.filter(
    (p) =>
      p.lead_id === member.id ||
      data.memberships.some(
        (m) => m.project_id === p.id && m.member_id === member.id,
      ) ||
      data.modules.some(
        (m) => m.project_id === p.id && m.assigned_member_id === member.id,
      ) ||
      data.submodules.some(
        (s) =>
          s.assigned_member_id === member.id &&
          data.modules.some(
            (m) => m.id === s.module_id && m.project_id === p.id,
          ),
      ),
  );
  const tasks = [...data.modules, ...data.submodules].filter(
    (t) => t.assigned_member_id === member.id,
  );
  return (
    <MemberModal member={member} onClose={onClose}>
      <Descriptions
        column={1}
        items={[
          { key: "email", label: "Email", children: member.email || "—" },
          { key: "role", label: "Role", children: member.role || "—" },
          {
            key: "avail",
            label: "Availability",
            children: statusTag(member.availability),
          },
          {
            key: "skills",
            label: "Skills",
            children: member.skills.join(", ") || "—",
          },
          {
            key: "notes",
            label: "Notes",
            children: <span className="preserve">{member.notes || "—"}</span>,
          },
        ]}
      />
      <h3>Project assignments</h3>
      {projects.length ? (
        projects.map((p) => (
          <p key={p.id}>
            <Link href={`/projects/${p.id}`}>{p.name}</Link>{" "}
            <Tag>
              {p.lead_id === member.id
                ? "Project lead"
                : data.memberships.some(
                      (m) => m.project_id === p.id && m.member_id === member.id,
                    )
                  ? "Contributor"
                  : "Historical assignment"}
            </Tag>
            {p.archived && <Tag>Archived</Tag>}
          </p>
        ))
      ) : (
        <p className="muted">No project assignments.</p>
      )}
      <h3>Assigned modules & submodules</h3>
      <Table
        rowKey="id"
        size="small"
        dataSource={tasks}
        columns={[
          {
            title: "Work item",
            dataIndex: "name",
            render: (_, t) => {
              const pId =
                t.project_id ??
                data.modules.find((m) => m.id === t.module_id)?.project_id;
              return (
                <Link href={`/projects/${pId}`}>
                  {t.name}
                  <small className="muted block">
                    {t.module_id ? "Submodule" : "Module"} ·{" "}
                    {data.projects.find((p) => p.id === pId)?.name}
                  </small>
                </Link>
              );
            },
          },
          {
            title: "Status",
            render: (_, t) =>
              statusTag(
                t.module_id ? t.status : derivedStatus(t, data.submodules),
              ),
          },
          { title: "Due", dataIndex: "due_date", render: fmt },
        ]}
        pagination={{ pageSize: 5 }}
      />
    </MemberModal>
  );
}
import { Modal } from "antd";
function MemberModal({
  member,
  onClose,
  children,
}: {
  member: Member;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      open
      title={
        <>
          {member.name} {member.archived && <Tag>Archived</Tag>}
        </>
      }
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      width={720}
    >
      {children}
    </Modal>
  );
}
