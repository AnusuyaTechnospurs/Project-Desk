# Project Desk

A single-administrator project workspace built with Next.js App Router, TypeScript, Ant Design and Supabase. All business records persist in PostgreSQL; team member records do not have login accounts.

## Local setup

Use Node.js 22+ (Node 24 recommended) and npm. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
```

1. Create a Supabase project. In its SQL Editor, run `supabase/migrations/202611060001_initial.sql`. For CLI-managed environments, apply the versioned migration with `supabase db push` after linking your project. Do not rerun the initial migration against an already migrated database.
2. In Supabase **Authentication → Providers → Email**, disable new user signups. Keep email/password sign-in enabled. There is no signup UI in this application.
3. In **Authentication → Users → Add user**, manually create the team lead's email/password account and confirm its email. Copy that user's UUID. Member profiles and project leads are separate business records.
4. Run this SQL in the Supabase SQL Editor, replacing the UUID:

```sql
insert into public.app_authorization (singleton, user_id)
values (true, 'REPLACE_WITH_AUTH_USER_UUID');
```

5. Fill `.env.local` using your project's URL, **publishable key**, and that same UUID as `AUTHORIZED_USER_ID`. These are the three variables in `.env.example`. Restart the server after changing variables. Never add a secret key or service-role key; the application does not require one.
6. Run `npm.cmd run dev` and open http://localhost:3000. Sign in with the manually provisioned account. Add team members, then create a project and assign its lead/team, then add modules from the project detail page.

Without configuration the app displays setup guidance at `/login`. It does not substitute demo records or browser storage for the database. No Supabase credentials were provided during implementation, so a live database connection and real Auth session have not been verified.

## Behavior

- The Projects screen uses a compact expandable tracker with inline project/module creation, lead selections, kick-off dates, phase controls and current-status text. Current status edits save to the existing Notes field on blur, with a retry option if saving fails. “Kicked off” represents `In Progress`; parent module phases still follow their submodules. Project detail forms remain available for full editing. Add submodules from a module's actions menu. No extra migration is needed for this layout.

- Dashboard counts exclude archived projects. Active projects have status `In Progress`. Overdue projects have a past target date and are not Completed. Pending module and submodule totals are shown separately; progress and open-work allocation count only leaf work items. Active project allocation counts `In Progress` projects. Upcoming deadlines include future/today project dates and open leaf work items on non-completed projects.
- Project status remains manual. Marking an existing project Completed warns about unfinished work. Parent module status/progress are derived from their submodules; the parent status selector is disabled when children exist. Parent stored status is used only when it has no children.
- Project saves and membership changes use one PostgreSQL transaction. Choosing a lead also includes them in the team. Database foreign keys, triggers and RLS enforce the rules even through direct Supabase API calls.
- Resolve a member's lead role and open assignments before removing project membership. Completed historical assignments remain visible. Archived members remain on existing records and cannot receive new assignments. Member profiles are archived rather than deleted.
- Dates are stored as `DATE` and passed as `YYYY-MM-DD` strings, rendered as `DD MMM YYYY`. Reversed date ranges are rejected by both forms/API and PostgreSQL. Work-item forms warn for dates outside the parent schedule; saving again acknowledges the warning. Project modules also flag out-of-schedule dates in the detail table.
- Project deletion cascades to memberships, modules and submodules. Module deletion cascades to submodules. Destructive dialogs explain the scope. Team member records remain intact.

## Security

The server validates the Supabase Auth user, compares `AUTHORIZED_USER_ID`, and checks the authorization table for every protected page and data API call. Cookie refresh is handled by Next.js Proxy using `@supabase/ssr`. All six application tables have RLS enabled and forced. Only the UUID in the singleton authorization row can access business data. Authenticated users cannot modify the authorization table; update it only from the SQL Editor. Public/anonymous table access is revoked. A second manually created Auth user still receives no application access.

When replacing the administrator, update both the authorization row and Vercel/local `AUTHORIZED_USER_ID`, redeploy/restart, and revoke/delete the old account's sessions in Supabase. Use a strong password. There is deliberately no public password reset or user provisioning flow in this first version; account maintenance is handled in Supabase.

Implementation follows [Supabase's SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) and [Next.js Proxy conventions](https://nextjs.org/docs/app/getting-started/proxy).

## Verification

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Focused tests cover leaf progress, derived parent status, assignment eligibility, date order, invalid calendar dates, and schedule warnings. An in-memory PostgreSQL test (PGlite) applies the actual migration with a minimal mock of Supabase's `auth.users`/`auth.uid()` and roles; it exercises CRUD, assignment and archive guards, atomic memberships, date constraints, unauthorized/anonymous access and cascading deletion. This is local database verification, not verification of hosted Supabase Auth or its network configuration.

After configuring Supabase, verify: create/edit records and reload; add a module/submodule; attempt assignment to a non-project member; attempt membership removal with open work; archive a member and inspect history; sign out and try `/dashboard` and `/api/data`; sign in as another manually created user and confirm access is denied. Verify project/module cascade deletion with disposable records. Do this in a staging database before using production data.

No sample data is automatically inserted.

Implementation checks completed: lint, TypeScript, all seven tests, and a production build pass. HTTP smoke checks returned 200 for the unconfigured login/setup screen, redirected protected workspace routes to login, and returned 401 for unauthenticated reads and writes. No interactive browser or live Supabase session testing was performed.

## Vercel deployment

Push the project to your Git repository and import it into Vercel using the Next.js preset. Keep the root directory at this project, use Node.js 24, and let Vercel run `npm run build`. Set the three environment variables from `.env.example` for each intended environment, then deploy. Apply the migration and authorization row to that environment's Supabase project first. Set Supabase Auth's Site URL to the Vercel production URL. Use a separate Supabase project for preview/staging environments when testing destructive actions. No custom backend server or Vercel cron is needed.

Deployment has not been performed. SQL Editor access, account creation, environment configuration and hosted smoke testing are the remaining external setup steps.
