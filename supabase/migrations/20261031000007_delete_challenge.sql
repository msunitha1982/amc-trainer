-- Creators can delete their own challenges (entries cascade).
create or replace function private.delete_challenge(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  delete from public.challenges where id = p_id and creator_id = auth.uid();
  if not found then raise exception 'Only the creator can delete this challenge' using errcode = '42501'; end if;
end $$;

create or replace function public.delete_challenge(p_id text) returns void
language sql volatile set search_path = '' as $$ select private.delete_challenge(p_id) $$;

revoke all on function private.delete_challenge(text), public.delete_challenge(text) from public, anon, authenticated;
grant execute on function private.delete_challenge(text), public.delete_challenge(text) to authenticated;
