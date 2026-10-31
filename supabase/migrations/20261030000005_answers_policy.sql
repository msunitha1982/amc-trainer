-- private.answers is readable only by SECURITY DEFINER functions. An explicit deny-all policy
-- documents that intent (and keeps the linter's rls_enabled_no_policy check quiet).
revoke all on table private.answers from public, anon, authenticated;
create policy "answers are never readable by clients" on private.answers
  as restrictive for all to public using (false) with check (false);
