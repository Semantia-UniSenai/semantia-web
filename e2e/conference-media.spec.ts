import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface MeetingFixture {
  meetingId: string
  host: { accessToken: string; user: { id: string; name: string; email: string } }
  guest: {
    accessToken: string
    sessionId: string
    participant: { participantId: string; name: string; role: string }
  }
}

const apiURL = process.env.E2E_API_URL ?? 'http://127.0.0.1:30080'
const livekitBundle = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../node_modules/livekit-client/dist/livekit-client.umd.js',
)

test.use({ trace: 'off' })

async function createMeeting(request: APIRequestContext): Promise<MeetingFixture> {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const hostResponse = await request.post(`${apiURL}/api/auth/signup`, {
    data: {
      name: 'Ana Anfitriã',
      email: `media-${unique}@semantia.test`,
      password: `e2e-${unique}-safe`,
    },
  })
  expect(hostResponse.ok()).toBe(true)
  const host = (await hostResponse.json()) as MeetingFixture['host']

  const meetingResponse = await request.post(`${apiURL}/api/rooms`, {
    headers: { Authorization: `Bearer ${host.accessToken}` },
    data: {},
  })
  expect(meetingResponse.ok()).toBe(true)
  const meeting = (await meetingResponse.json()) as {
    meetingId: string
    joinToken: string
  }

  const guestResponse = await request.post(`${apiURL}/api/sessions/guest-access`, {
    data: {
      joinToken: meeting.joinToken,
      displayName: 'Bruno Convidado',
    },
  })
  expect(guestResponse.ok()).toBe(true)
  const guest = (await guestResponse.json()) as MeetingFixture['guest']

  return { meetingId: meeting.meetingId, host, guest }
}

async function installMediaProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
    const probeWindow = window as typeof window & {
      __semantiaCapturedTracks?: MediaStreamTrack[]
      __semantiaPeerConnections?: RTCPeerConnection[]
    }
    probeWindow.__semantiaCapturedTracks = []
    probeWindow.__semantiaPeerConnections = []
    if (/Chrome|Chromium/.test(navigator.userAgent)) {
      const NativePeerConnection = window.RTCPeerConnection
      window.RTCPeerConnection = class extends NativePeerConnection {
        constructor(configuration?: RTCConfiguration) {
          super(configuration)
          probeWindow.__semantiaPeerConnections?.push(this)
        }
      }
    }
    if (!original) return
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints)
      probeWindow.__semantiaCapturedTracks?.push(...stream.getTracks())
      return stream
    }
  })
}

async function installHostSession(page: Page, fixture: MeetingFixture): Promise<void> {
  await page.addInitScript(({ accessToken, user }) => {
    localStorage.setItem('semantia.token', accessToken)
    localStorage.setItem('semantia.user', JSON.stringify(user))
  }, fixture.host)
  await installMediaProbe(page)
}

async function installGuestSession(page: Page, fixture: MeetingFixture): Promise<void> {
  await page.addInitScript(({ guest, meetingId }) => {
    sessionStorage.setItem(`semantia.guest.${meetingId}`, JSON.stringify(guest))
  }, { guest: fixture.guest, meetingId: fixture.meetingId })
  await installMediaProbe(page)
}

async function storageKeys(page: Page): Promise<{ local: string[]; session: string[] }> {
  return page.evaluate(() => ({
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage).sort(),
  }))
}

async function capturedTracksEnded(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const tracks = (
      window as typeof window & { __semantiaCapturedTracks?: MediaStreamTrack[] }
    ).__semantiaCapturedTracks ?? []
    return tracks.length > 0 && tracks.every((track) => track.readyState === 'ended')
  })
}

async function attachedAudioIsLive(page: Page, label: string): Promise<boolean> {
  return page.getByLabel(label).evaluate((element) => {
    const stream = (element as HTMLAudioElement).srcObject as MediaStream | null
    return !!stream?.getAudioTracks().some((track) => track.readyState === 'live')
  })
}

