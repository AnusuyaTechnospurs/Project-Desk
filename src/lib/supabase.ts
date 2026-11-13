import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.AUTHORIZED_USER_ID,
  );
}
export async function supabase() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server components cannot set cookies; proxy refreshes them. */
          }
        },
      },
    },
  );
}
export async function authorized() {
  if (!configured()) return null;
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user || user.id !== process.env.AUTHORIZED_USER_ID) return null;
  const { data: allowed, error: policyError } = await db
    .from("app_authorization")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return !policyError && allowed ? db : null;
}
