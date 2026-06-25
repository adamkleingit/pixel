import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScreenshareProvider } from './ScreenshareProvider'
import { Overlay } from './Overlay'
import { useScreenshare } from './useScreenshare'

const STYLE_ID = 'screenshare-styles'

/** Surfaces edit + recording state so tests can assert composition. */
function Probe() {
  const { state, editing } = useScreenshare()
  return <div data-testid="probe">{`${state}/${editing ? 'editing' : 'view'}`}</div>
}

function renderApp(enabled = true) {
  return render(
    <ScreenshareProvider isEnabled={enabled} config={{ bar: { always: true } }}>
      <Probe />
      <Overlay />
    </ScreenshareProvider>,
  )
}

/** Two Enter keydowns within the double-tap window (synchronous → counts as double). */
function doublePressEnter() {
  fireEvent.keyDown(document, { code: 'Enter' })
  fireEvent.keyDown(document, { code: 'Enter' })
}

const editBtn = () => screen.getByRole('button', { name: 'Edit' })
const probeText = () => screen.getByTestId('probe').textContent

afterEach(() => {
  cleanup()
  document.getElementById(STYLE_ID)?.remove()
})

describe('edit mode — pencil toggle', () => {
  it('the pencil enters and exits edit mode', () => {
    renderApp()
    expect(editBtn().getAttribute('aria-pressed')).toBe('false')
    expect(probeText()).toBe('idle/view')

    fireEvent.click(editBtn())
    expect(editBtn().getAttribute('aria-pressed')).toBe('true')
    expect(probeText()).toBe('idle/editing')
    // The bar reflects the editing state for styling hooks.
    expect(document.querySelector('.screenshare-rec.editing')).not.toBeNull()

    fireEvent.click(editBtn())
    expect(editBtn().getAttribute('aria-pressed')).toBe('false')
    expect(probeText()).toBe('idle/view')
    expect(document.querySelector('.screenshare-rec.editing')).toBeNull()
  })
})

describe('edit mode — keyboard', () => {
  it('double-Enter enters edit mode; Esc exits it', () => {
    renderApp()
    doublePressEnter()
    expect(probeText()).toBe('idle/editing')

    fireEvent.keyDown(document, { code: 'Escape' })
    expect(probeText()).toBe('idle/view')
  })

  it('a single Enter does not enter edit mode', () => {
    renderApp()
    fireEvent.keyDown(document, { code: 'Enter' })
    expect(probeText()).toBe('idle/view')
  })
})

describe('edit mode — composition with recording', () => {
  it('edit and recording are independent: the Rec button stays available while editing', () => {
    renderApp()
    fireEvent.click(editBtn())
    expect(probeText()).toBe('idle/editing')
    // Recording is orthogonal — its idle entry point is still present (you can
    // start a recording while editing; §4.3).
    expect(screen.getByTitle('Start recording (double-tap Space)')).toBeTruthy()
    // And the edit toggle stays available regardless of recording state.
    expect(editBtn()).toBeTruthy()
  })
})

describe('edit mode — inert when disabled', () => {
  it('does not enter edit mode when isEnabled=false (pencil + double-Enter are no-ops)', () => {
    renderApp(false)
    fireEvent.click(editBtn())
    expect(probeText()).toBe('idle/view')
    doublePressEnter()
    expect(probeText()).toBe('idle/view')
  })
})

describe('edit mode — selection', () => {
  const anchor = () => document.querySelector('.screenshare-sel-anchor')

  it('pointerdown selects and draws an anchor outline; bar pointerdowns are ignored; exit clears it', () => {
    render(
      <ScreenshareProvider config={{ bar: { always: true } }}>
        <button data-testid="page-btn">App button</button>
        <Probe />
        <Overlay />
      </ScreenshareProvider>,
    )
    const pageBtn = screen.getByTestId('page-btn')

    // Not editing → the selection controller isn't even mounted.
    fireEvent.pointerDown(pageBtn)
    expect(anchor()).toBeNull()

    // Enter edit; nothing selected yet → no outline.
    fireEvent.click(editBtn())
    expect(anchor()).toBeNull()

    // Pointerdown on our own bar (the pencil) is ignored — no selection.
    fireEvent.pointerDown(editBtn())
    expect(anchor()).toBeNull()
    expect(probeText()).toBe('idle/editing')

    // Pointerdown a page element → an anchor outline appears.
    fireEvent.pointerDown(pageBtn)
    expect(anchor()).not.toBeNull()

    // Escape clears the selection but stays in edit mode (two-stage Escape).
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(anchor()).toBeNull()
    expect(probeText()).toBe('idle/editing')

    // Exit edit → the selection controller unmounts.
    fireEvent.click(editBtn())
    expect(anchor()).toBeNull()
    expect(probeText()).toBe('idle/view')
  })
})

