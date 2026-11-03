/* oxlint-disable */
import { createServer, type Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { WebSocketServer, WebSocket } from 'ws'
import { LanMobileBridge } from '../src/mobile/lan-mobile-bridge.ts'

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

interface FakeHost { base: string; wss: WebSocketServer }

async function fakeHost(): Promise<FakeHost> {
  const server = createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/api/session/list') {
      const chunks: Buffer[] = []
      request.on('data', chunk => { chunks.push(Buffer.from(chunk)) })
      request.on('end', () => {
        const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { rpcId: string }
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ rpcId: envelope.rpcId, result: { ok: true, value: { items: [{ sessionId: 's1' }] } } }))
      })
      return
    }
    response.statusCode = 404; response.end()
  })
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => { wss.handleUpgrade(request, socket, head, ws => { wss.emit('connection', ws, request) }) })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  cleanups.push(() => new Promise<void>(resolve => { wss.close(); server.close(() => { resolve() }) }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no fake host port')
  return { base: `http://127.0.0.1:${String(address.port)}`, wss }
}

async function bridgeFor(host: FakeHost, pin?: string): Promise<LanMobileBridge> {
  const bridge = new LanMobileBridge({
    harnessUrl: () => host.base,
    harnessCookie: () => 'dsh_host=test',
    locale: 'en',
    pairingPinStore: pin === undefined ? { load: () => ({}), save: () => true } : { load: () => ({ pin, pinConsent: true }), save: () => true },
  })
  cleanups.push(() => bridge.stop())
  await bridge.start()
  return bridge
}

async function claim(bridge: LanMobileBridge, tunnel = false): Promise<{ base: string; token: string; body: Record<string, unknown> }> {
  const snapshot = bridge.snapshot()
  if (snapshot.pairingUrl === undefined || snapshot.port === undefined) throw new Error('bridge not running')
  const base = `http://127.0.0.1:${String(snapshot.port)}`
  const token = new URL(snapshot.pairingUrl).searchParams.get('token')!
  const response = await fetch(`${base}/mobile/v1/pair/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...tunnel ? { 'cf-connecting-ip': '203.0.113.9', 'cf-ray': 'test-ray' } : {} },
    body: JSON.stringify({ token }),
  })
  return { base, token, body: await response.json() as Record<string, unknown> }
}

it('pairs through a tunnel PIN and returns a bearer session', async () => {
  const host = await fakeHost()
  const bridge = await bridgeFor(host, '123456')
  const first = await claim(bridge, true)
  expect(first.body).toMatchObject({ ok: true, mode: 'tunnel', pinRequired: true })
  const challenge = String(first.body.challenge)
  const verify = await fetch(`${first.base}/mobile/v1/pair/verify`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', 'cf-ray': 'test-ray' },
    body: JSON.stringify({ challenge, pin: '123456' }),
  })
  expect(verify.status).toBe(200)
  const session = await verify.json() as { sessionToken: string }
  const status = await fetch(`${first.base}/mobile/v1/status`, { headers: { authorization: `Bearer ${session.sessionToken}`, 'cf-connecting-ip': '203.0.113.9', 'cf-ray': 'test-ray' } })
  await expect(status.json()).resolves.toMatchObject({ ok: true, mode: 'tunnel' })
})

it('rejects a wrong tunnel PIN and rate-limits repeats', async () => {
  const host = await fakeHost()
  const bridge = await bridgeFor(host, '123456')
  const first = await claim(bridge, true)
  const challenge = String(first.body.challenge)
  let response: Response | undefined
  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetch(`${first.base}/mobile/v1/pair/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.10', 'cf-ray': 'test-ray' },
      body: JSON.stringify({ challenge, pin: '000000' }),
    })
  }
  expect(response?.status).toBe(429)
})

it('forwards an allowlisted RPC to the Host envelope', async () => {
  const host = await fakeHost()
  const bridge = await bridgeFor(host)
  const first = await claim(bridge)
  const sessionToken = String(first.body.sessionToken)
  const response = await fetch(`${first.base}/mobile/v1/rpc`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ method: 'session.list', payload: {} }),
  })
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toMatchObject({ ok: true, value: { items: [{ sessionId: 's1' }] } })
})

it('streams a session snapshot over the ticket WebSocket', async () => {
  const host = await fakeHost()
  const bridge = await bridgeFor(host)
  const first = await claim(bridge)
  const sessionToken = String(first.body.sessionToken)
  host.wss.on('connection', socket => {
    socket.on('message', data => {
      const frame = JSON.parse(String(data)) as { type: string; streamId: string }
      if (frame.type === 'open') socket.send(JSON.stringify({ streamId: frame.streamId, type: 'item', value: { type: 'snapshot', records: [] } }))
    })
  })
  const ticketResponse = await fetch(`${first.base}/mobile/v1/session/ticket`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ sessionId: 's1' }),
  })
  const ticket = await ticketResponse.json() as { ticket: string }
  const socket = new WebSocket(`ws://127.0.0.1:${String(bridge.snapshot().port)}/mobile/v1/ws?sessionId=s1&ticket=${encodeURIComponent(ticket.ticket)}`)
  cleanups.push(() => socket.close())
  const message = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket snapshot timed out')), 5000)
    socket.on('message', data => { clearTimeout(timer); resolve(String(data)) })
    socket.on('error', reject)
  })
  expect(JSON.parse(message)).toMatchObject({ type: 'snapshot' })
})
