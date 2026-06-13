import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { describeElementChain } from './hittest'

// jsdom has no layout engine and doesn't define elementFromPoint, so we stub it.
const originalEFP = (document as any).elementFromPoint
/** Point elementFromPoint at a specific element. */
function hitOn(el: Element | null) {
  ;(document as any).elementFromPoint = () => el
}

describe('describeElementChain', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  afterEach(() => {
    ;(document as any).elementFromPoint = originalEFP
  })

  it('returns [] when nothing is under the point', () => {
    hitOn(null)
    expect(describeElementChain(0, 0)).toEqual([])
  })

  it('returns the ancestor chain ordered outermost → innermost, excluding html/body', () => {
    document.body.innerHTML = `<div class="grid"><div class="card"><button id="go" class="btn">Upgrade</button></div></div>`
    const btn = document.getElementById('go')!
    hitOn(btn)

    const chain = describeElementChain(10, 10)
    expect(chain.map((c) => c.tag)).toEqual(['div', 'div', 'button'])
    expect(chain[0].classes).toEqual(['grid'])
    expect(chain[2]).toMatchObject({ tag: 'button', id: 'go', classes: ['btn'], text: 'Upgrade' })
  })

  it('filters out the screenshare overlay nodes defensively', () => {
    document.body.innerHTML = `<div class="screenshare-overlay"><span class="real">hi</span></div>`
    const span = document.querySelector('.real')!
    hitOn(span)

    const chain = describeElementChain(0, 0)
    expect(chain.map((c) => c.tag)).toEqual(['span'])
    expect(chain.some((c) => c.classes.some((k) => k.startsWith('screenshare-')))).toBe(false)
  })

  it('collapses whitespace and truncates long text', () => {
    const long = 'word '.repeat(60) // ~300 chars with runs of whitespace
    document.body.innerHTML = `<p>${long}</p>`
    const p = document.querySelector('p')!
    hitOn(p)

    const [info] = describeElementChain(0, 0)
    expect(info.text!.endsWith('…')).toBe(true)
    expect(info.text!.length).toBe(121) // 120 chars + ellipsis
    expect(info.text).not.toMatch(/\s{2,}/) // whitespace runs collapsed
  })

  it('omits id/text fields when absent', () => {
    document.body.innerHTML = `<section></section>`
    hitOn(document.querySelector('section'))
    const [info] = describeElementChain(0, 0)
    expect(info).toEqual({ tag: 'section', classes: [] })
  })
})
