-- Difficulty seeds now include the contest year: AMC problems have grown harder over time, so each
-- year before 2024 lowers the seed by 6 (2000 problems start 144 lower). Live ratings shift by the
-- same amount so what players have taught the system is kept. Mirrors seedRating() in src/lib/rating.ts.
update public.problems
   set seed_rating = seed_rating + 6 * (year - 2024),
       rating = rating + 6 * (year - 2024)
 where true;
