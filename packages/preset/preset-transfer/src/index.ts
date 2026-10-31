/**
 * Portable Agent preset packages over the authenticated Desktop connection.
 *
 * A package is a ZIP archive with `manifest.json`, `preset/plugins.yml` (the
 * declared child composition, in the Loader's own YAML dialect), and an
 * optional `preset/preset.yml` display record. Import appends one declarative
 * `@deepseek-ai/dsh-agent-preset` row to the active profile patch; it never
 * rewrites existing rows or comments.
 *
 * @module @deepseek-ai/dsh-preset-transfer
 */

import { readFile } from 'node:fs/promises'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { dump, load } from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-client-connection'

/** Stable Cordis plugin name. */
export const name = 'preset-transfer'

/** The authenticated connection carrying the transfer routes. */
export const inject = ['connection']

const EXPORT_PATH = '/api/agent-preset.export'
const IMPORT_PATH = '/api/agent-preset.import'
const LIST_PATH = '/api/agent-preset.list'

/** Archive layout version; v2 stores the current declarative composition. */
export const PRESET_ARCHIVE_VERSION = 2
/** MIME type of one preset package. */
export const PRESET_ARCHIVE_MIME = 'application/vnd.dsh.preset+zip'
const PRESET_ARCHIVE_FORMAT = 'dsh-preset'
const MAX_COMPRESSED_BYTES = 16 * 1024 * 1024
const MAX_PLUGINS_BYTES = 2 * 1024 * 1024
const MAX_PRESET_ID = 64
const PRESET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u
const ALLOWED_FILES = new Set(['manifest.json', 'preset/plugins.yml', 'preset/preset.yml'])
const MANIFEST_FILE = 'manifest.json'
const PLUGINS_FILE = 'preset/plugins.yml'

/** One exported preset archive. */
export interface PresetArchive {
  readonly manifest: PresetManifest
  /** Parsed child composition rows. */
  readonly plugins: readonly unknown[]
  /** Declared display name, when the manifest carries one. */
  readonly name?: string
  readonly description?: string
}

/** Manifest of one `.dshpreset` v2 archive. */
export interface PresetManifest {
  readonly format: typeof PRESET_ARCHIVE_FORMAT
  readonly version: typeof PRESET_ARCHIVE_VERSION
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly sourceDshVersion?: string
  readonly exportedAt?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function failure(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status })
}

function limitedString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined
}

function parseManifest(value: unknown): PresetManifest {
  if (!record(value) || value.format !== PRESET_ARCHIVE_FORMAT || value.version !== PRESET_ARCHIVE_VERSION) {
    throw new Error('manifest.json must describe a version 2 dsh-preset package')
  }
  const id = limitedString(value.id, MAX_PRESET_ID)
  if (id === undefined || !PRESET_ID.test(id)) throw new Error('manifest id must be a short path-safe identifier')
  const name = value.name === undefined ? undefined : limitedString(value.name, 200)
  if (value.name !== undefined && name === undefined) throw new Error('manifest name must be a string of at most 200 characters')
  const description = value.description === undefined ? undefined : limitedString(value.description, 4_000)
  if (value.description !== undefined && description === undefined) throw new Error('manifest description must be a string of at most 4000 characters')
  const sourceDshVersion = value.sourceDshVersion === undefined ? undefined : limitedString(value.sourceDshVersion, 100)
  const exportedAt = value.exportedAt === undefined ? undefined : limitedString(value.exportedAt, 100)
  return {
    format: PRESET_ARCHIVE_FORMAT,
    version: PRESET_ARCHIVE_VERSION,
    id,
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(sourceDshVersion === undefined ? {} : { sourceDshVersion }),
    ...(exportedAt === undefined ? {} : { exportedAt }),
  }
}

/**
 * Build one package archive.
 * @param manifest - Archive identity and display metadata.
 * @param plugins - Preset child composition, already serialized in the Loader dialect.
 * @returns ZIP bytes.
 */
export function buildPresetArchive(manifest: PresetManifest, plugins: string): Uint8Array {
  return zipSync({
    [MANIFEST_FILE]: strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
    [PLUGINS_FILE]: strToU8(plugins),
    'preset/preset.yml': strToU8(dump({
      id: manifest.id,
      ...(manifest.name === undefined ? {} : { name: manifest.name }),
      ...(manifest.description === undefined ? {} : { description: manifest.description }),
    })),
  }, { level: 6 })
}

