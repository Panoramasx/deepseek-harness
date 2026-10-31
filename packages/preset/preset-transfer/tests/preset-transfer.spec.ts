import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  appendPresetRow, buildPresetArchive, presetRow, readPresetArchive, type PresetManifest,
} from '../src/index.ts'

const manifest: PresetManifest = {
  format: 'dsh-preset',
  version: 2,
  id: 'reviewer',
  name: 'Reviewer',
  description: 'Reviews changes',
  exportedAt: '2026-10-31T00:00:00.000Z',
}

const plugins = `- id: tool-review
  name: '@example/review-tool'
`

describe('preset archive', () => {
  it('round-trips a v2 package with its declared composition', () => {
    const archive = readPresetArchive(buildPresetArchive(manifest, plugins))
    expect(archive.manifest).toEqual(manifest)
    expect(archive.name).toBe('Reviewer')
    expect(archive.plugins).toEqual([{ id: 'tool-review', name: '@example/review-tool' }])
  })

  it('rejects archives without the required files or with a foreign manifest format', () => {
    expect(() => readPresetArchive(zipSync({ 'manifest.json': strToU8('{}') }))).toThrow('must contain manifest.json and preset/plugins.yml')
    expect(() => readPresetArchive(zipSync({
      'manifest.json': strToU8(JSON.stringify({ ...manifest, format: 'other' })),
      'preset/plugins.yml': strToU8(plugins),
    }))).toThrow('version 2 dsh-preset package')
  })

  it('ignores underscore and traversal entries and rejects a non-list composition', () => {
    const archive = readPresetArchive(zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'preset/plugins.yml': strToU8(plugins),
      '../escape.txt': strToU8('ignored'),
      'preset/plugins.yml.bak': strToU8('ignored'),
    }))
    expect(archive.plugins).toHaveLength(1)
    expect(() => readPresetArchive(zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'preset/plugins.yml': strToU8('not: a list\n'),
    }))).toThrow('top-level entry list')
  })

  it('rejects a preset id that could escape the profile layout', () => {
    expect(() => readPresetArchive(zipSync({
      'manifest.json': strToU8(JSON.stringify({ ...manifest, id: '../escape' })),
      'preset/plugins.yml': strToU8(plugins),
    }))).toThrow('short path-safe identifier')
  })
})

describe('profile patch insertion', () => {
  it('renders one declarative agent preset row', () => {
    const { rowId, block } = presetRow(manifest, [{ id: 'tool-review', name: '@example/review-tool' }])
    expect(rowId).toBe('preset-package-reviewer')
    expect(block).toContain('@deepseek-ai/dsh-agent-preset')
    expect(block).toContain('id: reviewer')
    expect(block).toContain('plugins:')
  })

  it('appends a row without rewriting the existing patch and rejects a duplicate row id', () => {
    const current = '# keep me\n- id: existing\n  name: "@example/existing"\n'
    const { rowId, block } = presetRow(manifest, [])
    const next = appendPresetRow(current, rowId, block)
    expect(next.startsWith(current)).toBe(true)
    expect(next).toContain('preset-package-reviewer')
    expect(() => appendPresetRow(next, rowId, block)).toThrow('already declares')
  })

  it('rejects an existing patch that is not a YAML sequence', () => {
    const { rowId, block } = presetRow(manifest, [])
    expect(() => appendPresetRow('key: value\n', rowId, block)).toThrow('top-level YAML sequence')
  })
})
