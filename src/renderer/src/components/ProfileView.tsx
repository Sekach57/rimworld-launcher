import { useEffect, useState } from 'react'
import {
  Boxes,
  Flame,
  Layers,
  Link,
  Lock,
  Rocket,
  Save,
  Search,
  Share2,
  ShieldCheck,
  Skull,
  Tag,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import type { AchievementIcon, Profile } from '@shared/achievements.ts'
import { relativeTime } from '../format.ts'

const ICONS: Record<AchievementIcon, LucideIcon> = {
  rocket: Rocket,
  shield: ShieldCheck,
  skull: Skull,
  layers: Layers,
  search: Search,
  save: Save,
  share: Share2,
  tag: Tag,
  link: Link,
  boxes: Boxes,
  flame: Flame,
}

export function ProfileView() {
  const [profile, setProfile] = useState<Profile>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    window.api.getProfile().then(setProfile, (e: unknown) => setError(String(e)))
  }, [])

  if (error) return <div className="settings"><p className="muted">Could not load the profile: {error}</p></div>
  if (!profile) return <div className="settings" />

  const c = profile.stats.counters
  const list = profile.achievements
  const done = list.filter((a) => a.unlocked).length
  const tiles: [string, number | string][] = [
    ['Achievements', `${done} / ${list.length}`],
    ['Launches', c.launches ?? 0],
    ['Clean exits', c.cleanExits ?? 0],
    ['Crashes', c.crashes ?? 0],
    ['Most mods at once', c.maxActiveMods ?? 0],
  ]

  return (
    <div className="settings profile">
      <h1>
        <Trophy size={26} /> Profile
      </h1>
      <p className="muted profile-note">
        Stats are kept on this computer only.
        {profile.stats.firstAt ? ` Counting since ${new Date(profile.stats.firstAt).toLocaleDateString()}.` : ''}
      </p>

      <div className="profile-tiles">
        {tiles.map(([label, value]) => (
          <div key={label} className="profile-tile">
            <span className="profile-tile-value">{value}</span>
            <span className="profile-tile-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="achievement-grid">
        {list.map((a) => {
          const Icon = a.unlocked ? ICONS[a.icon] : Lock
          const pct = Math.round((a.value / a.target) * 100)
          return (
            <div key={a.id} className={`achievement${a.unlocked ? ' unlocked' : ''}`} data-achievement={a.id}>
              <span className="achievement-icon">
                <Icon size={20} />
              </span>
              <div className="achievement-body">
                <span className="achievement-title">{a.title}</span>
                <span className="achievement-desc">{a.description}</span>
                {a.unlocked ? (
                  <span className="achievement-meta">
                    {a.unlockedAt ? `Unlocked ${relativeTime(new Date(a.unlockedAt).toISOString())}` : 'Unlocked'}
                  </span>
                ) : (
                  <>
                    <span className="achievement-bar">
                      <i style={{ width: `${pct}%` }} />
                    </span>
                    <span className="achievement-meta">
                      {a.value} / {a.target}
                    </span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