/**
 * Read and validate one package archive without writing anything.
 * @param bytes - Complete ZIP payload.
 * @returns Manifest and parsed composition.
 */
export function readPresetArchive(bytes: Uint8Array): PresetArchive {
  if (bytes.length > MAX_COMPRESSED_BYTES) throw new Error('preset package exceeds the compressed size limit')
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: file => ALLOWED_FILES.has(file.name) && file.originalSize <= MAX_PLUGINS_BYTES,
    })
  } catch (error) {
    throw new Error(`preset package is not a readable ZIP archive: ${error instanceof Error ? error.message : String(error)}`)
  }
  const manifestBytes = files[MANIFEST_FILE]
  const pluginsBytes = files[PLUGINS_FILE]
  if (manifestBytes === undefined || pluginsBytes === undefined) {
    throw new Error('preset package must contain manifest.json and preset/plugins.yml')
  }
  let manifestValue: unknown
  try {
    manifestValue = JSON.parse(strFromU8(manifestBytes))
  } catch (error) {
    throw new Error(`manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const manifest = parseManifest(manifestValue)
  if (pluginsBytes.length > MAX_PLUGINS_BYTES) throw new Error('preset/plugins.yml exceeds the size limit')
  let plugins: unknown
  try {
    plugins = load(strFromU8(pluginsBytes), { schema: entryListSchema })
  } catch (error) {
    throw new Error(`preset/plugins.yml is not valid Loader YAML: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(plugins)) throw new Error('preset/plugins.yml must be a top-level entry list')
  return {
    manifest,
    plugins,
    ...(manifest.name === undefined ? {} : { name: manifest.name }),
    ...(manifest.description === undefined ? {} : { description: manifest.description }),
  }
}

/**
 * Render the profile patch row that declares one imported preset.
 * @param manifest - Archive identity and display metadata.
 * @param plugins - Parsed child composition rows.
 * @returns Stable row id and YAML sequence entry.
 */
export function presetRow(manifest: PresetManifest, plugins: readonly unknown[]): { rowId: string; block: string } {
  const rowId = `preset-package-${manifest.id}`
  const block = dump([{
    insert: [{
      id: rowId,
      name: '@deepseek-ai/dsh-agent-preset',
      config: {
        id: manifest.id,
        ...(manifest.name === undefined ? {} : { name: manifest.name }),
        ...(manifest.description === undefined ? {} : { description: manifest.description }),
        plugins,
      },
    }],
  }], { schema: entryListSchema, noRefs: true, lineWidth: -1 })
  return { rowId, block }
}

/**
 * Append one row block to a profile patch while preserving its existing bytes.
 * @param current - Current patch file content, possibly empty.
 * @param rowId - Row id that must not already be declared.
 * @param block - Rendered YAML sequence entry.
 * @returns Complete next patch content.
 */
