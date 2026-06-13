import { useEffect, useMemo, useState } from 'react'
import {
  Overlay,
  ScreenshareProvider,
  httpSink,
  useScreenshare,
  type Recording,
} from '@getpixel/ui'

const SERVER_URL = 'http://localhost:41789'

// Whisper language names (Transformers.js). 'english' is Whisper's default.
const LANGUAGES = [
  'english',
  'hebrew',
  'spanish',
  'french',
  'german',
  'arabic',
  'russian',
  'portuguese',
]

// Map a browser locale (navigator.language, e.g. 'he-IL') to a Whisper language.
const LOCALE_TO_WHISPER: Record<string, string> = {
  en: 'english',
  he: 'hebrew',
  iw: 'hebrew', // legacy Hebrew code
  es: 'spanish',
  fr: 'french',
  de: 'german',
  ar: 'arabic',
  ru: 'russian',
  pt: 'portuguese',
}

function defaultLanguage(): string {
  const code = (navigator.language || 'en').slice(0, 2).toLowerCase()
  return LOCALE_TO_WHISPER[code] ?? 'english'
}

type Route = 'dashboard' | 'settings'

function ControlsBar({
  language,
  setLanguage,
}: {
  language: string
  setLanguage: (l: string) => void
}) {
  const { state, start, lastRecording, passthrough, setPassthrough } = useScreenshare()
  const idle = state === 'idle'

  return (
    <div className={`status${idle ? '' : ' recording'}`}>
      <span className="dot" />
      <strong>
        {state === 'idle' ? 'Idle' : state === 'paused' ? 'Paused' : 'Recording…'}
      </strong>

      <label style={{ fontSize: 14, color: '#5b5572' }}>
        Language{' '}
        <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!idle}>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l[0].toUpperCase() + l.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label
        style={{ fontSize: 14, color: '#5b5572', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        title="When on, clicks/typing reach the app while recording. Off = page is inert."
      >
        <input
          type="checkbox"
          checked={passthrough}
          onChange={(e) => setPassthrough(e.target.checked)}
        />
        Pass through clicks
      </label>

      <button className="btn secondary" onClick={() => start()} disabled={!idle}>
        {idle ? 'Start recording' : 'Recording… (use the bar / Space)'}
      </button>

      {lastRecording && idle && <LastRecording rec={lastRecording} />}
    </div>
  )
}

function Nav({ route, go }: { route: Route; go: (r: Route) => void }) {
  return (
    <nav className="nav">
      {(['dashboard', 'settings'] as Route[]).map((r) => (
        <button
          key={r}
          className={`nav-link${route === r ? ' active' : ''}`}
          onClick={() => go(r)}
        >
          {r[0].toUpperCase() + r.slice(1)}
        </button>
      ))}
      <span className="nav-note">
        Switching pages keeps recording — test clicks across both.
      </span>
    </nav>
  )
}

function DashboardPage() {
  return (
    <>
      <p style={{ color: '#6b6580' }}>
        Click cards or <strong>drag a rectangle</strong> while narrating what you'd change:
      </p>
      <div className="grid">
        {CARDS.map((card) => (
          <div className="card" key={card.title}>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            <div className="toolbar">
              <button className="btn">{card.primary}</button>
              <button className="btn secondary">Details</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function SettingsPage() {
  return (
    <>
      <p style={{ color: '#6b6580' }}>A different page with different elements to target:</p>
      <div className="form-card">
        <label className="field">
          <span>Workspace name</span>
          <input type="text" defaultValue="Acme Inc." />
        </label>
        <label className="field">
          <span>Plan</span>
          <select defaultValue="pro">
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <label className="field row">
          <input type="checkbox" defaultChecked /> <span>Email notifications</span>
        </label>
        <label className="field row">
          <input type="checkbox" /> <span>Weekly digest</span>
        </label>
        <div className="toolbar">
          <button className="btn">Save changes</button>
          <button className="btn secondary">Reset</button>
        </div>
      </div>
    </>
  )
}

function LastRecording({ rec }: { rec: Recording }) {
  const clicks = rec.events.filter((e) => e.kind === 'click').length
  const rects = rec.events.filter((e) => e.kind === 'rect').length
  const moves = rec.events.filter((e) => e.kind === 'pointer').length

  const audioUrl = useMemo(
    () => (rec.audio ? URL.createObjectURL(rec.audio.blob) : null),
    [rec.audio],
  )
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  return (
    <span style={{ color: '#6b6580', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      Last: <code>{(rec.durationMs / 1000).toFixed(1)}s</code>, {clicks} clicks, {rects} rects,{' '}
      {moves} moves, audio {rec.audio ? `${(rec.audio.blob.size / 1024).toFixed(0)}kb` : 'none'}
      {rec.id ? ` · saved ${rec.id}` : ''}
      {audioUrl && <audio controls src={audioUrl} style={{ height: 32 }} />}
    </span>
  )
}

const CARDS = [
  { title: 'Inbox', body: 'Triage messages and assign owners.', primary: 'Compose' },
  { title: 'Billing', body: 'Plans, invoices, and payment methods.', primary: 'Upgrade' },
  { title: 'Team', body: 'Invite teammates and manage roles.', primary: 'Invite' },
  { title: 'Settings', body: 'Workspace preferences and integrations.', primary: 'Edit' },
]

function Shell({
  language,
  setLanguage,
}: {
  language: string
  setLanguage: (l: string) => void
}) {
  const [route, setRoute] = useState<Route>('dashboard')
  return (
    <div className="page">
      <div className="hero">
        <h1>Screenshare — example app</h1>
        <p>
          Double-tap <span className="kbd">Space</span> to start (allow the mic). While
          recording: single <span className="kbd">Space</span> pauses/resumes, double{' '}
          <span className="kbd">Space</span> stops (with a 0.5s tail), <span className="kbd">Esc</span>{' '}
          cancels — or use the floating bar. By default the page is <strong>inert</strong>{' '}
          (clicks are recorded but the app doesn't react); tick “Pass through clicks” to keep
          it interactive. Pausing always makes the page live.
        </p>
      </div>
      <ControlsBar language={language} setLanguage={setLanguage} />
      <Nav route={route} go={setRoute} />
      {route === 'dashboard' ? <DashboardPage /> : <SettingsPage />}
    </div>
  )
}

export function App() {
  const [serverUp, setServerUp] = useState<boolean | null>(null)
  const [language, setLanguage] = useState(defaultLanguage)

  if (serverUp === null) {
    fetch(`${SERVER_URL}/health`)
      .then((r) => setServerUp(r.ok))
      .catch(() => setServerUp(false))
  }

  return (
    <ScreenshareProvider
      config={{
        sink: httpSink(SERVER_URL),
        language,
        // Show the floating bar always (center-right, 30% opacity by default).
        bar: { always: true },
      }}
      onComplete={(rec) =>
        console.log('[example] complete:', rec.durationMs, 'ms', rec.events.length, 'events', rec.language)
      }
      onSaved={(r) => console.log('[example] saved as', r.id)}
      onCancel={() => console.log('[example] cancelled')}
    >
      <Shell language={language} setLanguage={setLanguage} />
      <Overlay />
      {serverUp === false && (
        <div
          style={{
            position: 'fixed',
            bottom: 12,
            left: 12,
            padding: '8px 12px',
            borderRadius: 8,
            background: '#fee2e2',
            color: '#991b1b',
            font: '500 13px ui-sans-serif',
          }}
        >
          Server not reachable at {SERVER_URL} — run <code>npm run server</code>
        </div>
      )}
    </ScreenshareProvider>
  )
}