async function inboundAudioStats(page: Page): Promise<{ bytes: number; packets: number }> {
  return page.evaluate(async () => {
    const peerConnections = (
      window as typeof window & { __semantiaPeerConnections?: RTCPeerConnection[] }
    ).__semantiaPeerConnections ?? []
    let bytes = 0
    let packets = 0
    for (const peerConnection of peerConnections) {
      const reports = await peerConnection.getStats()
      reports.forEach((report) => {
        if (
          report.type === 'inbound-rtp' &&
          (report.kind === 'audio' || report.mediaType === 'audio')
        ) {
          bytes += report.bytesReceived ?? 0
          packets += report.packetsReceived ?? 0
        }
      })
    }
    return { bytes, packets }
  })
}

async function attachedAudioRms(page: Page, label: string): Promise<number> {
  return page.getByLabel(label).evaluate(async (element) => {
    const stream = (element as HTMLAudioElement).srcObject as MediaStream | null
    if (!stream) return 0
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    await context.resume()
    const samples = new Float32Array(analyser.fftSize)
    let maximum = 0
    for (let index = 0; index < 8; index += 1) {
      analyser.getFloatTimeDomainData(samples)
      const meanSquare = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
      maximum = Math.max(maximum, Math.sqrt(meanSquare))
      await new Promise((resolve) => window.setTimeout(resolve, 50))
    }
    source.disconnect()
    analyser.disconnect()
    await context.close()
    return maximum
  })
}

interface SocketAck {
  ok: boolean
  error?: { code: string; message: string }
  participantToken?: string
  serverUrl?: string
  roomName?: string
  participantIdentity?: string
}

function emitAck(socket: Socket, event: string, payload?: object): Promise<SocketAck> {
  return new Promise((resolve) => {
    if (payload) socket.emit(event, payload, resolve)
    else socket.emit(event, resolve)
  })
}

async function connectHostSocket(fixture: MeetingFixture): Promise<Socket> {
  const socket = io(`${apiURL}/live`, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: fixture.host.accessToken },
  })
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', () => reject(new Error('socket connection failed')))
  })
  const joined = await emitAck(socket, 'session:join', { sessionId: fixture.meetingId })
  if (!joined.ok) {
    socket.disconnect()
    throw new Error(`session join failed: ${joined.error?.code ?? 'UNKNOWN'}`)
  }
  return socket
}

async function livekitConnectionSucceeds(
  page: Page,
  credentials: { url: string; token: string },
): Promise<boolean> {
  await page.goto('/')
  await page.addScriptTag({ path: livekitBundle })
  return page.evaluate(async ({ url, token }) => {
    const LivekitClient = (
      window as typeof window & {
        LivekitClient: {
          Room: new (options?: object) => {
            connect(url: string, token: string, options?: object): Promise<void>
            disconnect(): Promise<void>
          }
        }
      }
    ).LivekitClient
    const room = new LivekitClient.Room({ autoSubscribe: false })
    try {
      await room.connect(url, token)
      await room.disconnect()
      return true
    } catch {
      await room.disconnect().catch(() => undefined)
      return false
    }
  }, credentials)
}

async function capturedTrackIsLive(page: Page, kind: 'audio' | 'video'): Promise<boolean> {
  return page.evaluate((trackKind) => {
    const tracks = (
      window as typeof window & { __semantiaCapturedTracks?: MediaStreamTrack[] }
    ).__semantiaCapturedTracks ?? []
    return tracks.some((track) => track.kind === trackKind && track.readyState === 'live')
  }, kind)
}

