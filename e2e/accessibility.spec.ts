import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { AxeResults, Result } from 'axe-core'

test.describe.configure({ mode: 'serial' })

const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core/axe.min.js')
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const apiURL = process.env.E2E_API_URL ?? 'http://127.0.0.1:30080'
const webURL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:41780'
const outputDir = path.resolve('.e2e-results/accessibility/evidence')
const fixtureURL = new URL(process.env.ASR_URL ?? 'http://127.0.0.1:8100')
const fixtureText = 'Uma tabela tem linhas e colunas. Cada linha representa um registro.'
const expectedStates = [
  'landing', 'tool-dictionary', 'tool-daily-sign', 'tool-resources',
  'tool-faq', 'tool-guide', 'tool-fingerspelling', 'login', 'signup',
  'invite-invalid', 'app-home', 'room-list', 'host-context', 'host-context-error',
  'host-room-dark', 'host-room-light', 'invite-valid', 'guest-waiting',
  'host-admission-queue', 'guest-room', 'guest-chat', 'host-people',
  'host-removal-dialog', 'host-device-dialog', 'captions-literal',
  'captions-adapted-mode', 'meeting-ended',
]

type RuleEvidence = {
  id: string
  impact: Result['impact']
  tags: string[]
  help: string
  helpUrl: string
  nodes: { target: Result['nodes'][number]['target']; failureSummary?: string }[]
}

const states: {
  id: string
  role: string
  theme: string
  counts: Record<string, number>
  violations: RuleEvidence[]
  incomplete: RuleEvidence[]
  passedRuleIds: string[]
  inapplicableRuleIds: string[]
}[] = []
const secrets: string[] = []
const externalOrigins = new Set<string>()
let browserVersion = ''
let axeVersion = ''
let selectedRuleIds: string[] = []
let fixtureRequests = 0

function redact(value: string): string {
  return secrets.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), value)
}

function rules(results: Result[]): RuleEvidence[] {
  return results.map(({ id, impact, tags: ruleTags, help, helpUrl, nodes }) => ({
    id, impact, tags: ruleTags, help, helpUrl,
    nodes: nodes.map(({ target, failureSummary }) => ({
      target: JSON.parse(redact(JSON.stringify(target))),
      ...(failureSummary ? { failureSummary: redact(failureSummary) } : {}),
    })),
  }))
}

async function saveReport(): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  const counts = {
    expectedStates: expectedStates.length,
    scannedStates: states.length,
    statesWithViolations: states.filter((state) => state.violations.length > 0).length,
    violationRuleOccurrences: states.reduce((sum, state) => sum + state.violations.length, 0),
    violationNodes: states.reduce((sum, state) => sum + state.counts.violationNodes!, 0),
    statesRequiringReview: states.filter((state) => state.incomplete.length > 0).length,
  }
  const report = {
    generatedAt: new Date().toISOString(),
    webCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    apiCommit: process.env.E2E_API_COMMIT ?? 'not-provided',
    node: process.version,
    browser: { engine: 'Chromium', version: browserVersion, viewport: { width: 1440, height: 900 } },
    axeVersion, tags, selectedRuleIds,
    complete: expectedStates.every((id) => states.some((state) => state.id === id)),
    missingStates: expectedStates.filter((id) => !states.some((state) => state.id === id)),
    counts,
    conditions: {
      services: 'Real local API, ephemeral PostgreSQL 16 and LiveKit 1.9.10',
      asr: 'Deterministic local HTTP fixture, no speech model inference',
      asrRequests: fixtureRequests,
      adaptation: 'API fake provider returns the literal, no LLM inference',
      media: 'Browser-generated microphone/camera fixtures',
      reducedMotion: 'reduce',
      externalRequestsBlocked: [...externalOrigins].sort(),
    },
    limitations: [
      'Automated axe rules tagged WCAG A/AA, not an assessment of all 55 success criteria.',
      'One desktop Chromium viewport. No screen reader, human evaluation or physical mobile device.',
      'Third-party VLibras and external linked resources are outside this run.',
      'Caption-mode rendering uses simulated ASR and adaptation; no accuracy, latency or comprehension measurement.',
      'Incomplete results require human review. Repeated rule/node occurrences are not distinct WCAG failures.',
    ],
    states,
  }
  await writeFile(path.join(outputDir, 'axe-results.json'), JSON.stringify(report, null, 2))
  const markdown = [
    '# Automated accessibility evidence',
    '',
    `Web commit \`${report.webCommit}\`; API \`${report.apiCommit}\`.`,
    `Chromium ${browserVersion}; axe-core ${axeVersion}; viewport 1440 × 900; reduced motion enabled.`,
    `Scanned ${counts.scannedStates}/${counts.expectedStates} intended states.`,
    `States with violations: ${counts.statesWithViolations}; rule occurrences: ${counts.violationRuleOccurrences}; nodes: ${counts.violationNodes}.`,
    `States requiring manual review: ${counts.statesRequiringReview}.`,
    '',
    '| State | Role | Theme | Violations | Incomplete | Passed rules | Inapplicable rules |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |',
    ...states.map((s) => `| ${s.id} | ${s.role} | ${s.theme} | ${s.counts.violations} | ${s.counts.incomplete} | ${s.counts.passes} | ${s.counts.inapplicable} |`),
    '',
    '## Conditions and limits',
    '',
    ...Object.values(report.conditions).map((v) => `- ${Array.isArray(v) ? v.join(', ') : v}`),
    ...report.limitations.map((v) => `- ${v}`),
    ...(report.missingStates.length ? [`- Missing states: ${report.missingStates.join(', ')}`] : []),
  ].join('\n')
  await writeFile(path.join(outputDir, 'summary.md'), markdown + '\n')
}

