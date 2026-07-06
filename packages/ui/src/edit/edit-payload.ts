/**
 * Serialize the in-memory edit batch into an `EditPayload` the agent can apply
 * to source. Each change carries its element's DOM ancestor chain (the same
 * descriptor recordings use for clicks) so the agent locates the element the
 * same way. Changes are emitted in commit order; a later change to the same
 * (element, property) supersedes an earlier one when the agent applies `after`.
 */
import { describeElementPath } from '../capture/hittest'
import type { EditPayload } from '../types'
import type { EditEntry } from './edit-history'

export function buildEditPayload(batch: EditEntry[]): EditPayload {
  const changes = batch.flatMap((entry) =>
    entry.changes.map((c) => ({
      target: describeElementPath(c.target),
      kind: c.kind,
      name: c.name,
      before: c.before,
      after: c.after,
      // Present when `after` came from a design-token pick/snap — tells the agent
      // to write the symbolic spelling (var(--x) / bg-primary / palette.x) in
      // source instead of the resolved value.
      ...(c.source ? { source: c.source } : {}),
    })),
  )
  return {
    url: typeof location !== 'undefined' ? location.href : '',
    createdAt: Date.now(),
    changes,
  }
}