test('keeps context open without media capture when save fails and succeeds on retry', async ({
  page,
  request,
}) => {
  const fixture = await createMeeting(request)
  await installHostSession(page, fixture)
  let contextAttempts = 0
  await page.route('**/api/sessions/*/context', async (route) => {
    contextAttempts += 1
    if (contextAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'temporary failure' }),
      })
      return
    }
    await route.continue()
  })

  await page.goto(`/sala/${fixture.meetingId}`)
  const contextForm = page.getByRole('dialog', { name: 'Configuração da plateia' })
  await expect(contextForm).toBeVisible()
  await contextForm
    .getByRole('textbox', { name: 'Assunto ou domínio', exact: true })
    .fill('Planejamento do projeto')
  await contextForm.getByRole('button', { name: 'Salvar e continuar' }).click()

  await expect(contextForm).toBeVisible()
  await expect(
    contextForm.getByText('Não foi possível salvar o contexto. Tente novamente.'),
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __semantiaCapturedTracks?: MediaStreamTrack[] })
            .__semantiaCapturedTracks?.length ?? 0,
      ),
    )
    .toBe(0)

  await contextForm.getByRole('button', { name: 'Salvar e continuar' }).click()
  await expect(contextForm).toBeHidden()
  expect(contextAttempts).toBe(2)

  const captionMode = page.locator('.captions__mode-toggle')
  await expect(captionMode).toHaveAttribute('data-caption-mode', 'literal')
  await expect(captionMode).toHaveAttribute('aria-pressed', 'false')
  await captionMode.click()
  await expect(captionMode).toHaveAttribute('data-caption-mode', 'adapted')
  await expect(captionMode).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('semantia.captions.mode')))
    .toBe('adapted')

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __semantiaCapturedTracks?: MediaStreamTrack[] })
            .__semantiaCapturedTracks?.length ?? 0,
      ),
    )
    .toBe(0)

  const sessionResponse = await request.get(
    `${apiURL}/api/sessions/${fixture.meetingId}`,
    { headers: { Authorization: 'Bearer ' + fixture.host.accessToken } },
  )
  expect(sessionResponse.ok()).toBe(true)
  expect(await sessionResponse.json()).toMatchObject({
    audienceContext: { domain: 'Planejamento do projeto' },
  })
})

test('previews camera and audibly monitors microphone locally without publishing', async ({
  page,
  request,
}) => {
  const fixture = await createMeeting(request)
  await installHostSession(page, fixture)
  await page.goto(`/sala/${fixture.meetingId}`)

  const skipContext = page.getByRole('button', { name: 'Pular por enquanto' })
  if (await skipContext.isVisible()) await skipContext.click()
  await expect(page.getByText('Chamada conectada')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Testar câmera e microfone' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Escolher e testar microfone' })).toHaveCount(0)
  await expect(page.locator('.mic__device-trigger, .mic-settings')).toHaveCount(0)

  const callMicrophone = page.getByRole('button', {
    name: 'Ativar microfone da chamada',
  })
  const callCamera = page.getByRole('button', { name: 'Ativar câmera da chamada' })
  await page.getByRole('button', { name: 'Testar câmera e microfone' }).click()
  const dialog = page.getByRole('dialog', { name: 'Testar câmera e microfone' })

  await dialog.getByRole('button', { name: 'Testar câmera', exact: true }).click()
  const preview = dialog.getByLabel('Prévia da sua câmera')
  await expect(preview).toBeVisible()
  await expect.poll(() => capturedTrackIsLive(page, 'video')).toBe(true)
  await expect
    .poll(() =>
      preview.evaluate((element) => {
        const video = element as HTMLVideoElement
        return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0
      }),
    )
    .toBe(true)
  await expect(callCamera).toHaveAttribute('aria-pressed', 'false')
  await dialog.getByRole('button', { name: 'Parar teste da câmera' }).click()

  await dialog.getByRole('button', { name: 'Ouvir meu microfone' }).click()
  await expect(dialog.getByText('Você está ouvindo seu próprio microfone.')).toBeVisible()
  await expect.poll(() => capturedTrackIsLive(page, 'audio')).toBe(true)
  await expect(callMicrophone).toHaveAttribute('aria-pressed', 'false')
  await dialog.getByRole('button', { name: 'Parar teste do microfone' }).click()

  await expect.poll(() => capturedTracksEnded(page)).toBe(true)

  await dialog.getByRole('button', { name: 'Fechar teste de câmera e microfone' }).click()
  await callMicrophone.click()
  await callCamera.click()
  await expect(callMicrophone).toHaveAttribute('aria-pressed', 'true')
  await expect(callCamera).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Testar câmera e microfone' }).click()
  await dialog.getByRole('button', { name: 'Testar câmera', exact: true }).click()
  await expect(callCamera).toHaveAttribute('aria-pressed', 'false')
  await dialog.getByRole('button', { name: 'Parar teste da câmera' }).click()
  await expect(callCamera).toHaveAttribute('aria-pressed', 'true')

  await dialog.getByRole('button', { name: 'Ouvir meu microfone' }).click()
  await expect(callMicrophone).toHaveAttribute('aria-pressed', 'false')
  await dialog.getByRole('button', { name: 'Parar teste do microfone' }).click()
  await expect(callMicrophone).toHaveAttribute('aria-pressed', 'true')

  await dialog.getByRole('button', { name: 'Fechar teste de câmera e microfone' }).click()
  await callMicrophone.click()
  await callCamera.click()
  await expect.poll(() => capturedTracksEnded(page)).toBe(true)
})

