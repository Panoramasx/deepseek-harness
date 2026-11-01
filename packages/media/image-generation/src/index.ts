/**
 * Conversation image generation through OpenAI Images or Volcengine Ark
 * Seedream. The Host owns the credential, provider call, and durable
 * attachment; the Client owns the Settings > Plugins > Image generation form.
 * @module @deepseek-ai/dsh-image-generation
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { generateImage, type ImageConfig } from './provider.ts'

export const name = 'image-generation'
export const inject = ['tools', 'connection', 'credentials', 'attachments', 'systemPrompt']

const CONFIG_KEY = credentialKey('image-generation', 'config')
const CONFIG_PATH = '/api/image-generation/config'
const PROMPT_SECTION = 'tool:image-generation'
const PROMPT_TEXT = 'Use image_generate for requested photos, illustrations, and backgrounds. '
  + 'The user configures the provider and key in Settings > Plugins > Image generation; '
  + 'never ask for an API key in conversation.'

/** Non-secret settings returned to the Client; the key is never serialized. */
interface PublicConfig {
  readonly provider: ImageConfig['provider']
  readonly model: string
  readonly baseUrl: string
  readonly keyConfigured: boolean
}

function saved(value: unknown): ImageConfig | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if ((record.provider !== 'openai' && record.provider !== 'seedream')
    || typeof record.model !== 'string' || record.model.trim() === ''
    || typeof record.key !== 'string' || record.key.trim() === '') return undefined
  return {
    provider: record.provider,
    model: record.model,
    ...typeof record.baseUrl === 'string' && record.baseUrl.trim() !== '' ? { baseUrl: record.baseUrl } : {},
    key: record.key,
  }
}

async function load(ctx: Context): Promise<ImageConfig | undefined> {
  const record = await ctx.credentials.readRecord(CONFIG_KEY)
  if (record === undefined || record.kind !== 'grant') return undefined
  return saved(record.payload)
}

function publicConfig(config: ImageConfig | undefined): PublicConfig {
  return config === undefined
    ? { provider: 'openai', model: 'gpt-image-1', baseUrl: '', keyConfigured: false }
    : { provider: config.provider, model: config.model, baseUrl: config.baseUrl ?? '', keyConfigured: true }
}

function validateBaseUrl(value: string): string {
  if (value.trim() === '') return ''
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname))) {
    throw new Error('base URL must use HTTPS (or HTTP on localhost)')
  }
  return value.replace(/\/+$/u, '')
}

async function save(ctx: Context, body: unknown): Promise<PublicConfig> {
  if (typeof body !== 'object' || body === null) throw new Error('invalid image generation settings')
  const input = body as Record<string, unknown>
  const provider = input.provider === 'seedream' ? 'seedream' : input.provider === 'openai' ? 'openai' : undefined
  if (provider === undefined) throw new Error('provider must be openai or seedream')
  if (typeof input.model !== 'string' || input.model.trim() === '') throw new Error('model is required')
  const baseUrl = validateBaseUrl(typeof input.baseUrl === 'string' ? input.baseUrl : '')
  const previous = await load(ctx)
  const key = typeof input.key === 'string' && input.key.trim() !== '' ? input.key.trim() : previous?.key
  if (key === undefined) throw new Error('API key is required')
  const config: ImageConfig = { provider, model: input.model.trim(), ...baseUrl === '' ? {} : { baseUrl }, key }
  await ctx.credentials.modifyRecord(CONFIG_KEY, async () => ({ kind: 'grant', payload: config } satisfies CredentialRecord))
  return publicConfig(config)
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

const IMAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    attachmentId: { type: 'string', required: true },
    mediaType: { type: 'string', required: true },
    bytes: { type: 'integer', required: true },
    width: { type: 'integer', required: true },
    height: { type: 'integer', required: true },
  },
} as const

interface ImageToolValue {
  readonly image: ImageAttachmentRef
  readonly provider: ImageConfig['provider']
  readonly model: string
  readonly prompt: string
}

/** Register the Host tool and its authenticated Settings route. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({ name: PROMPT_SECTION, order: 114, text: PROMPT_TEXT })
  ctx.effect(() => ctx.connection.fetch.register({
    path: CONFIG_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request: Request) => {
      try {
        if (request.method === 'GET') return json(publicConfig(await load(ctx)))
        return json(await save(ctx, await request.json()))
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, request.method === 'GET' ? 500 : 400)
      }
    },
  }), 'image-generation: settings')
  ctx.tools.register(defineTool({
    name: 'image_generate',
    description: 'Generate one PNG from a prompt through the configured image provider. '
      + 'Use it for photos, illustrations, and backgrounds; configure the provider in Settings > Plugins > Image generation first.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Visual subject, composition, palette, lighting, and any text-free description.' },
      aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'], description: 'Target canvas; defaults to 1:1.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          image: { ...IMAGE_SCHEMA, required: true },
          provider: { type: 'string', required: true, enum: ['openai', 'seedream'] },
          model: { type: 'string', required: true },
          prompt: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `Generated ${value.image.width}x${value.image.height} ${value.image.mediaType} with ${value.provider}/${value.model}.` },
        { type: 'image', attachment: value.image as ImageAttachmentRef },
      ],
    },
    async execute(args, exec) {
      const config = await load(ctx)
      if (config === undefined) throw new Error('image generation is not configured; open Settings > Plugins > Image generation and save a provider and API key')
      exec.signal.throwIfAborted()
      const generated = await generateImage(config, args.prompt, args.aspect_ratio)
      exec.signal.throwIfAborted()
      const ref = await ctx.attachments.saveImage({ data: generated.data, mediaType: 'image/png', name: 'generated-image.png' })
      const value: ImageToolValue = { image: ref, provider: generated.provider, model: generated.model, prompt: args.prompt }
      return value
    },
  }))
}
