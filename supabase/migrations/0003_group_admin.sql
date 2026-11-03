-- OCEAN 0003: group settings + ownership backfill.
alter table public.conversations
  add column description text check (char_length(description) <= 300),
  add column avatar_path text,
  add column announcement text check (char_length(announcement) <= 500),
  add column only_admins_post boolean not null default false;

-- Groups created before roles were enforced: make the creator the owner.
update public.conversation_members m set role = 'owner'
from public.conversations c
where c.id = m.conversation_id and c.kind = 'group' and c.created_by = m.user_id and m.role = 'member';

-- Exactly one owner per group.
create unique index conversation_one_owner on public.conversation_members (conversation_id) where role = 'owner';
