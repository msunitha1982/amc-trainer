-- Uploaded profile pictures, stored in a public Storage bucket under "<user id>/<file>".
alter table public.profiles add column if not exists avatar_url text
  check (avatar_url is null or avatar_url ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Owners manage only their own folder; guests can't upload. Public reads go through the public
-- URL, so there's no broad SELECT policy (which would let anyone list the bucket).
create policy "avatar owners list their folder" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "members upload to their avatar folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));
create policy "members replace their avatar files" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
              and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));
create policy "members delete their avatar files" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function private.set_avatar_url(p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> auth.uid()::text then
    raise exception 'That file is not in your folder' using errcode = '42501';
  end if;
  update public.profiles set avatar_url = p_path where id = auth.uid();
end $$;
create or replace function public.set_avatar_url(p_path text) returns void
language sql volatile set search_path = '' as $$ select private.set_avatar_url(p_path) $$;
revoke all on function private.set_avatar_url(text), public.set_avatar_url(text) from public, anon, authenticated;
grant execute on function private.set_avatar_url(text), public.set_avatar_url(text) to authenticated;
