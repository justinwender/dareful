-- The media bucket (docs/marks-and-memories.md; docs/decisions.md 2026-09-25). Not a Drizzle migration: the
-- storage schema is Supabase's. Applied once through the Supabase MCP. Private: nothing in it is served without
-- a signed URL issued by /api/media/[id] after an authorization check, and only the server (with the project's
-- secret key, SUPABASE_SECRET_KEY) ever writes to it. Row-level security on storage.objects stays on with no
-- policies: the secret key bypasses it and nothing else may reach the bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
