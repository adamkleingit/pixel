import { useEffect, useState } from 'react'
import { Overlay, PixelProvider, httpSink } from '@getpixel/ui'

// The pack smoke harness points this at the installed server's port.
const SERVER_URL =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PIXEL_SERVER_URL ??
  'http://localhost:41990'

/** Reflects whether the installed server is reachable — the "server is connected"
 *  assertion reads this. Polls /health so a late server boot still flips it green. */
function ServerStatus() {
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    const ping = () =>
      fetch(`${SERVER_URL}/health`)
        .then((r) => r.ok)
        .catch(() => false)
        .then((ok) => {
          if (!alive) return
          setConnected(ok)
          if (!ok) setTimeout(ping, 500)
        })
    ping()
    return () => {
      alive = false
    }
  }, [])

  const label = connected === null ? 'checking' : connected ? 'connected' : 'disconnected'
  return (
    <div data-testid="server-status" data-connected={String(connected === true)}>
      Pixel server: {label}
    </div>
  )
}

export function App() {
  return (
    <PixelProvider
      isEnabled
      config={{ sink: httpSink(SERVER_URL), bar: { always: true } }}
    >
      <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px' }}>
        <h1>Pixel pack smoke</h1>
        <ServerStatus />
        <p style={{ color: '#6b6580' }}>
          This app installs <code>@getpixel/ui</code> and <code>@getpixel/server</code> as published
          tarballs. Enter edit mode and change the card copy to prove the packaged edit pipeline works.
        </p>
        <div
          className="card"
          style={{
            border: '1px solid #e5e3ef',
            borderRadius: 'var(--radius)',
            padding: 'var(--space-4)',
          }}
        >
          <h3>Billing</h3>
          <p data-testid="card-copy">Plans, invoices, and payment methods.</p>
          <button className="btn">Upgrade</button>
        </div>
      </main>
      <Overlay />
    </PixelProvider>
  )
}
