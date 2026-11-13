begin;
create table public.app_authorization (
 singleton boolean primary key default true check(singleton),
 user_id uuid not null unique references auth.users(id) on delete cascade
);
create function public.is_authorized() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.app_authorization where user_id = (select auth.uid()));
$$;
revoke all on function public.is_authorized() from public;
grant execute on function public.is_authorized() to authenticated;
create table public.members (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 200),
 email text not null default '', role text not null default '', skills text[] not null default '{}',
 availability text not null default 'Available' check(availability in ('Available','Partially Available','Unavailable')),
 notes text not null default '', archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.projects (
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 200),
 client_name text not null default '',description text not null default '',technologies text[] not null default '{}',
 lead_id uuid references public.members(id),start_date date,due_date date,
 status text not null default 'Planned' check(status in ('Planned','In Progress','On Hold','Completed')),
 priority text not null default 'Medium' check(priority in ('Low','Medium','High')),
 notes text not null default '',archived boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(start_date is null or due_date is null or due_date>=start_date)
);
create table public.project_memberships (
 project_id uuid not null references public.projects(id) on delete cascade,
 member_id uuid not null references public.members(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(project_id,member_id)
);
alter table public.projects add constraint lead_is_project_member foreign key(id,lead_id) references public.project_memberships(project_id,member_id) deferrable initially deferred;
create table public.modules (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 200),description text not null default '',
 assigned_member_id uuid references public.members(id),status text not null default 'Not Started' check(status in ('Not Started','In Progress','Blocked','Completed')),
 priority text not null default 'Medium' check(priority in ('Low','Medium','High')),start_date date,due_date date,notes text not null default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(start_date is null or due_date is null or due_date>=start_date)
);
create table public.submodules (
 id uuid primary key default gen_random_uuid(),module_id uuid not null references public.modules(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 200),description text not null default '',
 assigned_member_id uuid references public.members(id),status text not null default 'Not Started' check(status in ('Not Started','In Progress','Blocked','Completed')),
 priority text not null default 'Medium' check(priority in ('Low','Medium','High')),start_date date,due_date date,notes text not null default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(start_date is null or due_date is null or due_date>=start_date)
);
create index on public.projects(lead_id);
create index on public.projects(status,due_date) where not archived;
create index on public.project_memberships(member_id);
create index on public.modules(project_id);
create index on public.modules(assigned_member_id);
create index on public.submodules(module_id);
create index on public.submodules(assigned_member_id);
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end;$$;
create function public.validate_membership() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from public.members where id=new.member_id and not archived for update;
 if not found then raise exception 'Archived members cannot receive new assignments.';end if;
 return new;
end;$$;
create trigger validate_membership before insert or update on public.project_memberships for each row execute function public.validate_membership();
create function public.validate_assignment() returns trigger language plpgsql set search_path='' as $$
declare pid uuid;
begin
 if tg_op='UPDATE' then
  if tg_table_name='modules' then if new.project_id<>old.project_id then raise exception 'Modules cannot be moved between projects.';end if;end if;
  if tg_table_name='submodules' then if new.module_id<>old.module_id then raise exception 'Submodules cannot be moved between modules.';end if;end if;
 end if;
 if new.assigned_member_id is null then return new;end if;
 if tg_table_name='modules' then pid=new.project_id;else select project_id into pid from public.modules where id=new.module_id;end if;
 -- Lock the membership so concurrent removal cannot bypass assignment validation.
 perform 1 from public.project_memberships where project_id=pid and member_id=new.assigned_member_id for update;
 if not found then
  if tg_op='UPDATE' then
   if new.assigned_member_id=old.assigned_member_id and old.status='Completed' and new.status='Completed' then return new;end if;
  end if;
  raise exception 'Assigned member must belong to this project.';
 end if;
 perform 1 from public.members where id=new.assigned_member_id and not archived for update;
 if not found then
  if tg_op='UPDATE' then if new.assigned_member_id=old.assigned_member_id then return new;end if;end if;
  raise exception 'Archived members cannot receive new assignments.';
 end if;
 return new;
