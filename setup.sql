create table if not exists public.study_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null,
    subject text not null,
    due_date date not null,
    due_time time not null,
    is_done boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.study_links (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null,
    url text not null,
    category text not null default 'Geral',
    created_at timestamptz not null default now()
);

create table if not exists public.study_files (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    subject text not null,
    file_kind text not null check (file_kind in ('documents', 'photos')),
    file_name text not null,
    storage_path text not null unique,
    mime_type text not null,
    file_size bigint not null check (file_size >= 0),
    created_at timestamptz not null default now()
);

create table if not exists public.study_folders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now(),
    unique (user_id, name)
);

alter table public.study_files
    add column if not exists folder_id uuid references public.study_folders(id) on delete cascade;

insert into public.study_folders (user_id, name)
select distinct user_id, subject
from public.study_files
where folder_id is null
on conflict (user_id, name) do nothing;

update public.study_files as file
set folder_id = folder.id
from public.study_folders as folder
where file.folder_id is null
  and file.user_id = folder.user_id
  and file.subject = folder.name;

create index if not exists study_files_folder_id_idx on public.study_files(folder_id);

create table if not exists public.study_summaries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null,
    subject text not null,
    content text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.study_summaries
        add column if not exists folder_id uuid references public.study_folders(id) on delete cascade;

insert into public.study_folders (user_id, name)
select distinct user_id, subject
from public.study_summaries
where folder_id is null
on conflict (user_id, name) do nothing;

update public.study_summaries as summary
set folder_id = folder.id
from public.study_folders as folder
where summary.folder_id is null
    and summary.user_id = folder.user_id
    and summary.subject = folder.name;

alter table public.study_summaries alter column folder_id set not null;
create index if not exists study_summaries_folder_id_idx on public.study_summaries(folder_id);

alter table public.study_tasks enable row level security;
alter table public.study_links enable row level security;
alter table public.study_files enable row level security;
alter table public.study_folders enable row level security;
alter table public.study_summaries enable row level security;

drop policy if exists "Users manage their own study tasks" on public.study_tasks;
create policy "Users manage their own study tasks"
    on public.study_tasks for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users manage their own study links" on public.study_links;
create policy "Users manage their own study links"
    on public.study_links for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users manage their own study files" on public.study_files;
create policy "Users manage their own study files"
    on public.study_files for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users manage their own study folders" on public.study_folders;
create policy "Users manage their own study folders"
    on public.study_folders for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users manage their own study summaries" on public.study_summaries;
create policy "Users manage their own study summaries"
    on public.study_summaries for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete on public.study_tasks, public.study_links, public.study_files, public.study_folders, public.study_summaries to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'study-files',
    'study-files',
    false,
    52428800,
    array[
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic'
    ]
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their own study files" on storage.objects;
create policy "Users read their own study files"
    on storage.objects for select to authenticated
    using (bucket_id = 'study-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload their own study files" on storage.objects;
create policy "Users upload their own study files"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'study-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own study files" on storage.objects;
create policy "Users delete their own study files"
    on storage.objects for delete to authenticated
    using (bucket_id = 'study-files' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
