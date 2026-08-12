#!/usr/bin/env node

const CDP_URL = process.env.CANWIN_CDP_URL ?? 'http://127.0.0.1:9223'
const EVIDENCE_URL = process.env.CANWIN_PORTRAIT_EVIDENCE_URL
  ?? 'http://127.0.0.1:4173/evidence/portrait-mobile.html'
const SCENARIOS = [
  'types',
  'clear',
  'unsupported',
  'inactive-history',
  'derived',
  'department-switch',
  'error',
]

let nextCommandId = 1

function fail() {
  throw new Error('PORTRAIT_MOBILE_GEOMETRY_FAILED')
}

async function waitForEndpoint() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${CDP_URL}/json/version`)
      if (response.ok) return
    } catch {
      // Chrome may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  fail()
}

async function createTarget() {
  const response = await fetch(`${CDP_URL}/json/new?about:blank`, { method: 'PUT' })
  if (!response.ok) fail()
  const target = await response.json()
  if (typeof target.webSocketDebuggerUrl !== 'string') fail()
  return target
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  const pending = new Map()
  const eventWaiters = new Map()

  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data))
    if (typeof payload.id === 'number') {
      const waiter = pending.get(payload.id)
      if (!waiter) return
      pending.delete(payload.id)
      if (payload.error) waiter.reject(new Error('CDP_COMMAND_FAILED'))
      else waiter.resolve(payload.result)
      return
    }
    const waiters = eventWaiters.get(payload.method) ?? []
    eventWaiters.delete(payload.method)
    for (const resolve of waiters) resolve(payload.params)
  })

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  function command(method, params = {}) {
    const id = nextCommandId
    nextCommandId += 1
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  function event(method) {
    return new Promise((resolve) => {
      const waiters = eventWaiters.get(method) ?? []
      waiters.push(resolve)
      eventWaiters.set(method, waiters)
    })
  }

  return { socket, opened, command, event }
}

async function main() {
  await waitForEndpoint()
  const target = await createTarget()
  const client = connect(target.webSocketDebuggerUrl)
  await client.opened
  await client.command('Page.enable')
  await client.command('Runtime.enable')
  await client.command('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 800,
    deviceScaleFactor: 1,
    mobile: true,
  })

  const results = []
  for (const scenario of SCENARIOS) {
    const loaded = client.event('Page.loadEventFired')
    await client.command('Page.navigate', {
      url: `${EVIDENCE_URL}?scenario=${encodeURIComponent(scenario)}`,
    })
    await loaded
    const evaluated = await client.command('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const panel = document.querySelector('.portrait-evidence-panel')
        if (!(panel instanceof HTMLElement)) return null
        const rectangle = panel.getBoundingClientRect()
        const controls = [...document.querySelectorAll('button,input,select,textarea')]
          .map((control) => control.getBoundingClientRect())
        return {
          scenario: ${JSON.stringify(scenario)},
          inner_width: window.innerWidth,
          inner_height: window.innerHeight,
          document_client_width: document.documentElement.clientWidth,
          body_client_width: document.body.clientWidth,
          document_scroll_width: document.documentElement.scrollWidth,
          body_scroll_width: document.body.scrollWidth,
          panel_left: rectangle.left,
          panel_right: rectangle.right,
          panel_width: rectangle.width,
          control_count: controls.length,
          minimum_control_height: controls.length ? Math.min(...controls.map((item) => item.height)) : null,
          viewport_marker: document.querySelector('[data-evidence-viewport]')?.getAttribute('data-evidence-viewport') ?? null,
        }
      })()`,
    })
    const geometry = evaluated?.result?.value
    if (!geometry) fail()
    const noHorizontalOverflow = geometry.document_scroll_width <= 360 && geometry.body_scroll_width <= 360
    const panelFits = geometry.panel_left >= 19 && geometry.panel_right <= 341 && geometry.panel_width <= 322
    const controlsFit = geometry.minimum_control_height === null || geometry.minimum_control_height >= 44
    if (
      geometry.inner_width !== 360
      || geometry.inner_height !== 800
      || geometry.document_client_width !== 360
      || geometry.body_client_width !== 360
      || geometry.viewport_marker !== '360x800'
      || !noHorizontalOverflow
      || !panelFits
      || !controlsFit
    ) {
      fail()
    }
    results.push({ ...geometry, no_horizontal_overflow: true, controls_minimum_44px: controlsFit })
  }

  client.socket.close()
  console.log(JSON.stringify({
    status: 'PASS',
    browser: 'chromium-cdp',
    viewport: '360x800',
    scenarios: results,
    sensitive_fixture_count: 0,
  }))
}

main().catch(() => {
  console.error(JSON.stringify({ status: 'FAIL', stage: 'portrait-mobile-geometry' }))
  process.exit(1)
})