async function restrictNetwork(context: BrowserContext): Promise<void> {
  const allowed = new Set([new URL(webURL).origin, new URL(apiURL).origin])
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (!['http:', 'https:'].includes(url.protocol) || allowed.has(url.origin)) return route.continue()
    externalOrigins.add(url.origin)
    return route.abort('blockedbyclient')
  })
}

async function scan(page: Page, id: string, role = 'visitor', theme = 'default'): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.addScriptTag({ path: axePath })
  const result = await page.evaluate(async (runTags) => {
    const axe = (window as typeof window & { axe: typeof import('axe-core') }).axe
    return {
      version: axe.version,
      ruleIds: axe.getRules(runTags).map((rule) => rule.ruleId),
      results: await axe.run(document, { runOnly: { type: 'tag', values: runTags } }),
    }
  }, tags)
  axeVersion = result.version
  selectedRuleIds = result.ruleIds.sort()
  const { violations, incomplete, passes, inapplicable } = result.results as AxeResults
  states.push({
    id, role, theme,
    counts: {
      violations: violations.length, incomplete: incomplete.length,
      passes: passes.length, inapplicable: inapplicable.length,
      violationNodes: violations.reduce((sum, rule) => sum + rule.nodes.length, 0),
    },
    violations: rules(violations), incomplete: rules(incomplete),
    passedRuleIds: passes.map((rule) => rule.id).sort(),
    inapplicableRuleIds: inapplicable.map((rule) => rule.id).sort(),
  })
  await saveReport()
  console.log(`AXE ${id}: ${violations.length} violations, ${incomplete.length} incomplete, ${passes.length} passes, ${inapplicable.length} inapplicable`)
}

const asrFixture = createServer((request, response) => {
  request.resume()
  if (request.method !== 'POST' || request.url !== '/v1/transcriptions') {
    response.writeHead(404).end()
    return
  }
  fixtureRequests++
  request.on('end', () => {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      text: fixtureText, engine: 'test-http-fixture', model: 'deterministic-no-inference', inferenceMs: 0,
    }))
  })
})

test.beforeAll(async ({ browser }) => {
  browserVersion = browser.version()
  expect(process.env.TRANSCRIPT_ADAPTATION_PROVIDER, 'This suite needs the isolated fake provider').toBe('fake')
  expect(fixtureURL.hostname).toBe('127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    asrFixture.once('error', reject)
    asrFixture.listen(Number(fixtureURL.port), '127.0.0.1', resolve)
  })
})

test.afterAll(async () => {
  await saveReport()
  asrFixture.closeAllConnections()
  await new Promise<void>((resolve) => asrFixture.close(() => resolve()))
})

