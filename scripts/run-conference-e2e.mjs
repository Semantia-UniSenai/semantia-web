import { randomBytes } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const webDir = process.cwd()
const candidateApiDirs = [
  process.env.SEMANTIA_API_DIR,
  path.resolve(webDir, '../semantia-api-midia-sala'),
  path.resolve(webDir, '../semantia-api'),
].filter(Boolean)
const apiDir = candidateApiDirs.find((candidate) =>
  existsSync(path.join(candidate, 'src/modules/media/infrastructure/livekit-media-room.provider.ts')),
)
if (!apiDir) throw new Error('Set SEMANTIA_API_DIR to the Semantia API media worktree')
const manualMode = process.argv.includes('--manual')
const suiteIndex = process.argv.indexOf('--suite')
const suite = suiteIndex === -1 ? 'e2e/conference-media.spec.ts' : process.argv[suiteIndex + 1]
if (!suite || suite.startsWith('--') || !existsSync(path.resolve(webDir, suite))) {
  throw new Error('--suite must name an existing test file in this checkout')
}
if (path.relative(webDir, path.resolve(webDir, suite)).startsWith('..')) {
  throw new Error('--suite must stay inside this checkout')
}
const playwrightArgs = process.argv.slice(2).filter((argument, index) =>
  argument !== '--' && argument !== '--manual' &&
  index + 2 !== suiteIndex && index + 2 !== suiteIndex + 1,
)
const portOffset = Number(process.env.SEMANTIA_E2E_PORT_OFFSET ?? 0)
if (!Number.isInteger(portOffset) || portOffset < 0 || portOffset > 9000) {
  throw new Error('SEMANTIA_E2E_PORT_OFFSET must be an integer from 0 to 9000')
}

const ports = Object.fromEntries(
  Object.entries({ postgres: 55480, api: 30080, web: 41780, livekit: 7880, rtcTcp: 7881, rtcUdp: 7882 })
    .map(([name, port]) => [name, port + portOffset]),
)
const runtimeDir = path.join(webDir, '.e2e-runtime')
const suffix = `${process.pid}-${Date.now()}`
const postgresContainer = `semantia-media-e2e-postgres-${suffix}`
const livekitContainer = `semantia-media-e2e-livekit-${suffix}`
const dockerEnv = { ...process.env, DOCKER_API_VERSION: '1.44' }
const postgresPassword = randomBytes(24).toString('hex')
const jwtSecret = randomBytes(32).toString('hex')
const livekitKey = `e2e_${randomBytes(12).toString('hex')}`
const livekitSecret = randomBytes(32).toString('hex')
const livekitNodeIp = process.env.LIVEKIT_NODE_IP ?? '127.0.0.1'
const livekitRtcBindAddress =
  process.env.LIVEKIT_RTC_BIND_ADDRESS ??
  (livekitNodeIp === '127.0.0.1' ? '127.0.0.1' : livekitNodeIp)
const webkitLibraryDir =
  process.env.SEMANTIA_WEBKIT_LIBRARY_DIR ??
  path.join(process.env.HOME ?? '', '.cache/semantia-webkit-libs/root/usr/lib/x86_64-linux-gnu')
const databaseUrl = `postgresql://semantia:${encodeURIComponent(postgresPassword)}@127.0.0.1:${ports.postgres}/semantia`
const apiUrl = `http://127.0.0.1:${ports.api}`
const webUrl = `http://127.0.0.1:${ports.web}`
const livekitUrl = `ws://127.0.0.1:${ports.livekit}`
const children = []
let cleanupStarted = false

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? webDir,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      if (options.streamOutput) process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      if (options.streamOutput) process.stderr.write(chunk)
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0 || options.allowFailure) resolve({ code, output })
      else reject(new Error(`${options.label ?? command} failed with exit ${code}\n${output.slice(-4000)}`))
    })
  })
}

function startProcess(label, command, args, cwd, env) {
  const logPath = path.join(runtimeDir, `${label}.log`)
  const log = createWriteStream(logPath, { flags: 'w', mode: 0o600 })
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  children.push({ child, log, label })
  return child
}

async function waitForPort(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
      socket.setTimeout(500, () => {
        socket.destroy()
        resolve(false)
      })
    })
    if (ready) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Port ${port} did not become ready`)
}

async function assertPortsFree() {
  for (const port of Object.values(ports)) {
    try {
      await waitForPort(port, 150)
    } catch {
      continue
    }
    throw new Error(`Required loopback port ${port} is already in use`)
  }
}

async function waitForHealth(url, validate, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok && (await validate(response))) return
    } catch {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Health endpoint did not become ready: ${url}`)
}

