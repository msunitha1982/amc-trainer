-- Security advisor follow-ups after enabling anonymous sign-ins.
-- 1. Avatar files: guests can't upload, so they don't need list/replace/remove either.
alter policy "avatar owners list their folder" on storage.objects
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));
alter policy "members replace their avatar files" on storage.objects
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));
alter policy "members delete their avatar files" on storage.objects
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));

-- 2. Answers and solutions: RLS on, no grants and no policies means no client access. The explicit
--    deny-all policies added nothing and were flagged as "reachable by anonymous users".
drop policy if exists "answers are never readable by clients" on private.answers;
drop policy if exists "solutions are never readable by clients" on private.solutions;

-- 3. Intentionally unchanged: "own attempts" and "own bookmarks" are meant for guests too.