export function appendPresetRow(current: string, rowId: string, block: string): string {
  if (current.includes(rowId)) throw new Error(`the profile already declares ${rowId}`)
  const next = current.trim() === '' ? block : `${current.trimEnd()}\n\n${block}`
  let parsed: unknown
  try {
    parsed = load(next, { schema: entryListSchema })
  } catch (error) {
    throw new Error(`the profile patch must stay a top-level YAML sequence: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(parsed)) throw new Error('the profile patch must stay a top-level YAML sequence')
  return next.endsWith('\n') ? next : `${next}\n`
}

async function listResponse(ctx: Context): Promise<Response> {
  const presets = ctx.get('agentPresets')
  if (presets === undefined) return failure(503, 'this deployment has no agent presets')
  const rows = await presets.list()
  return Response.json({
    ok: true,
    presets: rows.map(row => ({ id: row.id, ...(row.name === undefined ? {} : { name: row.name }),
      ...(row.description === undefined ? {} : { description: row.description }), isDefault: row.id === presets.defaultId })),
  })
}

async function exportResponse(ctx: Context, request: Request): Promise<Response> {
  const presets = ctx.get('agentPresets')
  if (presets === undefined) return failure(503, 'this deployment has no agent presets')
  const requested = new URL(request.url).searchParams.get('agentPreset') ?? undefined
  let preset
  try {
    preset = await presets.resolve(requested)
  } catch (error) {
    return failure(404, error instanceof Error ? error.message : 'unknown agent preset')
  }
  if (preset.broken !== undefined) return failure(409, `the preset cannot be exported because it failed to load: ${preset.broken}`)
  const document = await presets.readDocument(preset.id)
  const manifest: PresetManifest = {
    format: PRESET_ARCHIVE_FORMAT,
    version: PRESET_ARCHIVE_VERSION,
    id: preset.id,
    ...(document.name === undefined ? {} : { name: document.name }),
    ...(document.description === undefined ? {} : { description: document.description }),
    ...(process.env.DSH_CLIENT_VERSION === undefined ? {} : { sourceDshVersion: process.env.DSH_CLIENT_VERSION }),
    exportedAt: new Date().toISOString(),
  }
  const archive = buildPresetArchive(manifest, document.content)
  return new Response(new Uint8Array(archive).buffer, {
    headers: {
      'content-type': PRESET_ARCHIVE_MIME,
      'content-disposition': `attachment; filename="${preset.id}.dshpreset"`,
      'cache-control': 'no-store',
      'x-dsh-preset-id': preset.id,
    },
  })
}

async function importResponse(ctx: Context, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const install = url.searchParams.get('install') === '1'
  const overrideId = url.searchParams.get('agentPreset') ?? undefined
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await request.arrayBuffer())
  } catch {
    return failure(400, 'the preset package body could not be read')
  }
  if (bytes.length === 0) return failure(400, 'the preset package is empty')
  if (bytes.length > MAX_COMPRESSED_BYTES) return failure(413, 'the preset package exceeds the compressed size limit')
  let archive: PresetArchive
  try {
    archive = readPresetArchive(bytes)
  } catch (error) {
    return failure(400, error instanceof Error ? error.message : String(error))
  }
  const manifest = overrideId === undefined ? archive.manifest : {
    ...archive.manifest,
    id: overrideId,
  }
  if (!PRESET_ID.test(manifest.id) || manifest.id.length > MAX_PRESET_ID) {
    return failure(400, 'agentPreset must be a short path-safe identifier')
  }
  const { rowId, block } = presetRow(manifest, archive.plugins)
  if (!install) {
    return Response.json({
      ok: true, preview: true, rowId, block,
      preset: { id: manifest.id, ...(manifest.name === undefined ? {} : { name: manifest.name }),
        ...(manifest.description === undefined ? {} : { description: manifest.description }), plugins: archive.plugins.length },
    })
  }
  const profile = ctx.get('profileContext')
  if (profile === undefined) return failure(503, 'preset installation requires a dsh profile')
  const presets = ctx.get('agentPresets')
  if (presets !== undefined) {
    try {
      await presets.resolve(manifest.id)
      return failure(409, `the profile already declares preset ${manifest.id}`)
    } catch {
      // A missing preset is the expected outcome; only a duplicate blocks installation.
    }
  }
  let current = ''
  try {
    current = await readFile(profile.patchPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const next = appendPresetRow(current, rowId, block)
  await writeFileAtomic(profile.patchPath, next, { mode: 0o600 })
  return Response.json({
    ok: true, installed: true, restartRequired: true, rowId,
    preset: { id: manifest.id, ...(manifest.name === undefined ? {} : { name: manifest.name }), plugins: archive.plugins.length },
  })
}

/**
 * Register the preset transfer routes on the authenticated connection.
 * @param ctx - Host context with the preset registry and profile context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: LIST_PATH, methods: ['GET'], requestBody: 'buffered', fetch: () => listResponse(ctx),
  }), 'preset-transfer: list')
  ctx.effect(() => ctx.connection.fetch.register({
    path: EXPORT_PATH, methods: ['GET'], requestBody: 'buffered', fetch: request => exportResponse(ctx, request),
  }), 'preset-transfer: export')
  ctx.effect(() => ctx.connection.fetch.register({
    path: IMPORT_PATH, methods: ['POST'], requestBody: 'buffered', fetch: request => importResponse(ctx, request),
  }), 'preset-transfer: import')
}
