import { createServer } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { LanMobileBridge } from '../src/mobile/lan-mobile-bridge.ts'

const bridges: LanMobileBridge[] = []
afterEach(async () => { for (const bridge of bridges.splice(0)) await bridge.stop() })

it('pairs a LAN phone from a short-lived QR token and answers its status', async () => {
  const host = createServer((_request, response) => { response.statusCode = 404; response.end() })
  await new Promise<void>((resolve) => { host.listen(0, '127.0.0.1', resolve) })
  const address = host.address()
  if (address === null || typeof address === 'string') throw new Error('missing host port')
  const bridge = new LanMobileBridge({
    harnessUrl: () => `http://127.0.0.1:${String(address.port)}`,
    harnessCookie: () => 'dsh_host=test',
    locale: 'en',
    pairingPinStore: { load: () => ({}), save: () => true },
  })
  bridges.push(bridge)
  const snapshot = await bridge.start()
  expect(snapshot.running).toBe(true)
  expect(snapshot.pairingUrl).toContain('/pair?token=')
  const base = `http://127.0.0.1:${String(snapshot.port)}`
  const bootstrap = await fetch(bridge.createDesktopUrl()!, { redirect: 'manual' })
  expect(bootstrap.status).toBe(303)
  const desktopCookie = bootstrap.headers.get('set-cookie')?.split(';', 1)[0]
  const desktop = await fetch(`${base}/desktop`, { headers: { cookie: desktopCookie! } })
  expect(desktop.status).toBe(200)
  const page = await desktop.text()
  expect(page).toContain('Connect')
  expect(page).toContain('pair?token=')
  const claimToken = new URL(snapshot.pairingUrl!).searchParams.get('token')!
  const claim = await fetch(`${base}/mobile/v1/pair/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: claimToken }) })
  const claimed = await claim.json() as { sessionToken: string; mode: string }
  expect(claim.status).toBe(200)
  expect(claimed.mode).toBe('lan')
  expect(claimed.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/u)
  const v1 = await fetch(`${base}/mobile/v1/status`, { headers: { authorization: `Bearer ${claimed.sessionToken}` } })
  await expect(v1.json()).resolves.toMatchObject({ ok: true, connected: true, apiVersion: 1 })
  host.close()
})
