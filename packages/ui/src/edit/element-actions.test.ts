import { afterEach, describe, expect, it } from 'vitest'
import { deleteElements, duplicateElements } from './element-actions'

afterEach(() => {
  document.body.innerHTML = ''
})

function fixture() {
  const parent = document.createElement('div')
  parent.innerHTML = '<span id="a">A</span><span id="b">B</span>'
  document.body.appendChild(parent)
  return {
    parent,
    a: parent.querySelector('#a') as HTMLElement,
    b: parent.querySelector('#b') as HTMLElement,
  }
}

describe('deleteElements', () => {
  it('emits one remove change per element with its re-insert anchor', () => {
    const { a, b } = fixture()
    const result = deleteElements([a])!
    expect(result.select).toEqual([])
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toMatchObject({ target: a, kind: 'remove', anchor: b })
  })

  it('acts on the whole selection, reduced to the topmost elements', () => {
    const { parent, a } = fixture()
    // parent + descendant both selected → only the parent is removed.
    const result = deleteElements([parent, a])!
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].target).toBe(parent)
    expect(result.label).toBe('delete')
  })

  it('returns null when nothing is actionable (detached / root)', () => {
    const orphan = document.createElement('div') // no parent
    expect(deleteElements([orphan])).toBeNull()
    expect(deleteElements([])).toBeNull()
  })
})

describe('duplicateElements', () => {
  it('clones each element and inserts the copy right after it', () => {
    const { a, b } = fixture()
    const result = duplicateElements([a])!
    expect(result.select).toHaveLength(1)
    const clone = result.select[0]
    expect(clone).not.toBe(a)
    expect(clone.id).toBe('a') // deep clone preserves markup
    expect(result.changes[0]).toMatchObject({ target: clone, kind: 'insert', anchor: b })
  })

  it('reduces a parent+descendant selection to the topmost element', () => {
    const { parent, a } = fixture()
    const result = duplicateElements([a, parent])!
    expect(result.select).toHaveLength(1)
    expect(result.changes[0].target).not.toBe(a)
    expect(result.label).toBe('duplicate')
  })
})
