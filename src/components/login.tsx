"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Form, Input } from "antd";
export default function Login({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(values: { email: string; password: string }) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">P</div>
        <p className="eyebrow">PROJECT DESK</p>
        <h1>
          A little clarity.
          <br />A lot of progress.
        </h1>
        <p className="muted">Sign in to your project workspace.</p>
        {!configured && (
          <Alert
            type="info"
            showIcon
            title="Connect your workspace"
            description="Add your Supabase environment variables and run the database migration. See README.md for account setup."
          />
        )}
        {error && <Alert type="error" title={error} showIcon />}
        <Form layout="vertical" onFinish={login} requiredMark={false}>
          <Form.Item
            label="Email address"
            name="email"
            rules={[{ required: true, type: "email" }]}
          >
            <Input
              autoComplete="username"
              placeholder="you@company.com"
              size="large"
            />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={busy}
            disabled={!configured}
          >
            Sign in
          </Button>
        </Form>
        <p className="login-foot">
          Private workspace · Access is limited to the authorized team lead.
        </p>
      </section>
    </main>
  );
}
