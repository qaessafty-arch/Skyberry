-- OCEAN 0002: profile, blocks, message actions, receipts, pins, saved, notifications, invites, 24h moments.

alter table public.profiles
  add column bio text check (char_length(bio) <= 280),
  add column avatar_path text,
  add column status_text text check (char_length(status_text) <= 80),
  add column last_seen timestamptz,
  add column show_presence boolean not null default true;

-- ───────────── blocks ─────────────
create table public.blocks (
  blocker uuid references public.profiles on delete cascade,
  blocked uuid references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked), check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create policy "own blocks read" on public.blocks for select to authenticated using (blocker = auth.uid());
create policy "block someone" on public.blocks for insert to authenticated with check (blocker = auth.uid());
create policy "unblock" on public.blocks for delete to authenticated using (blocker = auth.uid());

create function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

-- ───────────── message actions ─────────────
alter table public.messages
  add column reply_to uuid references public.messages on delete set null,
  add column forwarded_from uuid references public.messages on delete set null,
  add column edited_at timestamptz,
  add column deleted_at timestamptz;
create index messages_body_search on public.messages using gin (to_tsvector('simple', coalesce(body, '')));

create table public.message_receipts (
  message_id uuid references public.messages on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (message_id, user_id)
);
alter table public.message_receipts enable row level security;
create policy "members read receipts" on public.message_receipts for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy "write own receipt" on public.message_receipts for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy "update own receipt" on public.message_receipts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.conversation_members
  add column last_read_at timestamptz not null default now(),
  add column muted_until timestamptz,
  add column role text not null default 'member' check (role in ('owner','admin','member'));
create policy "update own membership" on public.conversation_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and role = (select role from public.conversation_members c where c.conversation_id = conversation_members.conversation_id and c.user_id = auth.uid()));

-- Pinned for everyone (distinct from saved-privately).
create table public.pinned_messages (
  conversation_id uuid references public.conversations on delete cascade,
  message_id uuid references public.messages on delete cascade,
  pinned_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);
alter table public.pinned_messages enable row level security;
create policy "members see pins" on public.pinned_messages for select to authenticated using (public.is_member(conversation_id));
-- pin/unpin via API (admins only in groups).

-- ───────────── saved (private) ─────────────
create table public.saved_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  unique (owner_id, name)
);
create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('message','photo','video','file','sticker','voice','link','memory')),
  message_id uuid references public.messages on delete set null,
  media_path text, url text, title text,
  note text check (char_length(note) <= 500),
  collection_id uuid references public.saved_collections on delete set null,
  created_at timestamptz not null default now(),
  check (message_id is not null or media_path is not null or url is not null)
);
create unique index saved_items_msg_once on public.saved_items (owner_id, message_id) where message_id is not null;
create index on public.saved_items (owner_id, created_at desc);
alter table public.saved_collections enable row level security;
alter table public.saved_items enable row level security;
create policy "own collections" on public.saved_collections for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own saved read" on public.saved_items for select to authenticated using (owner_id = auth.uid());
create policy "own saved update" on public.saved_items for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own saved delete" on public.saved_items for delete to authenticated using (owner_id = auth.uid());
-- Saving a MESSAGE goes through the API so we can confirm the user may read it; media/links may be saved directly.
create policy "save own media or link" on public.saved_items for insert to authenticated
  with check (owner_id = auth.uid() and message_id is null and (media_path is null or media_path like auth.uid()::text || '/%'));

-- ───────────── notifications ─────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('message','friend_request','group_invite','mention','reaction','missed_call','room_invite','moment')),
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark read" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dismiss" on public.notifications for delete to authenticated using (user_id = auth.uid());
-- Created only by the server.

