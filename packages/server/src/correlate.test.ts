import { describe, expect, it } from 'vitest'
import { buildTimeline } from './correlate'

// Helpers to build the loosely-typed event/segment shapes buildTimeline consumes.
const click = (t: number, target: any[] = []) => ({ kind: 'click', t, x: 0, y: 0, target })
const pointer = (t: number) => ({ kind: 'pointer', t })
const rect = (t: number) => ({ kind: 'rect', t, x: 1, y: 2, width: 3, height: 4, startT: t, endT: t })
const seg = (start: number, end: number, text: string) => ({ start, end, text })

describe('buildTimeline', () => {
  it('reports no transcript and passes through duration when there are no segments', () => {
    const tl = buildTimeline([click(100)], [], 5000)
    expect(tl.hasTranscript).toBe(false)
    expect(tl.durationMs).toBe(5000)
  })

  it('flags hasTranscript once segments are present', () => {
    const tl = buildTimeline([], [seg(0, 1, 'hello')], 1000)
    expect(tl.hasTranscript).toBe(true)
    expect(tl.beats).toHaveLength(1)
    expect(tl.beats[0]).toMatchObject({ kind: 'speech', text: 'hello', startMs: 0, endMs: 1000 })
  })

  it('groups an event inside a speech span into that beat', () => {
    // span 0-1000ms; click at 500ms is inside it
    const tl = buildTimeline([click(500)], [seg(0, 1, 'a')], 1000)
    const speech = tl.beats.find((b) => b.kind === 'speech')!
    expect(speech.items).toHaveLength(1)
    expect(speech.items[0].type).toBe('click')
  })

  it('assigns an event just outside a span to it within the 500ms threshold', () => {
    // span 0-1000ms; click at 1400ms is 400ms past the end → still in span
    const tl = buildTimeline([click(1400)], [seg(0, 1, 'a')], 2000)
    const speech = tl.beats.find((b) => b.kind === 'speech')!
    expect(speech.items).toHaveLength(1)
    expect(tl.beats.some((b) => b.kind === 'silence')).toBe(false)
  })

  it('puts an event beyond the threshold into its own silence beat', () => {
    // span 0-1000ms; click at 1600ms is 600ms past → silence
    const tl = buildTimeline([click(1600)], [seg(0, 1, 'a')], 2000)
    const speech = tl.beats.find((b) => b.kind === 'speech')!
    const silence = tl.beats.find((b) => b.kind === 'silence')!
    expect(speech.items).toHaveLength(0)
    expect(silence).toBeDefined()
    expect(silence.items).toHaveLength(1)
  })

  it('counts pointer samples rather than listing them as items', () => {
    const tl = buildTimeline([pointer(100), pointer(200), click(300)], [seg(0, 1, 'a')], 1000)
    const speech = tl.beats.find((b) => b.kind === 'speech')!
    expect(speech.pointerCount).toBe(2)
    expect(speech.items).toHaveLength(1) // only the click
  })

  it('groups nearby silence events into one beat and splits distant ones', () => {
    // no spans → everything is silence. 100 & 1000 are <1500ms apart (one beat);
    // 4000 is >1500ms after 1000 (new beat).
    const tl = buildTimeline([rect(100), rect(1000), rect(4000)], [], 0)
    const silence = tl.beats.filter((b) => b.kind === 'silence')
    expect(silence).toHaveLength(2)
    expect(silence[0].items).toHaveLength(2)
    expect(silence[1].items).toHaveLength(1)
    expect(silence[0].startMs).toBe(100)
    expect(silence[0].endMs).toBe(1000)
  })

  it('extracts frame events into frames[] instead of beats', () => {
    const frame = { kind: 'frame', t: 0, reason: 'start', snapshot: 'data:img', width: 800, height: 600 }
    const tl = buildTimeline([frame as any, click(100)], [seg(0, 1, 'a')], 1000)
    expect(tl.frames).toHaveLength(1)
    expect(tl.frames[0]).toMatchObject({ reason: 'start', width: 800, height: 600 })
    // the frame must not appear as an item in any beat
    expect(tl.beats.flatMap((b) => b.items)).toHaveLength(1)
  })

  it('builds a readable summary from a click target chain', () => {
    const target = [
      { tag: 'div', classes: ['grid'] },
      { tag: 'div', classes: ['card'] },
      { tag: 'button', classes: ['btn'], text: 'Upgrade' },
    ]
    const tl = buildTimeline([click(500, target)], [seg(0, 1, 'a')], 1000)
    const item = tl.beats.find((b) => b.kind === 'speech')!.items[0]
    expect(item.summary).toBe('div.grid > div.card > button.btn "Upgrade"')
    expect(item.element).toMatchObject({ tag: 'button', text: 'Upgrade' })
  })

  it('sorts items within a beat by time', () => {
    const tl = buildTimeline([click(800), click(200), click(500)], [seg(0, 1, 'a')], 1000)
    const speech = tl.beats.find((b) => b.kind === 'speech')!
    expect(speech.items.map((i) => i.t)).toEqual([200, 500, 800])
  })

  it('chooses the nearer of two adjacent spans for an in-between event', () => {
    // spans 0-1000 and 2000-3000; click at 1900 is 900ms from span0, 100ms from span1
    const tl = buildTimeline([click(1900)], [seg(0, 1, 'a'), seg(2, 3, 'b')], 3000)
    const beats = tl.beats.filter((b) => b.kind === 'speech')
    expect(beats[0].items).toHaveLength(0)
    expect(beats[1].items).toHaveLength(1)
  })
})
