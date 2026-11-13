import { redirect } from "next/navigation";
import { authorized, configured } from "@/lib/supabase";
import Login from "@/components/login";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (await authorized()) redirect("/dashboard");
  return <Login configured={configured()} />;
}