// A prévia local é um recurso da reunião e deve obedecer ao mesmo encerramento terminal.
test('stops a local camera preview when the canonical meeting end arrives', async ({
  page,
  request,
}) => {
  const fixture = await createMeeting(request)
  await installHostSession(page, fixture)
  await page.goto(`/sala/${fixture.meetingId}`)
  const skipContext = page.getByRole('button', { name: 'Pular por enquanto' })
  if (await skipContext.isVisible()) await skipContext.click()
  await expect(page.getByText('Chamada conectada')).toBeVisible()

  await page.getByRole('button', { name: 'Testar câmera e microfone' }).click()
  const dialog = page.getByRole('dialog', { name: 'Testar câmera e microfone' })
  await dialog.getByRole('button', { name: 'Testar câmera', exact: true }).click()
  await expect.poll(() => capturedTrackIsLive(page, 'video')).toBe(true)

  await page
    .getByRole('button', { name: 'Encerrar reunião' })
    .evaluate((button) => (button as HTMLButtonElement).click())
  await page
    .getByRole('button', { name: 'Confirmar encerramento' })
    .evaluate((button) => (button as HTMLButtonElement).click())

  await expect(page.getByText(/Reunião encerrada\. O conteúdo/)).toBeVisible()
  await expect(page.getByLabel('Prévia da sua câmera')).toHaveCount(0)
  await expect.poll(() => capturedTracksEnded(page)).toBe(true)
})

// O teste desativa trace para que a credencial efêmera nunca seja gravada em artefato.
test('an old media token cannot recreate a room after canonical end', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop')
  const fixture = await createMeeting(request)
  const socket = await connectHostSocket(fixture)
  try {
    const credentials = await emitAck(socket, 'media:credentials')
    if (!credentials.ok || !credentials.serverUrl || !credentials.participantToken) {
      throw new Error(`media credentials failed: ${credentials.error?.code ?? 'UNKNOWN'}`)
    }
    const ephemeralCredentials = {
      url: credentials.serverUrl,
      token: credentials.participantToken,
    }

    expect(await livekitConnectionSucceeds(page, ephemeralCredentials)).toBe(true)
    const ended = await emitAck(socket, 'session:end')
    expect(ended.ok).toBe(true)
    expect(await livekitConnectionSucceeds(page, ephemeralCredentials)).toBe(false)
  } finally {
    socket.disconnect()
  }
})

