-- OCEAN 0005: location messages, stickers, room types, calls, push subscriptions, moment meta.

-- ───────────── message kinds + notification kinds ─────────────
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text','image','voice','sticker','secret','surprise','poll','game','video','audio','file','location','gif'));
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message','friend_request','group_invite','mention','reaction','missed_call','room_invite','moment','sticker_request','call'));

-- ───────────── stickers ─────────────
create table public.sticker_packs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  conversation_id uuid references public.conversations on delete cascade, -- set = a friend-group pack usable by that chat's members
  created_at timestamptz not null default now()
);
create table public.pack_shares (
  pack_id uuid references public.sticker_packs on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  primary key (pack_id, user_id)
);
create table public.stickers (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.sticker_packs on delete cascade,
  owner_id uuid not null references public.profiles on delete cascade,
  media_path text not null,
  name text check (char_length(name) <= 40),
  tags text[] not null default '{}',
  animated boolean not null default false,
  -- Consent: stickers made from SOMEONE ELSE's face stay unusable until that person approves.
  subject_id uuid references public.profiles on delete set null,
  consent text not null default 'self' check (consent in ('self','pending','approved','declined')),
  created_at timestamptz not null default now(),
  check ((subject_id is null and consent = 'self') or (subject_id is not null and consent <> 'self'))
);
create index on public.stickers (pack_id);
create table public.sticker_favorites (user_id uuid references public.profiles on delete cascade, sticker_id uuid references public.stickers on delete cascade, primary key (user_id, sticker_id));
create table public.sticker_recents (user_id uuid references public.profiles on delete cascade, sticker_id uuid references public.stickers on delete cascade, used_at timestamptz not null default now(), primary key (user_id, sticker_id));

create function public.pack_visible(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sticker_packs p where p.id = pid and (
    p.owner_id = auth.uid()
    or exists (select 1 from pack_shares s where s.pack_id = p.id and s.user_id = auth.uid())
    or (p.conversation_id is not null and public.is_member(p.conversation_id))));
$$;
-- A sticker is usable by others only when its consent is settled. The subject can always SEE the request, to approve/decline it.
create function public.sticker_visible(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from stickers s where s.id = sid and (
    s.owner_id = auth.uid() or s.subject_id = auth.uid()
    or (s.consent in ('self','approved') and public.pack_visible(s.pack_id))));
$$;
alter table public.sticker_packs enable row level security; alter table public.pack_shares enable row level security;
alter table public.stickers enable row level security; alter table public.sticker_favorites enable row level security; alter table public.sticker_recents enable row level security;
create policy "see visible packs" on public.sticker_packs for select to authenticated using (public.pack_visible(id));
create policy "own pack delete" on public.sticker_packs for delete to authenticated using (owner_id = auth.uid());
create policy "own pack rename" on public.sticker_packs for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "see own/shared shares" on public.pack_shares for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.sticker_packs p where p.id = pack_id and p.owner_id = auth.uid()));
create policy "see visible stickers" on public.stickers for select to authenticated using (public.sticker_visible(id));
create policy "own sticker delete" on public.stickers for delete to authenticated using (owner_id = auth.uid());
create policy "own favorites" on public.sticker_favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.sticker_visible(sticker_id));
create policy "own recents" on public.sticker_recents for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.sticker_visible(sticker_id));
-- Creating packs/stickers, sharing, and consent decisions go through the API.

-- ───────────── rooms ─────────────
alter table public.conversations
  add column room_type text not null default 'text' check (room_type in ('text','voice','video','daily','gaming','music','study','meme','temporary','private')),
  add column expires_at timestamptz;

-- ───────────── calls ─────────────
create table public.call_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  started_by uuid not null references public.profiles,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  joined uuid[] not null default '{}'
);
alter table public.call_logs enable row level security;
create policy "members see call log" on public.call_logs for select to authenticated using (public.is_member(conversation_id));

-- ───────────── web push ─────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  endpoint text unique not null,
  p256dh text not null, auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subscriptions" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "remove own subscription" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- ───────────── moments: music / location metadata ─────────────
alter table public.moments add column meta jsonb not null default '{}';

-- ───────────── storage hardening ─────────────
-- Direct/resumable uploads use the user's own token, so enforce limits at the bucket too (not only in /api/upload-url).
update storage.buckets set file_size_limit = 536870912, allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif','image/avif',
  'video/mp4','video/webm','video/quicktime',
  'audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm',
  'application/pdf','text/plain','application/zip','application/x-zip-compressed','text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'] where id = 'media';
