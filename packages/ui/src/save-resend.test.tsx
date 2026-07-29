import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PixelProvider } from './PixelProvider'
import { Overlay } from './Overlay'
import { applyPatch } from './edit/patch'
import type { CommentPayload, EditPayload, RecordingSink } from './types'

vi.mock('./capture/snapshot', () => ({
  captureFullFrame: async () => null,
  captureRegion: async () => null,
  captureStroke: async () => null,
}))

beforeEach(() => {
  document.elementFromPoint = (() => {
    const el = document.createElement('button')
    el.id = 'target-btn'
    el.textContent = 'Upgrade'
    document.body.appendChild(el)
    return el
  }) as typeof document.elementFromPoint
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  document.documentElement.classList.remove('pixel-commenting', 'pixel-editing')
})

function renderApp(sink: Partial<RecordingSink>) {
  const full: RecordingSink = {
    save: async () => ({ id: 'rec' }),
    saveEdits: async () => ({ id: 'edit' }),
    saveComments: async () => ({ id: 'comment' }),
    listTasks: async () => [],
    ...sink,
  }
  return render(
    <PixelProvider config={{ bar: { always: true }, sink: full, onboarding: false }}>
      <div>
        <h1 data-testid="heading">Hello</h1>
        <Overlay />
      </div>
    </PixelProvider>,
  )
}

const resendBtn = () => screen.getByRole('button', { name: 'Resend' })

/**
 * The server being down when the user hits Save must not strand the work: the
 * failure toast's Resend has to deliver the very same batch the failed Save
 * carried, for edits and comments — not just for recordings.
 */
describe('save failure → Resend', () => {
  it('re-delivers a comment batch after the first save fails', async () => {
    const delivered: CommentPayload[] = []
    let down = true
    renderApp({
      saveComments: async (p) => {
        if (down) throw new TypeError('Failed to fetch')
        delivered.push(p)
        return { id: 'c1' }
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(document.querySelector('.pixel-rec.commenting')).toBeTruthy())

    // Drop a pin (CommentLayer listens on window capture) and write a body.
    window.dispatchEvent(
      new MouseEvent('click', { clientX: 120, clientY: 80, bubbles: true, cancelable: true }),
    )
    await waitFor(() => expect(screen.getByPlaceholderText('Leave a comment…')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('Leave a comment…'), {
      target: { value: 'Make this primary' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save 1 comment' }))
    await waitFor(() => expect(resendBtn()).toBeTruthy())
    expect(delivered).toHaveLength(0)

    // Server is back — Resend must post the same batch, clear the toast, and
    // leave comment mode just like a first-try Save would have.
    down = false
    fireEvent.click(resendBtn())
    await waitFor(() => expect(delivered).toHaveLength(1))
    expect(delivered[0].comments.map((c) => c.body)).toEqual(['Make this primary'])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resend' })).toBeNull())
    expect(document.querySelector('.pixel-rec.commenting')).toBeNull()
  })

  it('re-delivers an edit batch after the first save fails', async () => {
    const delivered: EditPayload[] = []
    let down = true
    renderApp({
      saveEdits: async (p) => {
        if (down) throw new TypeError('Failed to fetch')
        delivered.push(p)
        return { id: 'e1' }
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(document.querySelector('.pixel-rec.editing')).toBeTruthy())

    applyPatch(screen.getByTestId('heading'), {
      kind: 'setStyle',
      property: 'padding',
      value: '20px',
    })

    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(resendBtn()).toBeTruthy())
    expect(delivered).toHaveLength(0)

    down = false
    fireEvent.click(resendBtn())
    await waitFor(() => expect(delivered).toHaveLength(1))
    expect(delivered[0].changes).toHaveLength(1)
    expect(delivered[0].changes[0]).toMatchObject({ kind: 'style', name: 'padding', after: '20px' })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resend' })).toBeNull())
    expect(document.querySelector('.pixel-rec.editing')).toBeNull()
  })
})
