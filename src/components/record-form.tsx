"use client";
import { Alert, DatePicker, Form, Input, Modal, Select } from "antd";
import dayjs from "dayjs";
import {
  availabilities,
  priorities,
  projectStatuses,
  taskStatuses,
  outsideSchedule,
  type Data,
  type Member,
  type Project,
  type Task,
} from "@/lib/domain";
import { useState } from "react";
export type Editor = {
  entity: "projects" | "members" | "modules" | "submodules";
  record?: Project | Member | Task;
  parentId?: string;
};
type Values = Record<string, unknown>;
export default function RecordForm({
  editor,
  data,
  onClose,
  onSave,
}: {
  editor: Editor;
  data: Data;
  onClose: () => void;
  onSave: (body: unknown) => Promise<boolean>;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState("");
  const project = editor.entity === "projects";
  const member = editor.entity === "members";
  const parentModule =
    editor.entity === "submodules"
      ? data.modules.find((m) => m.id === editor.parentId)
      : undefined;
  const parentProject = data.projects.find(
    (p) => p.id === (parentModule?.project_id ?? editor.parentId),
  );
  const projectMembers = data.memberships
    .filter((m) => m.project_id === parentProject?.id)
    .map((m) => m.member_id);
  const existing = editor.record;
  const initial: Values = {
    name: "",
    client_name: "",
    description: "",
    technologies: [],
    lead_id: null,
    member_ids:
      project && existing
        ? data.memberships
            .filter((m) => m.project_id === existing.id)
            .map((m) => m.member_id)
        : [],
    email: "",
    role: "",
    skills: [],
    availability: "Available",
    assigned_member_id: null,
    status: project ? "Planned" : "Not Started",
    priority: "Medium",
    notes: "",
    ...existing,
    start_date:
      existing && "start_date" in existing && existing.start_date
        ? dayjs(existing.start_date)
        : null,
    due_date:
      existing && "due_date" in existing && existing.due_date
        ? dayjs(existing.due_date)
        : null,
  };
  const oldAssignments =
    project && existing
      ? data.memberships
          .filter((m) => m.project_id === existing.id)
          .map((m) => m.member_id)
      : [];
  const options = (kind: "lead" | "member" | "task") =>
    data.members
      .filter((m) => {
        if (kind === "task")
          return (
            projectMembers.includes(m.id) ||
            ("assigned_member_id" in (existing ?? {}) &&
              (existing as Task).assigned_member_id === m.id)
          );
        return !m.archived || oldAssignments.includes(m.id);
      })
      .map((m) => ({
        value: m.id,
        label: m.name + (m.archived ? " (archived)" : ""),
        disabled:
          m.archived &&
          (kind === "task"
            ? (existing as Task | undefined)?.assigned_member_id !== m.id
            : kind === "lead"
              ? (existing as Project | undefined)?.lead_id !== m.id
              : !oldAssignments.includes(m.id)),
      }));
  const hasChildren =
    editor.entity === "modules" &&
    data.submodules.some((s) => s.module_id === existing?.id);
  async function submit(raw: Values) {
    const values = { ...raw };
    ["start_date", "due_date"].forEach((key) => {
      values[key] = raw[key]
        ? dayjs(raw[key] as string).format("YYYY-MM-DD")
        : null;
    });
    ["lead_id", "assigned_member_id"].forEach((k) => {
      values[k] = values[k] || null;
    });
    if (project && values.lead_id)
      values.member_ids = Array.from(
        new Set([...(values.member_ids as string[]), values.lead_id]),
      );
    const parent = parentModule ?? parentProject;
    const out =
      !project &&
      !member &&
      parent &&
      outsideSchedule(
        values.start_date as string | null,
        values.due_date as string | null,
        parent.start_date,
        parent.due_date,
      );
    if (out && !warning) {
      setWarning(
        "These dates fall outside the parent schedule. Review them, or save again to continue.",
      );
      return;
    }
    setBusy(true);
    try {
      if (
        await onSave({
          entity: editor.entity,
          action: "save",
          id: existing?.id,
          parentId: editor.parentId,
          values,
        })
      )
        onClose();
    } finally {
      setBusy(false);
    }
  }
  const dateFields = (
    <div className="form-grid">
      <Form.Item name="start_date" label="Start date">
        <DatePicker format="DD MMM YYYY" style={{ width: "100%" }} />
      </Form.Item>
      <Form.Item
        name="due_date"
        label={project ? "Target completion date" : "Due date"}
        dependencies={["start_date"]}
        rules={[
          ({ getFieldValue }) => ({
            validator(_, value) {
              const start = getFieldValue("start_date");
              return value && start && value.isBefore(start, "day")
                ? Promise.reject(Error("Must be on or after start date"))
                : Promise.resolve();
            },
          }),
        ]}
      >
        <DatePicker format="DD MMM YYYY" style={{ width: "100%" }} />
      </Form.Item>
    </div>
  );
  return (
    <Modal
      open
      title={`${existing ? "Edit" : "New"} ${project ? "project" : member ? "team member" : editor.entity === "modules" ? "module" : "submodule"}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={existing ? "Save changes" : "Create record"}
      confirmLoading={busy}
      width={680}
      destroyOnHidden
      maskClosable={!busy}
      closable={!busy}
      cancelButtonProps={{ disabled: busy }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initial}
        onFinish={submit}
        onValuesChange={() => setWarning("")}
        requiredMark="optional"
      >
        <Form.Item
          name="name"
          label={member ? "Full name" : "Name"}
          rules={[{ required: true, whitespace: true }, { max: 200 }]}
        >
          <Input
            autoFocus
            placeholder={
              project
                ? "e.g. Customer portal"
                : member
                  ? "e.g. Alex Morgan"
                  : "e.g. Authentication"
            }
          />
        </Form.Item>
        {project && (
          <>
            <Form.Item name="client_name" label="Client name">
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="technologies" label="Technologies">
              <Select
                mode="tags"
                tokenSeparators={[","]}
                placeholder="Type a technology and press Enter"
              />
            </Form.Item>
            <Form.Item name="lead_id" label="Project lead">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={options("lead")}
                onChange={(value) => {
                  if (value)
                    form.setFieldValue(
                      "member_ids",
                      Array.from(
                        new Set([
                          ...(form.getFieldValue("member_ids") ?? []),
                          value,
                        ]),
                      ),
                    );
                }}
              />
            </Form.Item>
            <Form.Item
              name="member_ids"
              label="Assigned team members"
              extra="The project lead is also included in the project team."
            >
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                options={options("member")}
              />
            </Form.Item>
          </>
        )}
        {member ? (
          <>
            <div className="form-grid">
              <Form.Item
                name="email"
                label="Email address"
                rules={[{ type: "email" }]}
              >
                <Input type="email" />
              </Form.Item>
              <Form.Item name="role" label="Role / designation">
                <Input />
              </Form.Item>
            </div>
            <Form.Item name="skills" label="Skills">
              <Select
                mode="tags"
                tokenSeparators={[","]}
                placeholder="Type a skill and press Enter"
              />
            </Form.Item>
            <Form.Item name="availability" label="Availability">
              <Select
                options={availabilities.map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
          </>
        ) : (
          <>
            {!project && (
              <>
                <Form.Item name="description" label="Description">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item
                  name="assigned_member_id"
                  label="Assigned member"
                  extra="Choose from this project's team."
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={options("task")}
                  />
                </Form.Item>
              </>
            )}
            {dateFields}
            <div className="form-grid">
              <Form.Item
                name="status"
                label="Status"
                extra={
                  hasChildren
                    ? "Parent status is calculated from submodules."
                    : undefined
                }
              >
                <Select
                  disabled={hasChildren}
                  options={(project ? projectStatuses : taskStatuses).map(
                    (value) => ({ value, label: value }),
                  )}
                />
              </Form.Item>
              <Form.Item name="priority" label="Priority">
                <Select
                  options={priorities.map((value) => ({ value, label: value }))}
                />
              </Form.Item>
            </div>
          </>
        )}
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} />
        </Form.Item>
        {warning && <Alert type="warning" showIcon title={warning} />}
      </Form>
    </Modal>
  );
}