describe('edit mode — design pane', () => {
  const pane = () => document.querySelector('.screenshare-pane')

  it('docks on edit (shrinking the body), inspects the selection, collapses, and restores on exit', () => {
    render(
      <ScreenshareProvider config={{ bar: { always: true } }}>
        <button data-testid="page-btn">App button</button>
        <Probe />
        <Overlay />
      </ScreenshareProvider>,
    )
    const html = document.documentElement

    // Not editing → no pane, body not shrunk.
    expect(pane()).toBeNull()

    // Enter edit → the pane appears immediately and shrinks the body.
    fireEvent.click(editBtn())
    expect(pane()).not.toBeNull()
    expect(html.style.marginRight).toBe('280px')
    expect(document.querySelector('.screenshare-pane-empty')).not.toBeNull() // nothing selected

    // Select an element → the pane inspects it.
    fireEvent.pointerDown(screen.getByTestId('page-btn'))
    expect(document.querySelector('.screenshare-pane-tag')).not.toBeNull()
    // The editable design sections render for the selection.
    expect(document.querySelectorAll('.screenshare-ds-section').length).toBeGreaterThan(0)

    // Collapse (like the recording menu's minimize) → frees the width, hides body.
    fireEvent.click(document.querySelector('.screenshare-pane-collapse')!)
    expect(document.querySelector('.screenshare-pane.collapsed')).not.toBeNull()
    expect(document.querySelector('.screenshare-pane-body')).toBeNull()
    expect(html.style.marginRight).toBe('0px')

    // Exit edit → pane gone, body margin restored.
    fireEvent.click(editBtn())
    expect(pane()).toBeNull()
    expect(html.style.marginRight).toBe('')
  })

  it('is resizable by dragging the left edge (body margin tracks the width)', () => {
    render(
      <ScreenshareProvider config={{ bar: { always: true } }}>
        <Probe />
        <Overlay />
      </ScreenshareProvider>,
    )
    const html = document.documentElement
    fireEvent.click(editBtn())
    expect(html.style.marginRight).toBe('280px')

    const handle = document.querySelector('.screenshare-pane-resize')!
    // Drag left by 100px → pane (and the reserved body width) grows to 380px.
    fireEvent.pointerDown(handle, { clientX: 1000, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 900, pointerId: 1 })
    expect(html.style.marginRight).toBe('380px')
  })
})

describe('edit mode — app inert', () => {
  it('swallows page clicks while editing and restores them on exit; the bar still works', () => {
    const onPageClick = vi.fn()
    render(
      <ScreenshareProvider config={{ bar: { always: true } }}>
        <button data-testid="page-btn" onClick={onPageClick}>
          App button
        </button>
        <Probe />
        <Overlay />
      </ScreenshareProvider>,
    )
    const pageBtn = screen.getByTestId('page-btn')

    // Not editing → the page button reacts normally.
    fireEvent.click(pageBtn)
    expect(onPageClick).toHaveBeenCalledTimes(1)

    // Enter edit (clicking the bar pencil works — it's our own UI) → page clicks
    // are swallowed.
    fireEvent.click(editBtn())
    expect(probeText()).toBe('idle/editing')
    fireEvent.click(pageBtn)
    expect(onPageClick).toHaveBeenCalledTimes(1) // unchanged — swallowed

    // Exit edit (the bar pencil still receives its click) → the page reacts again.
    fireEvent.click(editBtn())
    expect(probeText()).toBe('idle/view')
    fireEvent.click(pageBtn)
    expect(onPageClick).toHaveBeenCalledTimes(2)
  })
})
