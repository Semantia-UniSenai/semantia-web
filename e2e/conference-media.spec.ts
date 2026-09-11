import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import process from 'node:process'

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
    ;(window as typeof window & { __semantiaCapturedTracks?: MediaStreamTrack[] })
      .__semantiaCapturedTracks = []
    if (!original) return
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints)
      ;(window as typeof window & { __semantiaCapturedTracks?: MediaStreamTrack[] })
        .__semantiaCapturedTracks?.push(...stream.getTracks())
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

async function capturedTrackIsLive(page: Page, kind: 'audio' | 'video'): Promise<boolean> {
  return page.evaluate((trackKind) => {
    const tracks = (
      window as typeof window & { __semantiaCapturedTracks?: MediaStreamTrack[] }
    ).__semantiaCapturedTracks ?? []
    return tracks.some((track) => track.kind === trackKind && track.readyState === 'live')
  }, kind)
}

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
