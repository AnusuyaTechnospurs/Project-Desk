"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { App, Avatar, Button } from "antd";
import {
  AppstoreOutlined,
  FolderOutlined,
  TeamOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { message } = App.useApp();
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">P</span>Project Desk
        </Link>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {[
            ["/dashboard", "Dashboard", <AppstoreOutlined key="d" />],
            ["/projects", "Projects", <FolderOutlined key="p" />],
            ["/members", "Team Members", <TeamOutlined key="m" />],
          ].map(([href, label, icon]) => (
            <Link
              key={String(href)}
              href={String(href)}
              className={
                path.startsWith(String(href)) ? "nav-item active" : "nav-item"
              }
            >
              {icon}
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <span className="live-dot" /> Your work, in one place
            <p>A clear view of what comes next.</p>
          </div>
          <div className="profile">
            <Avatar style={{ background: "#e8efff", color: "#3168da" }}>
              TL
            </Avatar>
            <div>
              <strong>Team lead</strong>
              <small>Workspace administrator</small>
            </div>
            <Button
              type="text"
              aria-label="Sign out"
              icon={<LogoutOutlined />}
              onClick={async () => {
                try {
                  const r = await fetch("/api/auth", { method: "DELETE" });
                  if (!r.ok) throw Error();
                  router.replace("/login");
                  router.refresh();
                } catch {
                  message.error("Unable to sign out. Please retry.");
                }
              }}
            />
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            Workspace{" "}
            <span className="crumb">
              /{" "}
              {path.startsWith("/members")
                ? "Team Members"
                : path.startsWith("/projects")
                  ? "Projects"
                  : "Dashboard"}
            </span>
          </span>
          <span className="private-badge">● Private workspace</span>
        </header>
        <main className="content">{children}</main>
        <footer>
          Project Desk <span>A calmer way to manage delivery.</span>
        </footer>
      </div>
    </div>
  );
}
