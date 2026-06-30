// Stub of the canvas agent-client — only the types/values ported code references.
// In-app there is no agent RPC; edits flow through the change tracker.
import type { TokenSource } from './pixel-common'

export interface Change {
  property: string
  previousValue: string
  newValue: string
  source?: TokenSource
}

export interface ElementLocator {
  /** CSS-ish path; unused in-app (we operate on live element refs). */
  path: string
}

export type SourceLocation = { filePath: string; line: number; column: number }
export type ChangeTarget = 'element' | 'story'
export type Variants = { kind: 'single' } | { kind: 'all' } | { kind: 'list'; storyIds: string[] }
export interface ApplyChangeParams {
  storyId: string
  changes: Change[]
}
export type AgentStatus = 'open' | 'connecting' | 'reconnecting' | 'disabled'
export interface SourceSnapshot { source: string }
export interface AgentClient {
  status: AgentStatus
}
export class AgentDisconnectedError extends Error {}
