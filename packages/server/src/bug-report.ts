/**
 * Bug-report upload — mints scoped Vercel Blob client-upload tokens so the
 * in-app "Report a bug" button can upload a screen recording (+ meta.json)
 * straight to Blob. The browser talks to THIS server (which it's already
 * connected to) for the token; the recording bytes go directly to Blob, and the
 * `BLOB_READ_WRITE_TOKEN` secret never leaves the server.
 *
 * Reports land at `bug-reports/<id>/recording.webm` + `.../meta.json`. Enabled
 * only when `BLOB_READ_WRITE_TOKEN` is set in the server's environment.
 */
import { list } from '@vercel/blob'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import type { Request, Response } from 'express'

const ALLOWED_CONTENT_TYPES = [
  'video/webm',
  'audio/webm',
  'video/mp4',
  'application/json',
  'image/png',
  'image/jpeg',
]

/** True when the server can mint Blob upload tokens (the RW secret is present). */
export function bugReportEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

/**
 * Express handler for `POST /bug-report`. `@vercel/blob/client`'s `handleUpload`
 * both mints the client token (on the browser's initial request) and would
 * receive the completion webhook — but that webhook can't reach localhost, which
 * is fine: the upload succeeds client→Blob regardless.
 */
export async function handleBugReportUpload(req: Request, res: Response): Promise<void> {
  if (!bugReportEnabled()) {
    res.status(501).json({ error: 'bug reporting not configured — set BLOB_READ_WRITE_TOKEN' })
    return
  }
  try {
    const json = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Scope the minted token: only the report folder, only media/json, capped.
        if (!pathname.startsWith('bug-reports/')) {
          throw new Error('pathname must be under bug-reports/')
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          addRandomSuffix: false,
          maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB
        }
      },
      onUploadCompleted: async () => {}, // not called for localhost; no-op
    })
    res.status(200).json(json)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
}

export interface BugReportSummary {
  id: string
  files: { pathname: string; url: string; size: number }[]
}

/** List stored bug reports grouped by id (newest first). */
export async function listBugReports(): Promise<BugReportSummary[]> {
  const { blobs } = await list({ prefix: 'bug-reports/' })
  const byId: Record<string, BugReportSummary['files']> = {}
  for (const b of blobs) {
    const id = b.pathname.split('/')[1] ?? 'unknown'
    ;(byId[id] ??= []).push({ pathname: b.pathname, url: b.url, size: b.size })
  }
  return Object.entries(byId)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([id, files]) => ({ id, files }))
}