test('public pages and tool dialogs reached through the interface', async ({ page, context }) => {
  await restrictNetwork(context)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await scan(page, 'landing')
  for (const [title, id] of [
    ['Dicionário de Sinais', 'tool-dictionary'],
    ['Sinal do dia', 'tool-daily-sign'],
    ['Mapa de recursos', 'tool-resources'],
    ['Dúvidas sobre Libras', 'tool-faq'],
    ['Incluir um aluno com deficiência auditiva', 'tool-guide'],
    ['Datilologia', 'tool-fingerspelling'],
  ]) {
    await page.getByRole('button', { name: new RegExp(title!) }).click()
    await expect(page.getByRole('dialog', { name: title! })).toBeVisible()
    await scan(page, id!)
    await page.getByRole('button', { name: 'Fechar', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await page.goto('/entrar')
  await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible()
  await scan(page, 'login')
  await page.getByRole('link', { name: 'Criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Criar conta', exact: true })).toBeVisible()
  await scan(page, 'signup')
  await page.goto('/convite/reuniao/invalid-evidence-invite')
  await expect(page.getByText('Convite indisponível')).toBeVisible()
  await scan(page, 'invite-invalid')
})

test('host and guest journey against disposable real services', async ({ page, context, browser, request }) => {
  await restrictNetwork(context)
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const email = `axe-${unique}@semantia.test`
  const password = `evidence-${unique}-safe`
  const signup = await request.post(`${apiURL}/api/auth/signup`, { data: { name: 'Ana Anfitriã', email, password } })
  expect(signup.ok(), 'Disposable host creation').toBe(true)
  const host = await signup.json() as { accessToken: string }
  secrets.push(host.accessToken, password)

  await page.goto('/entrar')
  await page.getByLabel('E-mail', { exact: true }).fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
  await scan(page, 'app-home', 'host')
  await page.getByRole('link', { name: 'Minhas reuniões' }).first().click()
  await expect(page).toHaveURL(/\/app\/salas$/)
  await scan(page, 'room-list', 'host')
  await page.getByRole('button', { name: 'Nova reunião', exact: true }).click()
  await expect(page).toHaveURL(/\/sala\/[\w-]+$/)
  const sessionId = new URL(page.url()).pathname.split('/').pop()!
  const form = page.getByRole('dialog', { name: 'Configuração da plateia' })
  await expect(form).toBeVisible()
  await scan(page, 'host-context', 'host', 'dark')
  await form.getByRole('button', { name: 'Salvar e continuar' }).click()
  await expect(form.getByRole('alert')).toHaveText('Informe o assunto ou domínio da reunião.')
  await scan(page, 'host-context-error', 'host', 'dark')
  await form.getByLabel('Assunto ou domínio').fill('Bancos de dados relacionais')
  await form.getByRole('switch', { name: 'Controlar quem entra na sala' }).click()
  await form.getByRole('button', { name: 'Salvar e continuar' }).click()
  await expect(form).toHaveCount(0)
  await scan(page, 'host-room-dark', 'host', 'dark')
  await page.getByRole('button', { name: 'Claro', exact: true }).click()
  await expect(page.locator('main.room')).toHaveClass(/room--light/)
  await scan(page, 'host-room-light', 'host', 'light')
  await page.getByRole('button', { name: 'Escuro', exact: true }).click()

  const session = await request.get(`${apiURL}/api/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${host.accessToken}` },
  })
  expect(session.ok(), 'Read invitation for this disposable session').toBe(true)
  const { joinToken } = await session.json() as { joinToken: string }
  expect(typeof joinToken).toBe('string')
  secrets.push(joinToken, sessionId)
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', reducedMotion: 'reduce' })
  await restrictNetwork(guestContext)
  const guest = await guestContext.newPage()
  try {
    await guest.goto(`${webURL}/convite/reuniao/${joinToken}`)
    await expect(guest.getByLabel('Como devemos chamar você?')).toBeVisible()
    await scan(guest, 'invite-valid')
    await guest.getByLabel('Como devemos chamar você?').fill('Bruno Convidado')
    await guest.getByRole('button', { name: 'Entrar na reunião' }).click()
    await expect(guest.getByRole('heading', { name: 'Aguardando aprovação' })).toBeVisible()
    await scan(guest, 'guest-waiting', 'guest', 'dark')
    await page.getByRole('button', { name: /^Pessoas/ }).click()
    await expect(page.getByRole('button', { name: 'Aprovar Bruno Convidado' })).toBeVisible()
    await scan(page, 'host-admission-queue', 'host', 'dark')
    await page.getByRole('button', { name: 'Aprovar Bruno Convidado' }).click()
    await expect(guest.getByRole('heading', { name: 'Aguardando aprovação' })).toHaveCount(0)
    await expect(guest.getByRole('button', { name: /^Levantar mão/ })).toBeVisible()
    await scan(guest, 'guest-room', 'guest', 'dark')
    await guest.getByRole('button', { name: /^Chat/ }).click()
    await guest.getByLabel('Escrever mensagem').fill('Podemos revisar o exemplo de tabela?')
    await guest.getByRole('button', { name: 'Enviar mensagem' }).click()
    await expect(guest.getByText('Podemos revisar o exemplo de tabela?', { exact: true })).toBeVisible()
    await scan(guest, 'guest-chat', 'guest', 'dark')
    await expect(page.getByRole('list', { name: 'Participantes na reunião' }).getByText('Bruno Convidado')).toBeVisible()
    await scan(page, 'host-people', 'host', 'dark')
    await page.getByRole('button', { name: 'Remover Bruno Convidado da sala' }).click()
    await expect(page.getByRole('heading', { name: 'Remover participante?' })).toBeVisible()
    await scan(page, 'host-removal-dialog', 'host', 'dark')
    await page.locator('[aria-labelledby="confirm-remove-title"]').getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('button', { name: 'Fechar painel', exact: true }).click()
    await page.getByRole('button', { name: 'Testar câmera e microfone', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Testar câmera e microfone' })).toBeVisible()
    await scan(page, 'host-device-dialog', 'host', 'dark')
    await page.getByRole('button', { name: 'Fechar teste de câmera e microfone' }).click()

    await page.getByRole('button', { name: /Iniciar transcrição/ }).click()
    await expect(page.locator('.captions__line', { hasText: 'Uma tabela tem linhas e colunas.' }).first()).toBeVisible({ timeout: 45_000 })
    await page.getByRole('button', { name: /Pausar transcrição/ }).click()
    await expect.poll(() => fixtureRequests).toBeGreaterThan(0)
    await scan(page, 'captions-literal', 'host', 'dark')
    const transcript = await request.get(`${apiURL}/api/sessions/${sessionId}/transcript`, {
      headers: { Authorization: `Bearer ${host.accessToken}` },
    })
    expect(transcript.ok(), 'Persisted synthetic transcript').toBe(true)
    await expect.poll(async () => {
      const response = await request.get(`${apiURL}/api/sessions/${sessionId}/transcript`, {
        headers: { Authorization: `Bearer ${host.accessToken}` },
      })
      return JSON.stringify(await response.json()).includes('fake-deterministic-v1')
    }).toBe(true)
    await page.getByRole('button', { name: 'Usando texto literal — clique para adaptado' }).click()
    await expect(page.locator('[data-caption-mode]')).toHaveAttribute('data-caption-mode', 'adapted')
    await scan(page, 'captions-adapted-mode', 'host', 'dark')
    await page.getByRole('button', { name: 'Encerrar reunião', exact: true }).click()
    await page.getByRole('button', { name: 'Confirmar encerramento', exact: true }).click()
    await expect(page.getByText(/Reunião encerrada\. O conteúdo/)).toBeVisible()
    await scan(page, 'meeting-ended', 'host', 'dark')
  } finally {
    await guestContext.close()
  }
})

test('all intended states were scanned and automatic violations are reported', () => {
  expect(states.map((state) => state.id).sort()).toEqual([...expectedStates].sort())
  expect(axeVersion).toBe('4.12.1')
  expect(states.flatMap((state) => state.violations.map((rule) => `${state.id}: ${rule.id}`))).toEqual([])
})
