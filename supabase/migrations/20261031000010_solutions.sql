-- Wiki solutions, shown in the app after a player has answered. They reveal the answer, so like
-- private.answers they never go into the public JSON; the RPC only returns them to someone who has
-- already submitted an answer to that problem.
create table if not exists private.solutions (
  problem_id text primary key references public.problems(id) on delete cascade,
  solutions jsonb not null            -- [{ "h": heading, "s": segments }]
);
alter table private.solutions enable row level security;
revoke all on table private.solutions from public, anon, authenticated;
create policy "solutions are never readable by clients" on private.solutions
  as restrictive for all to public using (false) with check (false);

create or replace function private.get_solutions(p_problem_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from public.attempts a where a.user_id = auth.uid() and a.problem_id = p_problem_id) then
    raise exception 'Answer the problem first' using errcode = '42501';
  end if;
  return coalesce((select s.solutions from private.solutions s where s.problem_id = p_problem_id), '[]'::jsonb);
end $$;
create or replace function public.get_solutions(p_problem_id text) returns jsonb
language sql stable set search_path = '' as $$ select private.get_solutions(p_problem_id) $$;
revoke all on function private.get_solutions(text), public.get_solutions(text) from public, anon, authenticated;
grant execute on function private.get_solutions(text), public.get_solutions(text) to authenticated;