test('connects two admitted people with ephemeral audio and camera media', async ({
  browser,
  page: hostPage,
  request,
}, testInfo) => {
  const fixture = await createMeeting(request)
  await installHostSession(hostPage, fixture)

  const viewport = hostPage.viewportSize() ?? { width: 1280, height: 720 }
  const projectUse = testInfo.project.use
  const guestContext = await browser.newContext({
    viewport,
    permissions: testInfo.project.name.startsWith('firefox')
      ? []
      : ['camera', 'microphone'],
    userAgent: projectUse.userAgent,
    deviceScaleFactor: projectUse.deviceScaleFactor,
    hasTouch: projectUse.hasTouch,
    isMobile: projectUse.isMobile,
  })
  const guestPage = await guestContext.newPage()
  await installGuestSession(guestPage, fixture)

  try {
    await Promise.all([
      hostPage.goto(`/sala/${fixture.meetingId}`),
      guestPage.goto(`/sala/${fixture.meetingId}`),
    ])

    const skipContext = hostPage.getByRole('button', { name: 'Pular por enquanto' })
    if (await skipContext.isVisible()) await skipContext.click()

    await expect(hostPage.getByText('Chamada conectada')).toBeVisible()
    await expect(guestPage.getByText('Chamada conectada')).toBeVisible()

    const hostMicrophone = hostPage.getByRole('button', {
      name: 'Ativar microfone da chamada',
    })
    const guestMicrophone = guestPage.getByRole('button', {
      name: 'Ativar microfone da chamada',
    })
    const hostCamera = hostPage.getByRole('button', { name: 'Ativar câmera da chamada' })

    await expect(hostMicrophone).toHaveAttribute('aria-pressed', 'false')
    await expect(guestMicrophone).toHaveAttribute('aria-pressed', 'false')
    await expect(hostCamera).toHaveAttribute('aria-pressed', 'false')
    await expect(hostPage.locator('audio, video')).toHaveCount(0)
    await expect(guestPage.locator('audio, video')).toHaveCount(0)

    const hostStorageBefore = await storageKeys(hostPage)
    const guestStorageBefore = await storageKeys(guestPage)

    await hostMicrophone.click()
    await guestMicrophone.click()

    await expect(hostPage.locator('audio')).toHaveCount(1)
    await expect(guestPage.locator('audio')).toHaveCount(1)
    expect(await hostPage.locator('audio').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))).toEqual([
      'Áudio de Bruno Convidado',
    ])
    expect(await guestPage.locator('audio').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))).toEqual([
      'Áudio de Ana Anfitriã',
    ])
    await expect
      .poll(() => attachedAudioIsLive(hostPage, 'Áudio de Bruno Convidado'))
      .toBe(true)
    await expect
      .poll(() => attachedAudioIsLive(guestPage, 'Áudio de Ana Anfitriã'))
      .toBe(true)
    const playback = await guestPage.getByLabel('Áudio de Ana Anfitriã').evaluate((element) => ({
      paused: (element as HTMLAudioElement).paused,
      volume: (element as HTMLAudioElement).volume,
    }))
    expect(playback).toEqual({ paused: false, volume: 1 })
    if (testInfo.project.name.startsWith('chromium')) {
      const inboundBefore = await inboundAudioStats(guestPage)
      await expect
        .poll(async () => {
          const stats = await inboundAudioStats(guestPage)
          return stats.bytes > inboundBefore.bytes && stats.packets > inboundBefore.packets
        })
        .toBe(true)
      expect(await attachedAudioRms(guestPage, 'Áudio de Ana Anfitriã')).toBeGreaterThan(0.001)
    }

    await hostCamera.click()
    const hostVideoTile = hostPage.getByRole('listitem', { name: /Vídeo de Ana Anfitriã/ })
    const guestVideoTile = guestPage.getByRole('listitem', { name: /Vídeo de Ana Anfitriã/ })
    const guestTileOnHost = hostPage.getByRole('listitem', { name: /Vídeo de Bruno Convidado/ })
    const guestTileOnGuest = guestPage.getByRole('listitem', { name: /Vídeo de Bruno Convidado/ })
    await expect(hostVideoTile).toBeVisible()
    await expect(guestVideoTile).toBeVisible()
    await expect(guestTileOnHost).toBeVisible()
    const overlayGeometry = await hostVideoTile.evaluate((tile) => {
      const tileBox = tile.getBoundingClientRect()
      const overlayBox = tile.querySelector('.conference-tile__identity')!.getBoundingClientRect()
      return { height: overlayBox.height, widthRatio: overlayBox.width / tileBox.width }
    })
    expect(overlayGeometry.height).toBeLessThanOrEqual(32)
    expect(overlayGeometry.widthRatio).toBeLessThan(0.75)

    await guestPage.getByRole('button', { name: /^Levantar mão/ }).click()
    await expect(guestTileOnHost).toHaveAttribute('aria-label', /Mão levantada/)
    await expect(guestTileOnGuest).toHaveAttribute('aria-label', /Mão levantada/)
    await expect(guestTileOnHost.locator('[title="Mão levantada"]')).toBeVisible()

    await guestPage.getByRole('button', { name: /^Baixar mão/ }).click()
    await expect(guestTileOnHost).not.toHaveAttribute('aria-label', /Mão levantada/)
    await expect(guestTileOnGuest).not.toHaveAttribute('aria-label', /Mão levantada/)
    await expect(guestTileOnHost.locator('[title="Mão levantada"]')).toHaveCount(0)

    await hostPage.getByRole('button', { name: 'Desativar microfone da chamada' }).click()
    await expect(
      guestPage.getByRole('listitem', {
        name: /Vídeo de Ana Anfitriã.*Microfone desligado/,
      }),
    ).toBeVisible()

    const hostStorageAfter = await storageKeys(hostPage)
    const guestStorageAfter = await storageKeys(guestPage)
    const allowedDeviceKeys = new Set([
      'semantia.audio-input-device-id',
      'semantia.video-input-device-id',
    ])
    const hostAddedKeys = hostStorageAfter.local.filter(
      (key) => !hostStorageBefore.local.includes(key),
    )
    const guestAddedKeys = guestStorageAfter.local.filter(
      (key) => !guestStorageBefore.local.includes(key),
    )
    expect(hostAddedKeys.every((key) => allowedDeviceKeys.has(key))).toBe(true)
    expect(guestAddedKeys.every((key) => allowedDeviceKeys.has(key))).toBe(true)
    expect(hostStorageAfter.session).toEqual(hostStorageBefore.session)
    expect(guestStorageAfter.session).toEqual(guestStorageBefore.session)
    expect(hostPage.url()).not.toContain('token=')
    expect(guestPage.url()).not.toContain('token=')

    await hostPage.getByRole('button', { name: 'Encerrar reunião' }).click()
    await hostPage.getByRole('button', { name: 'Confirmar encerramento' }).click()

    await expect(hostPage.getByText(/Reunião encerrada\. O conteúdo/)).toBeVisible()
    await expect(guestPage.getByText(/Reunião encerrada\. O conteúdo/)).toBeVisible()
    await expect(hostPage.locator('audio, video')).toHaveCount(0)
    await expect(guestPage.locator('audio, video')).toHaveCount(0)
    await expect.poll(() => capturedTracksEnded(hostPage)).toBe(true)
    await expect.poll(() => capturedTracksEnded(guestPage)).toBe(true)
  } finally {
    await guestContext.close()
  }
})

