import { afterEach, describe, expect, it } from 'vitest'
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