end;$$;
create trigger validate_assignment before insert or update on public.modules for each row execute function public.validate_assignment();
create trigger validate_assignment before insert or update on public.submodules for each row execute function public.validate_assignment();
create function public.guard_membership_removal() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.project_id<>old.project_id or new.member_id<>old.member_id) then raise exception 'Replace memberships using delete and insert.';end if;
 if tg_op='UPDATE' then return new;end if;
 if not exists(select 1 from public.projects where id=old.project_id) then return old;end if;
 if exists(select 1 from public.projects where id=old.project_id and lead_id=old.member_id)
 or exists(select 1 from public.modules m where project_id=old.project_id and assigned_member_id=old.member_id and ((not exists(select 1 from public.submodules s where s.module_id=m.id) and m.status<>'Completed') or exists(select 1 from public.submodules s where s.module_id=m.id and s.status<>'Completed')))
 or exists(select 1 from public.submodules s join public.modules m on m.id=s.module_id where m.project_id=old.project_id and s.assigned_member_id=old.member_id and s.status<>'Completed')
 then raise exception 'Resolve the project lead role and open module/submodule assignments before removing this member.';end if;
 return old;
end;$$;
create trigger guard_membership_removal before delete or update on public.project_memberships for each row execute function public.guard_membership_removal();
create function public.validate_lead() returns trigger language plpgsql set search_path='' as $$
begin
 if new.lead_id is null then return new;end if;
 if tg_op='UPDATE' then if new.lead_id is not distinct from old.lead_id then return new;end if;end if;
 perform 1 from public.members where id=new.lead_id and not archived for update;
 if not found then raise exception 'Archived members cannot receive a new lead role.';end if;
 return new;
end;$$;
create trigger validate_lead before insert or update on public.projects for each row execute function public.validate_lead();
-- Atomic project + membership save. Runs as the caller, under RLS.
create function public.save_project(payload jsonb, project_id uuid default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare pid uuid; mid uuid; selected uuid[];
begin
 if not public.is_authorized() then raise exception 'Unauthorized';end if;
 selected=array(select jsonb_array_elements_text(payload->'member_ids')::uuid);
 if nullif(payload->>'lead_id','') is not null then selected=array_append(selected,(payload->>'lead_id')::uuid);end if;
 if project_id is null then
  insert into public.projects(name) values(payload->>'name') returning id into pid;
 else
  pid=project_id;perform 1 from public.projects where id=pid for update;
  if not found then raise exception 'Project not found';end if;
 end if;
 foreach mid in array selected loop
  if not exists(select 1 from public.project_memberships pm where pm.project_id=pid and member_id=mid) then
   insert into public.project_memberships(project_id,member_id) values(pid,mid);
  end if;
 end loop;
 update public.projects set name=payload->>'name',client_name=payload->>'client_name',description=payload->>'description',
 technologies=array(select jsonb_array_elements_text(payload->'technologies')),lead_id=(payload->>'lead_id')::uuid,
 start_date=(payload->>'start_date')::date,due_date=(payload->>'due_date')::date,status=payload->>'status',priority=payload->>'priority',notes=payload->>'notes' where id=pid;
 delete from public.project_memberships pm where pm.project_id=pid and not(member_id=any(selected));
 return pid;
end;$$;
revoke all on function public.save_project(jsonb,uuid) from public;
grant execute on function public.save_project(jsonb,uuid) to authenticated;
do $$declare t text;begin
 foreach t in array array['app_authorization','members','projects','project_memberships','modules','submodules'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  if t='app_authorization' then
   execute 'grant select on public.app_authorization to authenticated';
   execute 'create policy read_own_authorization on public.app_authorization for select to authenticated using(user_id=(select auth.uid()))';
  else
   execute format('grant select,insert,update,delete on public.%I to authenticated',t);
   execute format('create policy authorized_only on public.%I for all to authenticated using((select public.is_authorized())) with check((select public.is_authorized()))',t);
   execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t);
  end if;
 end loop;
end;$$;
commit;