test('shows an explicit recovery action when autoplay blocked', async ({
  browser,
  page: hostPage,
  request,
}) => {
  const fixture = await createMeeting(request)
  await installHostSession(hostPage, fixture)
  const guestContext = await browser.newContext({
    viewport: hostPage.viewportSize() ?? { width: 1280, height: 720 },
    permissions: ['camera', 'microphone'],
  })
  const guestPage = await guestContext.newPage()
  await installGuestSession(guestPage, fixture)
  await guestPage.addInitScript(() => {
    const nativePlay = HTMLMediaElement.prototype.play
    let playbackAllowed = false
    document.addEventListener(
      'pointerdown',
      () => {
        playbackAllowed = true
      },
      { capture: true },
    )
    HTMLMediaElement.prototype.play = function () {
      if (!playbackAllowed) {
        return Promise.reject(
          new DOMException('Playback requires a user gesture', 'NotAllowedError'),
        )
      }
      return nativePlay.call(this)
    }
  })

  try {
    await Promise.all([
      hostPage.goto(`/sala/${fixture.meetingId}`),
      guestPage.goto(`/sala/${fixture.meetingId}`),
    ])
    const skipContext = hostPage.getByRole('button', { name: 'Pular por enquanto' })
    if (await skipContext.isVisible()) await skipContext.click()
    await expect(hostPage.getByText('Chamada conectada')).toBeVisible()
    await expect(guestPage.getByText('Chamada conectada')).toBeVisible()

    await hostPage.getByRole('button', { name: 'Ativar microfone da chamada' }).click()
    await expect(guestPage.getByLabel('Áudio de Ana Anfitriã')).toBeAttached()
    const resume = guestPage.getByRole('button', { name: 'Ativar áudio da chamada' })
    await expect(resume).toBeVisible()
    await resume.click()

    await expect(resume).toHaveCount(0)
    await expect
      .poll(() =>
        guestPage
          .getByLabel('Áudio de Ana Anfitriã')
          .evaluate((element) => !(element as HTMLAudioElement).paused),
      )
      .toBe(true)
  } finally {
    await guestContext.close()
  }
})