create table public.user_settings (
  user_id uuid primary key references public.profiles on delete cascade,
  notify jsonb not null default '{"message":true,"friend_request":true,"group_invite":true,"mention":true,"reaction":true,"missed_call":true,"room_invite":true,"moment":true}',
  quiet_hours jsonb,           -- {"start":"22:00","end":"07:00"}
  appearance jsonb not null default '{"theme":"system","bg3d":"auto","bgIntensity":0.6,"reducedMotion":null}',
  updated_at timestamptz not null default now()
);
create table public.chat_customizations (
  user_id uuid references public.profiles on delete cascade,
  conversation_id uuid references public.conversations on delete cascade, -- null id row = global default via separate row key
  scope text not null default 'conversation' check (scope in ('conversation')),
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
alter table public.user_settings enable row level security;
alter table public.chat_customizations enable row level security;
create policy "own settings" on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own chat custom" on public.chat_customizations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(conversation_id));

-- ───────────── invite links (stored hashed) ─────────────
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique not null,
  created_by uuid not null references public.profiles on delete cascade,
  conversation_id uuid references public.conversations on delete cascade, -- null = friend invite
  expires_at timestamptz not null,
  max_uses int not null default 1 check (max_uses between 1 and 100),
  uses int not null default 0,
  revoked boolean not null default false
);
alter table public.invites enable row level security;
create policy "see own invites" on public.invites for select to authenticated using (created_by = auth.uid());
-- Create / redeem only via API (service role).

-- ───────────── moments: 24h expiry, close friends, views, reactions ─────────────
alter table public.moments drop constraint moments_audience_check;
alter table public.moments add constraint moments_audience_check check (audience in ('private','friends','close','selected'));
alter table public.moments add column expires_at timestamptz, add column muted boolean not null default false;
create table public.close_friends (
  owner_id uuid references public.profiles on delete cascade,
  friend_id uuid references public.profiles on delete cascade,
  primary key (owner_id, friend_id), check (owner_id <> friend_id)
);
alter table public.close_friends enable row level security;
create policy "manage own close friends" on public.close_friends for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.is_friend(friend_id));

create or replace function public.can_see_moment(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from moments m where m.id = mid and (
    m.author_id = auth.uid()
    or (
      (m.expires_at is null or m.expires_at > now())
      and not public.blocked_between(m.author_id, auth.uid())
      and (
        (m.audience = 'friends' and public.is_friend(m.author_id))
        or (m.audience = 'close' and exists (select 1 from close_friends c where c.owner_id = m.author_id and c.friend_id = auth.uid()))
        or (m.audience = 'selected' and exists (select 1 from moment_audience a where a.moment_id = m.id and a.user_id = auth.uid()))
      )
    )
  ));
$$;

create table public.moment_views (
  moment_id uuid references public.moments on delete cascade,
  viewer_id uuid references public.profiles on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (moment_id, viewer_id)
);
create table public.moment_reactions (
  moment_id uuid references public.moments on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  primary key (moment_id, user_id)
);
create table public.moment_reports (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid references public.moments on delete cascade,
  reporter uuid not null references public.profiles on delete cascade,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (moment_id, reporter)
);
alter table public.moment_views enable row level security;
alter table public.moment_reactions enable row level security;
alter table public.moment_reports enable row level security;
create policy "author sees viewers; viewer sees own" on public.moment_views for select to authenticated
  using (viewer_id = auth.uid() or exists (select 1 from public.moments m where m.id = moment_id and m.author_id = auth.uid()));
create policy "record own view" on public.moment_views for insert to authenticated with check (viewer_id = auth.uid() and public.can_see_moment(moment_id));
create policy "see reactions on visible moments" on public.moment_reactions for select to authenticated using (public.can_see_moment(moment_id));
create policy "react to visible moments" on public.moment_reactions for insert to authenticated with check (user_id = auth.uid() and public.can_see_moment(moment_id));
create policy "change reaction" on public.moment_reactions for delete to authenticated using (user_id = auth.uid());
create policy "report visible moment" on public.moment_reports for insert to authenticated with check (reporter = auth.uid() and public.can_see_moment(moment_id));

alter publication supabase_realtime add table public.notifications, public.message_receipts, public.pinned_messages;

-- Storage used by a user (bytes), for quota indicators. Reads Supabase's storage.objects metadata.
create function public.storage_used(uid uuid) returns bigint
language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'media' and (storage.foldername(name))[1] = uid::text;
$$;
revoke execute on function public.storage_used(uuid) from public, anon, authenticated;
