-- Avatars are a color key (rendered as an initial on that color) instead of an emoji.
update public.profiles set avatar = 'glacier'
 where avatar not in ('glacier','fjord','meltwater','moss','slate','dusk','ember','sand');
alter table public.profiles alter column avatar set default 'glacier';
alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check
  check (avatar in ('glacier','fjord','meltwater','moss','slate','dusk','ember','sand'));
update public.leaderboard_global set avatar = 'glacier'
 where avatar not in ('glacier','fjord','meltwater','moss','slate','dusk','ember','sand');
update public.leaderboard_weekly set avatar = 'glacier'
 where avatar not in ('glacier','fjord','meltwater','moss','slate','dusk','ember','sand');