async function stopProcess(entry) {
  if (entry.child.exitCode !== null) {
    entry.log.end()
    return
  }
  try {
    process.kill(-entry.child.pid, 'SIGTERM')
  } catch {
    // Process already exited.
  }
  await Promise.race([
    new Promise((resolve) => entry.child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ])
  if (entry.child.exitCode === null) {
    try {
      process.kill(-entry.child.pid, 'SIGKILL')
    } catch {
      // Process already exited.
    }
  }
  entry.log.end()
}

async function cleanup() {
  if (cleanupStarted) return
  cleanupStarted = true
  for (const entry of [...children].reverse()) await stopProcess(entry)
  await run('/usr/bin/docker', ['rm', '-f', livekitContainer, postgresContainer], {
    env: dockerEnv,
    allowFailure: true,
  })
}

async function captureContainerLogs() {
  for (const [name, filename] of [
    [livekitContainer, 'livekit.log'],
    [postgresContainer, 'postgres.log'],
  ]) {
    const result = await run('/usr/bin/docker', ['logs', name], {
      env: dockerEnv,
      allowFailure: true,
    })
    await writeFile(path.join(runtimeDir, filename), result.output, { mode: 0o600 })
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(130))
  })
}

async function main() {
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 })
  await assertPortsFree()

  await run(
    '/usr/bin/docker',
    [
      'run', '-d', '--name', postgresContainer,
      '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=512m',
      '--health-cmd', 'pg_isready -U semantia -d semantia',
      '--health-interval', '1s', '--health-timeout', '2s', '--health-retries', '30',
      '-e', 'POSTGRES_USER=semantia',
      '-e', `POSTGRES_PASSWORD=${postgresPassword}`,
      '-e', 'POSTGRES_DB=semantia',
      '-p', `127.0.0.1:${ports.postgres}:5432`,
      'postgres:16',
    ],
    { env: dockerEnv, label: 'PostgreSQL startup' },
  )
  await waitForPort(ports.postgres)

  await run(
    '/usr/bin/docker',
    [
      'run', '-d', '--name', livekitContainer,
      '-e', `LIVEKIT_KEYS=${livekitKey}: ${livekitSecret}`,
      '-e', `LIVEKIT_CONFIG=port: ${ports.livekit}\nrtc:\n  tcp_port: ${ports.rtcTcp}\nroom:\n  auto_create: false`,
      '-p', `127.0.0.1:${ports.livekit}:${ports.livekit}`,
      '-p', `${livekitRtcBindAddress}:${ports.rtcTcp}:${ports.rtcTcp}`,
      '-p', `${livekitRtcBindAddress}:${ports.rtcUdp}:${ports.rtcUdp}/udp`,
      'livekit/livekit-server:v1.9.10',
      '--bind', '0.0.0.0', '--node-ip', livekitNodeIp, '--udp-port', String(ports.rtcUdp),
    ],
    { env: dockerEnv, label: 'LiveKit startup' },
  )
  await waitForHealth(`http://127.0.0.1:${ports.livekit}`, async () => true)

  const apiEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(ports.api),
    CORS_ORIGIN: webUrl,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    LIVEKIT_URL: livekitUrl,
    LIVEKIT_API_KEY: livekitKey,
    LIVEKIT_API_SECRET: livekitSecret,
    LIVEKIT_TOKEN_TTL_SECONDS: '600',
    LIVEKIT_REQUEST_TIMEOUT_SECONDS: '5',
  }
  await run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: apiEnv,
    label: 'Prisma migrations',
  })
  await run('pnpm', ['build'], { cwd: apiDir, env: apiEnv, label: 'API build' })
  startProcess(
    'api',
    'pnpm',
    ['exec', 'ts-node', '--transpile-only', '-r', 'tsconfig-paths/register', 'src/main.ts'],
    apiDir,
    apiEnv,
  )
  await waitForHealth(`${apiUrl}/api/health`, async (response) => {
    const body = await response.json()
    return body.status === 'ok' && body.db === true
  })

  const webEnv = { ...process.env, VITE_API_URL: apiUrl }
  await run('pnpm', ['build'], { cwd: webDir, env: webEnv, label: 'Web build' })
  startProcess(
    'web',
    'pnpm',
    ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(ports.web), '--strictPort'],
    webDir,
    webEnv,
  )
  await waitForHealth(webUrl, async (response) => (await response.text()).includes('<div id="app">'))

  console.log(`Semantia media ${manualMode ? 'manual' : 'E2E'} runtime ready at ${webUrl}`)
  if (manualMode) {
    await new Promise(() => undefined)
    return
  }
  let result
  try {
    result = await run(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        suite,
        ...playwrightArgs,
      ],
      {
        cwd: webDir,
        env: {
          ...process.env,
          E2E_API_URL: apiUrl,
          E2E_WEB_URL: webUrl,
          LD_LIBRARY_PATH: [webkitLibraryDir, process.env.LD_LIBRARY_PATH]
            .filter(Boolean)
            .join(':'),
        },
        label: 'Playwright media E2E',
        streamOutput: true,
      },
    )
  } catch (cause) {
    await captureContainerLogs()
    throw cause
  }
  process.stdout.write(result.output)
}

try {
  await main()
} finally {
  await cleanup()
}
