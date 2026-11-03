/* oxlint-disable */
import { expect, it } from 'vitest'
import { extractTryCloudflareUrl, resolveCurrentAssetSpec } from '../src/mobile/cloudflared-tunnel.ts'
import { buildPinggySshArgs, extractPinggyUrl } from '../src/mobile/pinggy-tunnel.ts'
import { readPairingPinState, writePairingPinState } from '../src/mobile/pairing-pin-store.ts'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

it('extracts Quick Tunnel URLs without accepting the API host', () => {
  expect(extractTryCloudflareUrl('INF | https://alpha-beta.trycloudflare.com |')).toBe('https://alpha-beta.trycloudflare.com')
  expect(extractTryCloudflareUrl('https://api.trycloudflare.com')).toBeNull()
})

it('resolves a pinned cloudflared asset for supported platforms', () => {
  expect(resolveCurrentAssetSpec('darwin', 'arm64')?.spec.sha256).toMatch(/^[a-f0-9]{64}$/u)
  expect(resolveCurrentAssetSpec('plan9', 'mips')).toBeNull()
})

it('extracts Pinggy URLs and builds a non-interactive ssh tunnel', () => {
  expect(extractPinggyUrl('forwarding https://abc.pinggy.link -> 127.0.0.1:43127')).toBe('https://abc.pinggy.link')
  const args = buildPinggySshArgs({ port: 43127, knownHostsPath: '/tmp/known', identityPath: '/tmp/id' })
  expect(args).toContain('0:127.0.0.1:43127')
  expect(args).toContain('BatchMode=yes')
  expect(args).toContain('StrictHostKeyChecking=accept-new')
})

it('never persists a pin without consent', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'dsh-mobile-pin-')), 'pin.json')
  expect(writePairingPinState(path, { pin: '123456', pinConsent: false })).toBe(true)
  expect(readPairingPinState(path)).toEqual({})
  expect(writePairingPinState(path, { pin: '123456', pinConsent: true })).toBe(true)
  expect(readPairingPinState(path)).toEqual({ pin: '123456', pinConsent: true })
})
