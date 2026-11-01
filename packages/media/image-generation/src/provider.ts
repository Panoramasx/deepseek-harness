/** Provider calls for OpenAI Images and Volcengine Ark Seedream. @module @deepseek-ai/dsh-image-generation/provider */

/** Runtime configuration saved by the Settings > Plugins > Image generation tab. */
export interface ImageConfig {
  readonly provider: 'openai' | 'seedream'
  readonly model: string
  readonly baseUrl?: string
  readonly key: string
}

/** One generated PNG in memory. */
export interface GeneratedImage {
  readonly data: Uint8Array
  readonly mediaType: 'image/png'
  readonly provider: ImageConfig['provider']
  readonly model: string
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const OPENAI_BASE = 'https://api.openai.com/v1'
const SEEDREAM_BASE = 'https://ark.cn-beijing.volces.com/api/v3'

/** Map a requested aspect ratio to the closest supported 1024-ish canvas. */
export function sizeFor(aspect: string | undefined): string {
  switch (aspect) {
    case '16:9': return '1536x1024'
    case '9:16': return '1024x1536'
    case '4:3': return '1536x1024'
    case '3:4': return '1024x1536'
    default: return '1024x1024'
  }
}

function baseUrl(config: ImageConfig): string {
  const fallback = config.provider === 'openai' ? OPENAI_BASE : SEEDREAM_BASE
  return (config.baseUrl ?? fallback).replace(/\/+$/u, '')
}

function decodeBase64(value: string): Uint8Array {
  const buffer = Buffer.from(value, 'base64')
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('image provider returned an empty or oversized image')
  if (Buffer.from(buffer.subarray(0, 8)).toString('hex') !== '89504e470d0a1a0a') throw new Error('image provider did not return a PNG')
  return new Uint8Array(buffer)
}

async function download(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('image provider returned a non-HTTPS image URL')
  const response = await fetch(url, { redirect: 'error', signal })
  if (!response.ok) throw new Error(`image download failed: HTTP ${String(response.status)}`)
  const length = Number(response.headers.get('content-length') ?? '0')
  if (length > MAX_IMAGE_BYTES) throw new Error('image download is too large')
  const buffer = new Uint8Array(await response.arrayBuffer())
  if (buffer.byteLength > MAX_IMAGE_BYTES || Buffer.from(buffer.subarray(0, 8)).toString('hex') !== '89504e470d0a1a0a') throw new Error('image download is not a bounded PNG')
  return buffer
}

/** Generate one PNG; errors are bounded provider diagnostics, never the key. */
export async function generateImage(config: ImageConfig, prompt: string, aspect: string | undefined): Promise<GeneratedImage> {
  if (config.key.trim() === '') throw new Error('image generation is not configured: save an API key in Settings > Plugins > Image generation')
  const size = sizeFor(aspect)
  const endpoint = `${baseUrl(config)}/images/generations`
  const body = config.provider === 'openai'
    ? { model: config.model, prompt, size, n: 1, response_format: 'b64_json' }
    : { model: config.model, prompt, size, response_format: 'b64_json', watermark: false }
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, 120_000)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`image provider failed: HTTP ${String(response.status)} ${text.slice(0, 500)}`)
    const parsed = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> }
    const first = parsed.data?.[0]
    if (first === undefined) throw new Error('image provider returned no image')
    const data = first.b64_json !== undefined ? decodeBase64(first.b64_json)
      : first.url !== undefined ? await download(first.url, controller.signal)
        : undefined
    if (data === undefined) throw new Error('image provider returned neither base64 data nor a URL')
    return { data, mediaType: 'image/png', provider: config.provider, model: config.model }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('image generation timed out')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
