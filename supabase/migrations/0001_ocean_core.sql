-- OCEAN core schema. Progression tables are WRITE-PROTECTED from clients:
-- only the Next.js server (service role) mutates streaks, XP, evolution, rewards.

create extension if not exists pgcrypto;

-- ───────────── identity ─────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  tz text not null default 'UTC',
  color text not null default '#1ea7ff',
  settings jsonb not null default '{"streakVisible":true,"streakReminders":false,"muteStreakNotifs":false,"reducedMotion":false,"lowPower":false,"universe3d":true}',
  created_at timestamptz not null default now()
);

-- ───────────── friendships ─────────────
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles on delete cascade,
  user_b uuid not null references public.profiles on delete cascade,
  requested_by uuid not null references public.profiles,
  status text not null default 'pending' check (status in ('pending','accepted')),
  tz text not null default 'UTC',
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm','group')),
  title text,
  friendship_id uuid unique references public.friendships on delete cascade,
  theme text not null default 'ocean',
  created_by uuid references public.profiles,
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid references public.conversations on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  primary key (conversation_id, user_id)
);

-- Membership helper (security definer avoids RLS recursion).
create function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = cid and user_id = auth.uid());
$$;

create function public.is_friend(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships f where f.status = 'accepted'
    and ((f.user_a = auth.uid() and f.user_b = other) or (f.user_b = auth.uid() and f.user_a = other)));
$$;

-- ───────────── messaging ─────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid not null references public.profiles,
  kind text not null default 'text' check (kind in ('text','image','voice','sticker','secret','surprise','poll','game')),
  body text check (char_length(body) <= 4000),
  media_path text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at desc);

create table public.message_reactions (
  message_id uuid references public.messages on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  primary key (message_id, user_id, emoji)
);

-- ───────────── progression (server-written) ─────────────
create table public.friend_progress (
  friendship_id uuid primary key references public.friendships on delete cascade,
  streak jsonb not null default '{"current":0,"longest":0,"lastCountedDay":null,"graceUsed":0,"brokenFrom":null,"brokenOn":null,"lastRestoredOn":null}',
  xp integer not null default 0,
  unlocked text[] not null default '{}',
  evolution smallint not null default 0,
  today jsonb not null default '{"day":"","byUser":{}}',
  updated_at timestamptz not null default now()
);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null unique references public.friendships on delete cascade,
  species text not null,
  name text not null check (char_length(name) between 1 and 24),
  personality text not null default 'friendly',
  rarity text not null default 'common' check (rarity in ('common','uncommon','rare','epic','legendary')),
  colors jsonb not null default '{"body":"#4fc3f7","accent":"#ffffff"}',
  accessories text[] not null default '{}',
  equipped text[] not null default '{}',
  home text not null default 'aquarium',
  decor text[] not null default '{}',
  hunger smallint not null default 80,  -- cosmetic mood only; never a survival mechanic
  joy smallint not null default 80,
  created_at timestamptz not null default now()
);

create table public.pet_care_log (
  id bigint generated always as identity primary key,
  pet_id uuid not null references public.pets on delete cascade,
  user_id uuid not null references public.profiles,
  action text not null check (action in ('feed','play','clean','gift','decorate')),
  day text not null,
  created_at timestamptz not null default now()
);
create index on public.pet_care_log (pet_id, day);

-- ───────────── moments ─────────────
create table public.moments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('photo','video','text','voice','mood','music','memory')),
  body text check (char_length(body) <= 2000),
  media_path text,
  mood text,
  prompt_id text,
  audience text not null default 'friends' check (audience in ('private','friends','selected')),
  created_at timestamptz not null default now()
);
create table public.moment_audience (
  moment_id uuid references public.moments on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  primary key (moment_id, user_id)
);

create function public.can_see_moment(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from moments m where m.id = mid and (
    m.author_id = auth.uid()
    or (m.audience = 'friends' and public.is_friend(m.author_id))
    or (m.audience = 'selected' and exists (select 1 from moment_audience a where a.moment_id = m.id and a.user_id = auth.uid()))
  ));
$$;

-- Double reveal: partner's photo is invisible until both have submitted.
create table public.double_reveals (
  friendship_id uuid references public.friendships on delete cascade,
  day text not null,
  user_id uuid references public.profiles on delete cascade,
  media_path text not null,
  created_at timestamptz not null default now(),
  primary key (friendship_id, day, user_id)
);
create function public.reveal_open(fid uuid, d text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from double_reveals where friendship_id = fid and day = d) >= 2;
$$;

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  friendship_id uuid references public.friendships on delete set null,
  source_message_id uuid references public.messages on delete set null,
  title text,
  media_path text,
  created_at timestamptz not null default now()
);

-- ───────────── row level security ─────────────
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.friend_progress enable row level security;
alter table public.pets enable row level security;
alter table public.pet_care_log enable row level security;
alter table public.moments enable row level security;
alter table public.moment_audience enable row level security;
alter table public.double_reveals enable row level security;
alter table public.memories enable row level security;

create policy "profiles readable by signed-in users" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "see own friendships" on public.friendships for select to authenticated using (auth.uid() in (user_a, user_b));
-- Friendship creation/acceptance goes through the API (service role) so the DM + pet get created atomically.

create policy "members see conversation" on public.conversations for select to authenticated using (public.is_member(id));
create policy "members see roster" on public.conversation_members for select to authenticated using (public.is_member(conversation_id));
create policy "members read messages" on public.messages for select to authenticated using (public.is_member(conversation_id));
-- No client INSERT policy on messages: /api/messages validates, inserts, and applies progression.

create policy "members read reactions" on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy "members react" on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy "remove own reaction" on public.message_reactions for delete to authenticated using (user_id = auth.uid());

create policy "friends see progress" on public.friend_progress for select to authenticated
  using (exists (select 1 from public.friendships f where f.id = friendship_id and auth.uid() in (f.user_a, f.user_b)));
create policy "friends see pet" on public.pets for select to authenticated
  using (exists (select 1 from public.friendships f where f.id = friendship_id and auth.uid() in (f.user_a, f.user_b)));
create policy "friends see care log" on public.pet_care_log for select to authenticated
  using (exists (select 1 from public.pets p join public.friendships f on f.id = p.friendship_id where p.id = pet_id and auth.uid() in (f.user_a, f.user_b)));
-- pets, friend_progress, pet_care_log: no client write policies by design.

create policy "see permitted moments" on public.moments for select to authenticated using (public.can_see_moment(id));
create policy "own audience rows" on public.moment_audience for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.moments m where m.id = moment_id and m.author_id = auth.uid()));
create policy "delete own moment" on public.moments for delete to authenticated using (author_id = auth.uid());
-- Moment creation goes through /api/moments (counts toward progression).

create policy "own entry always; partner's only after both submit" on public.double_reveals for select to authenticated
  using (
    exists (select 1 from public.friendships f where f.id = friendship_id and auth.uid() in (f.user_a, f.user_b))
    and (user_id = auth.uid() or public.reveal_open(friendship_id, day))
  );

create policy "own memories" on public.memories for select to authenticated using (owner_id = auth.uid());
create policy "save memory" on public.memories for insert to authenticated with check (owner_id = auth.uid());
create policy "delete memory" on public.memories for delete to authenticated using (owner_id = auth.uid());

-- ───────────── realtime ─────────────
alter publication supabase_realtime add table public.messages, public.message_reactions, public.friend_progress, public.pets;

-- ───────────── storage ─────────────
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict do nothing;
-- Objects live under <user_id>/...; owners write, readers get short-lived signed URLs minted by the API after permission checks.
create policy "owner uploads media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner reads own media" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
