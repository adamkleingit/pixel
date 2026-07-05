import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Whisper model (multilingual by default so non-English narration works). */
const MODEL = process.env.PIXEL_WHISPER_MODEL ?? 'Xenova/whisper-base'
/** Spoken language, e.g. 'hebrew' or 'english'. Unset → Whisper auto-detects. */
const LANGUAGE = process.env.PIXEL_WHISPER_LANG || undefined
/** 'transcribe' (same language) or 'translate' (→ English). */
const TASK = process.env.PIXEL_WHISPER_TASK || 'transcribe'
const SAMPLE_RATE = 16000

export interface TranscriptSegment {
  /** seconds from start of audio */
  start: number
  end: number
  text: string
}

export interface Transcript {
  model: string
  language?: string
  text: string
  segments: TranscriptSegment[]
  createdAt: number
}

export interface TranscribeOptions {
  /** Spoken language (e.g. 'hebrew'); overrides PIXEL_WHISPER_LANG. */
  language?: string
}

/** Pluggable transcriber. The default is Whisper via Transformers.js (§8.4). */
export interface Transcriber {
  transcribe(audioPath: string, opts?: TranscribeOptions): Promise<Transcript>
}

// ---- ffmpeg decode (webm/opus → 16kHz mono Float32) -------------------------

async function decodeToFloat32(audioPath: string): Promise<Float32Array> {
  // Lazily resolve a bundled ffmpeg binary; fall back to a PATH `ffmpeg`.
  let ffmpeg = 'ffmpeg'
  try {
    const mod = await import('ffmpeg-static')
    if (mod.default) ffmpeg = mod.default as string
  } catch {
    /* use PATH ffmpeg */
  }

  return await new Promise<Float32Array>((resolve, reject) => {
    const args = [
      '-i', audioPath,
      '-f', 'f32le',
      '-acodec', 'pcm_f32le',
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      'pipe:1',
    ]
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => chunks.push(d))
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`))
      const buf = Buffer.concat(chunks)
      // Copy into an aligned ArrayBuffer for Float32Array.
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      resolve(new Float32Array(ab))
    })
  })
}

// ---- Whisper via Transformers.js (lazy, singleton) --------------------------

let pipePromise: Promise<unknown> | null = null

async function getPipeline(): Promise<unknown> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers')
      console.log(`[pixel] loading Whisper model "${MODEL}" (first run downloads it)…`)
      const p = await pipeline('automatic-speech-recognition', MODEL)
      console.log('[pixel] Whisper model ready')
      return p
    })()
  }
  return pipePromise
}

export const whisperTranscriber: Transcriber = {
  async transcribe(audioPath: string, callOpts?: TranscribeOptions): Promise<Transcript> {
    const language = callOpts?.language || LANGUAGE
    const audio = await decodeToFloat32(audioPath)
    const transcriber = (await getPipeline()) as (
      audio: Float32Array,
      opts: Record<string, unknown>,
    ) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>

    const opts: Record<string, unknown> = {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      task: TASK,
    }
    // Only set language when provided; omitting lets Whisper default to English.
    if (language) opts.language = language
    const out = await transcriber(audio, opts)

    const segments: TranscriptSegment[] = (out.chunks ?? []).map((c) => ({
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
      text: c.text.trim(),
    }))

    return {
      model: MODEL,
      language,
      text: out.text.trim(),
      segments,
      createdAt: Date.now(),
    }
  },
}

/**
 * A deterministic transcriber that ignores the audio and returns a transcript
 * read from a JSON file. Used for tests (set `PIXEL_TRANSCRIBE_MOCK` to
 * the fixture path) so the pipeline runs without loading Whisper or ffmpeg. The
 * fixture supplies at least `text` + `segments`; other fields are defaulted.
 */
export function fileTranscriber(jsonPath: string): Transcriber {
  return {
    async transcribe(_audioPath: string, callOpts?: TranscribeOptions): Promise<Transcript> {
      const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as Partial<Transcript>
      return {
        model: raw.model ?? 'mock',
        language: raw.language ?? callOpts?.language,
        text: raw.text ?? '',
        segments: raw.segments ?? [],
        createdAt: Date.now(),
      }
    },
  }
}

/**
 * Transcribes a saved recording's audio (best-effort) and writes
 * `transcript.json` into its directory. Never throws — logs and returns.
 */
export async function transcribeRecording(
  dir: string,
  opts: TranscribeOptions = {},
  transcriber: Transcriber = whisperTranscriber,
): Promise<void> {
  const audioPath = join(dir, 'audio.webm')
  if (!existsSync(audioPath)) return
  try {
    const t0 = Date.now()
    const transcript = await transcriber.transcribe(audioPath, opts)
    await writeFile(join(dir, 'transcript.json'), JSON.stringify(transcript, null, 2))
    console.log(
      `[pixel] transcribed ${dir.split('/').pop()} — ` +
        `${transcript.segments.length} segments in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    )
  } catch (err) {
    console.warn('[pixel] transcription failed (recording still saved):', err)
  }
}
