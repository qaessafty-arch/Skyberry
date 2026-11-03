-- OCEAN 0004: video/audio/file messages and a fast path for per-conversation media galleries.
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text','image','voice','sticker','secret','surprise','poll','game','video','audio','file'));
-- Media-bearing kinds must reference a stored object (path is always inside the sender's own folder; enforced by the API).
alter table public.messages add constraint messages_media_needs_path
  check (kind not in ('image','video','audio','file') or media_path is not null or deleted_at is not null);
create index messages_gallery on public.messages (conversation_id, created_at desc) where media_path is not null;
