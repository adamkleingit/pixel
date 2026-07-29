/**
 * Server-rendering and hydration. Frameworks that prerender (Next, Remix,
 * Astro) render `<PixelProvider>` and `<Overlay />` on the server too, so the
 * overlay's `document.body` portal — which has no server-rendered counterpart —
 * must not appear on the first client pass.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { Overlay } from './Overlay'
import { PixelProvider } from './PixelProvider'

function App() {
  return (
    <PixelProvider>
      <main id="app">hello</main>
      <Overlay />
    </PixelProvider>
  )
}

let error: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  error.mockRestore()
  document.body.innerHTML = ''
})

describe('server rendering', () => {
  it('renders the app without the overlay', () => {
    const html = renderToString(<App />)
    expect(html).toContain('hello')
    expect(html).not.toContain('pixel-overlay')
  })
})

describe('hydration', () => {
  it('matches the server HTML, then mounts the overlay', async () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<App />)
    document.body.appendChild(container)

    let root: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, <App />)
    })

    const hydrationErrors = (error.mock.calls as unknown[][]).filter((args) =>
      /hydrat|did not match|server (?:HTML|rendered)/i.test(String(args[0])),
    )
    expect(hydrationErrors).toEqual([])

    // The portal lands after the hydration commit, outside the hydrated container.
    expect(document.querySelector('.pixel-overlay')).not.toBeNull()
    expect(container.querySelector('.pixel-overlay')).toBeNull()

    await act(async () => {
      root!.unmount()
    })
  })
})
