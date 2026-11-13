import { redirect } from "next/navigation";
import { authorized } from "@/lib/supabase";
import Shell from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await authorized())) redirect("/login");
  return <Shell>{children}</Shell>;
}
