/**
 * Tokens context — exposes the project's design-tokens TokenSet to the canvas
 * UI. In Pixel this is fetched once at App level via the `tokens.get` RPC. In
 * the screenshare port there is no agent, so the provider supplies an empty
 * token set by default; the token pickers render gracefully and never crash.
 *
 * Read pattern: `useTokens()` for the whole response, `useTokensOf(kind)` for
 * the filtered list a particular property picker needs. Read-only.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Token, TokenKind } from './pixel-common'

export interface TokenSet {
  tokens: Token[]
}

export interface TokensResponse {
  tokenSet: TokenSet | null
}

interface TokensContextValue {
  response: TokensResponse | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const TokensCtx = createContext<TokensContextValue | null>(null)

const EMPTY_RESPONSE: TokensResponse = { tokenSet: { tokens: [] } }

export function TokensProvider({
  tokens = [],
  children,
}: {
  /** Optional token list. Defaults to an empty set (no project tokens). */
  tokens?: Token[]
  children: ReactNode
}) {
  const value = useMemo<TokensContextValue>(
    () => ({
      response: { tokenSet: { tokens } },
      loading: false,
      error: null,
      refresh: async () => {},
    }),
    [tokens],
  )
  return <TokensCtx.Provider value={value}>{children}</TokensCtx.Provider>
}

/** Full tokens response + load/refresh controls. Returns sane defaults when no
 *  provider is mounted (test/storybook). */
export function useTokens(): TokensContextValue {
  return (
    useContext(TokensCtx) ?? {
      response: EMPTY_RESPONSE,
      loading: false,
      error: null,
      refresh: async () => {},
    }
  )
}

/** Tokens filtered to a given kind. Stable identity per (response, kind) so a
 *  picker can use it as a dep without thrashing. */
export function useTokensOf(kind: TokenKind | null): Token[] {
  const { response } = useTokens()
  return useMemo(() => {
    if (!response?.tokenSet || !kind) return []
    return response.tokenSet.tokens.filter(t => t.kind === kind)
  }, [response, kind])
}
