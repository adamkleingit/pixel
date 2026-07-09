import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  Overlay,
  PixelStateRoot,
  PixelProvider,
  httpSink,
  usePixel,
  type Recording,
} from '@getpixel/ui'

// Defaults to the worktree dev server port (41889, offset from main's 41789 so
// both can run in parallel); the e2e test points it elsewhere via Vite env.
const SERVER_URL =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PIXEL_SERVER_URL ??
  'http://localhost:41889'

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

function ControlsBar({
  language,
  setLanguage,
}: {
  language: string
  setLanguage: (l: string) => void
}) {
  const { state, start, lastRecording, passthrough, setPassthrough } = usePixel()
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

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/settings', label: 'Settings' },
]

function Nav() {
  return (
    <nav className="nav">
      {NAV_LINKS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          {label}
        </NavLink>
      ))}
      <span className="nav-note">
        Real routes (check the URL & back button) — recording keeps running across both.
      </span>
    </nav>
  )
}

/**
 * A barebones modal that dismisses on click-outside (document `pointerdown`)
 * and Esc (document `keydown`) — the exact bubble-phase pattern Radix, Headless
 * UI, MUI and most `useOnClickOutside` hooks use. It's here to verify the
 * floating bar's event containment: clicking a bar button, or pressing Esc
 * while a bar button is focused, must NOT close this dialog.
 */
function Dialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="dialog-backdrop">
      <div className="dialog-panel" ref={panelRef} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body,
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
  { title: 'Teams', body: 'Invite teammates and manage roles.', primary: 'Invite' },
]

function Shell({
  language,
  setLanguage,
}: {
  language: string
  setLanguage: (l: string) => void
}) {
  const location = useLocation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const closeDialog = useCallback(() => setDialogOpen(false), [])
  // Controlled so every keystroke is a real React state change — captured by
  // pixel-react, so you can time-travel through what you typed.
  const [dialogText, setDialogText] = useState('type here something…')

  return (
    <div className="page">
      <div className="hero">
        <h1>Pixel - example</h1>
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
      <Nav />
      <div className="dialog-test">
        <button className="btn" onClick={() => setDialogOpen(true)}>
          Open dialog
        </button>
        <span className="nav-note" style={{ marginLeft: 12 }}>
          Open it, then click a floating-bar button (or focus one and press Esc) — it should stay open.
        </span>
      </div>

      {/* Keyed by pathname so the enter animation replays on every navigation. */}
      <div className="route-view" key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>

      <Dialog open={dialogOpen} onClose={closeDialog}>
        <h3 style={{ margin: '0 0 8px' }}>Test dialog</h3>
        <p style={{ margin: '0 0 16px', color: '#6b6580', fontSize: 14 }}>
          Closes on click-outside and Esc — like a real popover. The floating bar should not
          dismiss it.
        </p>
        <label className="field">
          <span>A field to focus</span>
          <input
            type="text"
            value={dialogText}
            onChange={(e) => setDialogText(e.target.value)}
          />
        </label>
        <div className="toolbar">
          <button className="btn" onClick={closeDialog}>
            OK
          </button>
          <button className="btn secondary" onClick={closeDialog}>
            Cancel
          </button>
        </div>
      </Dialog>
    </div>
  )
}

// Pixel is a dev-time tool — only enable it outside production builds.
const PIXEL_ENABLED = import.meta.env.DEV

export function App() {
  const [serverUp, setServerUp] = useState<boolean | null>(null)
  const [language, setLanguage] = useState(defaultLanguage)

  if (serverUp === null) {
    fetch(`${SERVER_URL}/health`)
      .then((r) => setServerUp(r.ok))
      .catch(() => setServerUp(false))
  }

  return (
    <PixelProvider
      isEnabled={PIXEL_ENABLED}
      config={{
        sink: httpSink(SERVER_URL),
        language,
        // Show the floating bar always (center-right, 30% opacity by default).
        bar: { always: true },
        // "Report a bug" button → records screen + mic. The token is minted by
        // the Pixel server we're already connected to (POST /bug-report); the
        // recording uploads directly to Vercel Blob.
        bugReport: {
          endpoint: `${SERVER_URL}/bug-report`,
          meta: { app: 'pixel-example' },
        },
      }}
      onComplete={(rec) =>
        console.log('[example] complete:', rec.durationMs, 'ms', rec.events.length, 'events', rec.language)
      }
      onSaved={(r) => console.log('[example] saved as', r.id)}
      onCancel={() => console.log('[example] cancelled')}
    >
      {/* Wrap app content so pixel-react can remount it for time-travel. Keep
          <Overlay /> OUTSIDE — it's Pixel's own UI and must never be captured. */}
      <PixelStateRoot enabled={PIXEL_ENABLED}>
        <Shell language={language} setLanguage={setLanguage} />
      </PixelStateRoot>
      {PIXEL_ENABLED && <Overlay />}
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
    </PixelProvider>
  )
}
