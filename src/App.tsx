import { useEffect } from 'react'
import { Layout } from './components/Layout.tsx'
import { APP_NAME } from './config.ts'
import { useRoute } from './lib/router.ts'
import { AboutPage } from './pages/AboutPage.tsx'
import { AccountPage } from './pages/AccountPage.tsx'
import { ChallengePlayPage } from './pages/ChallengePlayPage.tsx'
import { ChallengesPage } from './pages/ChallengesPage.tsx'
import { DailyPage } from './pages/DailyPage.tsx'
import { FriendsPage } from './pages/FriendsPage.tsx'
import { LeaderboardPage } from './pages/LeaderboardPage.tsx'
import { PracticePage } from './pages/PracticePage.tsx'
import { ProblemPage } from './pages/ProblemPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'

const TITLES: Record<string, string> = {
  practice: 'Practice', daily: 'Daily problem', challenges: 'Challenges', c: 'Challenge', leaderboard: 'Leaderboards',
  friends: 'Friends', account: 'Account', about: 'About', u: 'Profile', p: 'Problem',
}

export default function App() {
  const route = useRoute()
  const [page = 'practice', arg] = route.parts
  useEffect(() => {
    const t = page === 'u' && arg ? arg : TITLES[page]
    document.title = t ? `${t} · ${APP_NAME}` : APP_NAME
  }, [page, arg])

  let body
  switch (page) {
    case 'daily': body = <DailyPage />; break
    case 'challenges': body = <ChallengesPage />; break
    case 'c': body = arg ? <ChallengePlayPage id={arg} /> : <ChallengesPage />; break
    case 'leaderboard': body = <LeaderboardPage />; break
    case 'friends': body = <FriendsPage route={route} />; break
    case 'account': body = <AccountPage />; break
    case 'about': body = <AboutPage />; break
    case 'u': body = arg ? <ProfilePage username={arg} /> : <AccountPage />; break
    case 'p': body = arg ? <ProblemPage id={arg} /> : <PracticePage route={route} />; break
    default: body = <PracticePage route={route} />
  }
  return <Layout active={page === 'c' ? 'challenges' : page}>{body}</Layout>
}
