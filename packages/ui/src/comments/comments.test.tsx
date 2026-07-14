import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PixelProvider } from '../PixelProvider'
import { Overlay } from '../Overlay'
import type { CommentPayload, RecordingSink } from '../types'
import { draftsToPayload, type CommentDraft } from './CommentLayer'

vi.mock('../capture/snapshot', () => ({
  captureFullFrame: async () => null,
  captureRegion: async () => null,
  captureStroke: async () => null,
}))

beforeEach(() => {
  document.elementFromPoint = (() => {
    const el = document.createElement('button')
    el.id = 'target-btn'
    el.className = 'primary'
    el.textContent = 'Upgrade'
    document.body.appendChild(el)
    return el
  }) as typeof document.elementFromPoint
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('pixel-commenting', 'pixel-editing')
})

function renderApp(sink?: Partial<RecordingSink>) {
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
        <h1>Hello</h1>
        <Overlay />
      </div>
    </PixelProvider>,
  )
}

describe('draftsToPayload', () => {
  it('drops empty bodies and keeps target + coords', () => {
    const drafts: CommentDraft[] = [
      { id: '1', x: 10, y: 20, body: '  tighten gap  ', target: [{ tag: 'div', classes: [] }] },
      { id: '2', x: 1, y: 2, body: '   ', target: [{ tag: 'span', classes: [] }] },
    ]
    expect(draftsToPayload(drafts)).toEqual([
      { target: [{ tag: 'div', classes: [] }], body: 'tighten gap', x: 10, y: 20 },
    ])
  })
})

describe('comment mode', () => {
  it('toggles comment mode from the bar and hides Rec/Edit while active', async () => {
    renderApp()
    const comment = screen.getByRole('button', { name: 'Comment' })
    expect(comment.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(comment)
    await waitFor(() => {
      expect(document.querySelector('.pixel-rec.commenting')).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Start recording|Rec/i })).toBeNull()
    expect(screen.getByText('Commenting')).toBeTruthy()
  })

  it('places a pin on click, edits text, and Saves a CommentPayload', async () => {
    let saved: CommentPayload | null = null
    renderApp({
      saveComments: async (p) => {
        saved = p
        return { id: 'c1' }
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(document.querySelector('.pixel-rec.commenting')).toBeTruthy())

    fireEvent.click(document.body, { clientX: 120, clientY: 80, bubbles: true })
    // CommentLayer listens on window capture — dispatch there.
    const click = new MouseEvent('click', { clientX: 120, clientY: 80, bubbles: true, cancelable: true })
    window.dispatchEvent(click)

    await waitFor(() => expect(screen.getByPlaceholderText('Leave a comment…')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('Leave a comment…'), {
      target: { value: 'Make this primary' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    // Second pin — one Save must POST both together.
    window.dispatchEvent(
      new MouseEvent('click', { clientX: 200, clientY: 120, bubbles: true, cancelable: true }),
    )
    await waitFor(() => expect(screen.getByPlaceholderText('Leave a comment…')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('Leave a comment…'), {
      target: { value: 'Tighten spacing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    const save = screen.getByRole('button', { name: 'Save 2 comments' })
    fireEvent.click(save)
    await waitFor(() => expect(saved).not.toBeNull())
    expect(saved!.comments).toHaveLength(2)
    expect(saved!.comments.map((c) => c.body).sort()).toEqual([
      'Make this primary',
      'Tighten spacing',
    ])
    expect(saved!.comments[0].target.some((t) => t.id === 'target-btn' || t.tag === 'button')).toBe(
      true,
    )
  })

  it('Cancel with pins shows a confirm dialog; Discard exits', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(document.querySelector('.pixel-rec.commenting')).toBeTruthy())
    window.dispatchEvent(
      new MouseEvent('click', { clientX: 50, clientY: 50, bubbles: true, cancelable: true }),
    )
    await waitFor(() => expect(screen.getByPlaceholderText('Leave a comment…')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => {
      expect(document.querySelector('.pixel-rec.commenting')).toBeNull()
    })
    expect(screen.getByRole('button', { name: 'Comment' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('modes are mutually exclusive — cannot start recording while commenting', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(document.querySelector('.pixel-rec.commenting')).toBeTruthy())
    // Rec control is hidden; double-Space is gated in start().
    expect(screen.queryByRole('button', { name: /Rec/i })).toBeNull()
  })
})
