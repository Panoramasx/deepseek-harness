import { afterEach, expect, it, vi } from 'vitest'
import { generateImage, sizeFor } from '../src/provider.ts'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

afterEach(() => { vi.unstubAllGlobals() })

it('maps aspect ratios to bounded canvases', () => {
  expect(sizeFor(undefined)).toBe('1024x1024')
  expect(sizeFor('16:9')).toBe('1536x1024')
  expect(sizeFor('9:16')).toBe('1024x1536')
})

it('calls OpenAI Images and returns PNG bytes', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: PNG.toString('base64') }] }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  const result = await generateImage({ provider: 'openai', model: 'gpt-image-1', key: 'secret' }, 'a red fox', '1:1')
  expect(result.mediaType).toBe('image/png')
  expect(Buffer.from(result.data)).toEqual(PNG)
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://api.openai.com/v1/images/generations')
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret')
  expect(JSON.parse(String(init.body))).toMatchObject({ model: 'gpt-image-1', prompt: 'a red fox', size: '1024x1024' })
})

it('rejects a provider response that is not a PNG', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('not a png').toString('base64') }] }), { status: 200 })))
  await expect(generateImage({ provider: 'seedream', model: 'm', key: 'k' }, 'x', undefined)).rejects.toThrow('PNG')
})

it('surfaces bounded provider errors without the key', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid key', { status: 401 })))
  await expect(generateImage({ provider: 'openai', model: 'm', key: 'super-secret' }, 'x', undefined))
    .rejects.toThrow('HTTP 401')
})
