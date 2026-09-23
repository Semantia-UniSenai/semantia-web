import { computed, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AckError,
  AdmissionEntry,
  ChatMessage,
  LiveSessionDetails,
  Participant,
  ParticipantRole,
  RaisedHand,
  TranscriptEntry,
} from '../live/types'

let liveMock: ReturnType<typeof createLiveMock>
let audioMock: ReturnType<typeof createAudioMock>
let videoMock: ReturnType<typeof createVideoMock>
let transcriptionMock: ReturnType<typeof createTranscriptionMock>
let conferenceMock!: ReturnType<typeof createConferenceMock>
let sharedMicrophoneSourceMock!: ReturnType<typeof createSharedMicrophoneSourceMock>
let conferenceOptions: Record<string, unknown> | null
let transcriptionOptions: {
  onAudioSegment?: (segment: unknown) => Promise<unknown>
  microphoneSource?: unknown
  onPartial?: unknown
  onFinal?: unknown
} | null
let audioInputOptions: Record<string, unknown> | undefined
let compactViewport = false

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  route: {
    params: { sessionId: 'meeting-1' },
    query: {},
  },
}))
const switchSharedMicrophoneDeviceMock = vi.hoisted(() => vi.fn())
const sessionContextMocks = vi.hoisted(() => ({
  updateSessionContext: vi.fn(),
  patchSessionSettings: vi.fn(),
}))

vi.mock('../api/sessions-context', () => sessionContextMocks)

vi.mock('vue-router', () => ({
  RouterLink: {
    props: ['to'],
    template: '<a :href="String(to)"><slot /></a>',
  },
  useRoute: () => routerMocks.route,
  useRouter: () => ({ push: routerMocks.push }),
}))

vi.mock('../live/useLiveSession', () => ({
  useLiveSession: () => liveMock,
}))

vi.mock('../live/useAudioInputDevices', () => ({
  useAudioInputDevices: (options?: Record<string, unknown>) => {
    audioInputOptions = options
    return audioMock
  },
}))

vi.mock('../live/useVideoInputDevices', () => ({
  useVideoInputDevices: () => videoMock,
}))

vi.mock('../live/useMeetingTranscription', () => ({
  useMeetingTranscription: (options: typeof transcriptionOptions) => {
    transcriptionOptions = options
    return transcriptionMock
  },
}))

vi.mock('../live/useConferenceMedia', () => ({
  useConferenceMedia: (options: Record<string, unknown>) => {
    conferenceOptions = options
    return conferenceMock
  },
}))

vi.mock('../live/media/shared-microphone-source', () => ({
  BrowserSharedMicrophoneSource: class {
    constructor() {
      return sharedMicrophoneSourceMock
    }
  },
}))

vi.mock('../live/switch-shared-microphone-device', () => ({
  switchSharedMicrophoneDevice: switchSharedMicrophoneDeviceMock,
}))

import LiveRoomView from './LiveRoomView.vue'

function createLiveMock() {
  const session = ref<LiveSessionDetails | null>({
    id: 'meeting-1',
    title: 'Reunião de produto',
    roomId: 'room-1',
    joinToken: 'invite-token',
    status: 'LIVE',
    requiresApproval: false,
    audienceContext: null,
    createdAt: '2026-07-31T12:00:00.000Z',
    startedAt: '2026-07-31T12:00:00.000Z',
    endedAt: null,
    roomName: 'Reunião de produto',
    hostId: 'host-1',
    hostName: 'Cauê',
  })
  const role = ref<ParticipantRole | null>('HOST')
  const ended = computed(() => session.value?.status === 'ENDED')
  const status = ref<'offline' | 'connecting' | 'connected'>('connected')

  return {
    status,
    joinError: ref<AckError | null>(null),
    actionError: ref<AckError | null>(null),
    session,
    role,
    canManage: ref(true),
    participants: ref<Participant[]>([
      { participantId: 'host-1', name: 'Cauê', role: 'HOST' },
    ]),
    raisedHands: ref<RaisedHand[]>([]),
    chat: ref<ChatMessage[]>([]),
    transcript: ref<TranscriptEntry[]>([]),
    pendingAudioCount: ref(0),
    transcriptionStatus: ref(null),
    ended,
    canPublishTranscript: computed(() => role.value === 'HOST' && !ended.value),
    joined: computed(() => !!session.value && status.value === 'connected'),
    currentParticipantId: ref<string | null>('host-1'),
    connect: vi.fn(),
    disconnect: vi.fn(),
    publishAudioSegment: vi.fn().mockResolvedValue({ ok: true }),
    requestMediaCredentials: vi.fn().mockResolvedValue({
      ok: true,
      serverUrl: 'wss://media.example.test',
      participantToken: 'ephemeral-token',
      expiresInSeconds: 600,
    }),
    waitForAudioDrain: vi.fn().mockResolvedValue(true),
    sendChat: vi.fn(),
    raiseHand: vi.fn(),
    lowerHand: vi.fn(),
    lowerParticipantHand: vi.fn(),
    updateAudienceContext: vi.fn(),
    updateAdmissionPolicy: vi.fn(),
    endSession: vi.fn(),
    admissionStatus: ref<'none' | 'waiting' | 'denied' | 'removed'>('none'),
    admissionQueue: ref<AdmissionEntry[]>([]),
    approveAdmission: vi.fn().mockResolvedValue({ ok: true }),
    rejectAdmission: vi.fn().mockResolvedValue({ ok: true }),
    removeParticipant: vi.fn().mockResolvedValue({ ok: true }),
  }
}

function createAudioMock() {
  return {
    supported: true,
    devices: ref([]),
    selectedDeviceId: ref('default'),
    loading: ref(false),
    error: ref(null),
    testState: ref('idle'),
    testLevel: ref(0),
    testMonitorEnabled: ref(false),
    refresh: vi.fn(),
    selectDevice: vi.fn(),
    startTest: vi.fn(),
    stopTest: vi.fn(),
  }
}

function createVideoMock() {
  return {
    supported: true,
    devices: ref([
      { deviceId: 'default', groupId: 'g1', label: 'Câmera integrada' },
      { deviceId: 'usb-camera', groupId: 'g2', label: 'Webcam USB' },
    ]),
    selectedDeviceId: ref('default'),
    loading: ref(false),
    error: ref(null),
    testState: ref('idle'),
    testStream: ref<MediaStream | null>(null),
    refresh: vi.fn(),
    selectDevice: vi.fn(),
    startTest: vi.fn().mockResolvedValue(undefined),
    stopTest: vi.fn().mockResolvedValue(undefined),
  }
}

function createTranscriptionMock() {
  return {
    supported: true,
    listening: ref(false),
    loading: ref(false),
    error: ref<string | null>(null),
    inputState: ref<'idle' | 'waiting' | 'receiving'>('idle'),
    audioLevel: ref(0),
    qualityStatus: ref<'idle' | 'ready' | 'processing' | 'error'>('idle'),
    start: vi.fn(),
    stop: vi.fn(),
  }
}

function createConferenceMock() {
  return {
    mediaStatus: ref('connected'),
    mediaError: ref(null),
    microphoneEnabled: ref(false),
    cameraEnabled: ref(false),
    microphonePending: ref(false),
    cameraPending: ref(false),
    audioPlaybackBlocked: ref(false),
    participants: ref([]),
    tracks: ref([]),
    toggleMicrophone: vi.fn().mockResolvedValue(undefined),
    toggleCamera: vi.fn().mockResolvedValue(undefined),
    switchDevice: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    startAudio: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }
}

function createSharedMicrophoneSourceMock() {
  return {
    acquire: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
  }
}

function mountRoom() {
  return mount(LiveRoomView, {
    attachTo: document.body,
    global: {
      stubs: {
        CaptionStage: {
          props: ['transcript', 'partialText', 'captionState'],
          template: '<section data-testid="caption-stage" :data-caption-state="captionState">Legenda</section>',
        },
        ChatPanel: {
          props: ['messages', 'myParticipantId', 'disabled'],
          template: '<div data-testid="chat-panel"><input data-testid="panel-input"><button data-testid="panel-action">Enviar</button></div>',
        },
        MicControl: {
          emits: ['start', 'stop'],
          template:
            '<button data-testid="mic-control" @click="$emit(\'start\')">Transcrição</button>',
        },
        ConferenceControls: {
          props: [
            'microphonePending',
            'cameraPending',
            'selectedVideoDeviceId',
            'selectedAudioDeviceId',
          ],
          emits: [
            'toggle-microphone',
            'toggle-camera',
            'retry',
            'select-video-device',
            'select-audio-device',
            'start-camera-test',
            'stop-camera-test',
            'start-microphone-test',
            'stop-microphone-test',
          ],
          template:
            '<div data-testid="conference-controls" :data-microphone-pending="microphonePending" :data-camera-pending="cameraPending" :data-selected-video-device="selectedVideoDeviceId" :data-selected-audio-device="selectedAudioDeviceId"><button data-testid="call-microphone" @click="$emit(\'toggle-microphone\')">Áudio</button><button data-testid="call-camera" @click="$emit(\'toggle-camera\')">Vídeo</button><button data-testid="select-video-input" @click="$emit(\'select-video-device\', \'usb-camera\')">Trocar câmera</button><button data-testid="select-audio-input" @click="$emit(\'select-audio-device\', \'microphone-2\')">Trocar microfone</button><button data-testid="start-camera-test" @click="$emit(\'start-camera-test\')">Testar câmera</button><button data-testid="stop-camera-test" @click="$emit(\'stop-camera-test\')">Parar câmera</button><button data-testid="start-microphone-test" @click="$emit(\'start-microphone-test\')">Testar microfone</button><button data-testid="stop-microphone-test" @click="$emit(\'stop-microphone-test\')">Parar microfone</button><button data-testid="call-retry" @click="$emit(\'retry\')">Tentar</button></div>',
        },
        ConferenceMediaStage: {
          props: ['raisedParticipantIds'],
          emits: ['resume-audio'],
          template:
            '<div data-testid="conference-media" :data-raised-participants="raisedParticipantIds?.join(\',\')"><button data-testid="resume-call-audio" @click="$emit(\'resume-audio\')">Ativar áudio</button></div>',
        },
      },
    },
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  liveMock = createLiveMock()
  audioMock = createAudioMock()
  videoMock = createVideoMock()
  transcriptionMock = createTranscriptionMock()
  conferenceMock = createConferenceMock()
  sharedMicrophoneSourceMock = createSharedMicrophoneSourceMock()
  conferenceOptions = null
  sessionContextMocks.updateSessionContext.mockReset()
  sessionContextMocks.updateSessionContext.mockResolvedValue({})
  sessionContextMocks.patchSessionSettings.mockReset()
  sessionContextMocks.patchSessionSettings.mockResolvedValue({})
  transcriptionOptions = null
  audioInputOptions = undefined
  compactViewport = false
  routerMocks.push.mockReset()
  switchSharedMicrophoneDeviceMock.mockReset()
  switchSharedMicrophoneDeviceMock.mockResolvedValue(undefined)

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: compactViewport,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('LiveRoomView accessible stage layout', () => {
  it('forwards raised hands to the participant video tiles', () => {
    liveMock.raisedHands.value = [
      { participantId: 'host-1', name: 'Cauê', at: '2026-09-10T20:00:00.000Z' },
    ]

    const wrapper = mountRoom()

    expect(wrapper.get('[data-testid="conference-media"]').attributes('data-raised-participants')).toBe('host-1')
  })

  it('pauses call publication before starting local audible microphone and camera tests', async () => {
    conferenceMock.microphoneEnabled.value = true
    conferenceMock.cameraEnabled.value = true
    const wrapper = mountRoom()

    await wrapper.get('[data-testid="start-microphone-test"]').trigger('click')
    expect(conferenceMock.toggleMicrophone).toHaveBeenCalledWith('default')
    expect(audioMock.startTest).toHaveBeenCalledWith(true)

    await wrapper.get('[data-testid="start-camera-test"]').trigger('click')
    expect(conferenceMock.toggleCamera).toHaveBeenCalledWith('default')
    expect(videoMock.startTest).toHaveBeenCalledTimes(1)
  })

  it('restores call media after each local device test stops', async () => {
    conferenceMock.microphoneEnabled.value = true
    conferenceMock.cameraEnabled.value = true
    conferenceMock.toggleMicrophone.mockImplementation(async () => {
      conferenceMock.microphoneEnabled.value = !conferenceMock.microphoneEnabled.value
    })
    conferenceMock.toggleCamera.mockImplementation(async () => {
      conferenceMock.cameraEnabled.value = !conferenceMock.cameraEnabled.value
    })
    const wrapper = mountRoom()

    await wrapper.get('[data-testid="start-microphone-test"]').trigger('click')
    await wrapper.get('[data-testid="stop-microphone-test"]').trigger('click')
    expect(conferenceMock.microphoneEnabled.value).toBe(true)

    await wrapper.get('[data-testid="start-camera-test"]').trigger('click')
    await wrapper.get('[data-testid="stop-camera-test"]').trigger('click')
    expect(conferenceMock.cameraEnabled.value).toBe(true)
  })

  it('restores call media when a local device test cannot start', async () => {
    conferenceMock.microphoneEnabled.value = true
    conferenceMock.cameraEnabled.value = true
    conferenceMock.toggleMicrophone.mockImplementation(async () => {
      conferenceMock.microphoneEnabled.value = !conferenceMock.microphoneEnabled.value
    })
    conferenceMock.toggleCamera.mockImplementation(async () => {
      conferenceMock.cameraEnabled.value = !conferenceMock.cameraEnabled.value
    })
    audioMock.startTest.mockImplementation(async () => {
      audioMock.testState.value = 'error'
    })
    videoMock.startTest.mockImplementation(async () => {
      videoMock.testState.value = 'error'
    })
    const wrapper = mountRoom()

    await wrapper.get('[data-testid="start-microphone-test"]').trigger('click')
    await wrapper.get('[data-testid="start-camera-test"]').trigger('click')

    expect(conferenceMock.microphoneEnabled.value).toBe(true)
    expect(conferenceMock.cameraEnabled.value).toBe(true)
  })

  it('stops every local preview when the canonical meeting ends', async () => {
    const wrapper = mountRoom()

    liveMock.session.value = {
      ...liveMock.session.value!,
      status: 'ENDED',
      endedAt: '2026-09-14T12:00:00.000Z',
    }
    await wrapper.vm.$nextTick()

    expect(audioMock.stopTest).toHaveBeenCalled()
    expect(videoMock.stopTest).toHaveBeenCalled()
    expect(transcriptionMock.stop).toHaveBeenCalledWith({ flush: false })
  })

  it('switches an active camera to the selected input without reconnecting media', async () => {
    conferenceMock.cameraEnabled.value = true
    const wrapper = mountRoom()

    await wrapper.get('[data-testid="select-video-input"]').trigger('click')

    expect(videoMock.selectDevice).toHaveBeenCalledWith('usb-camera')
    expect(conferenceMock.switchDevice).toHaveBeenCalledWith('videoinput', 'usb-camera')
    expect(conferenceMock.retry).not.toHaveBeenCalled()
  })

  it('forwards pending media operations to prevent repeated permission actions', async () => {
    conferenceMock.microphonePending.value = true
    conferenceMock.cameraPending.value = true
    const wrapper = mountRoom()

    expect(wrapper.get('[data-testid="conference-controls"]').attributes()).toMatchObject({
      'data-microphone-pending': 'true',
      'data-camera-pending': 'true',
    })
  })

  it('keeps call controls available to a guest without transcription permission', async () => {
    liveMock.role.value = 'GUEST'
    liveMock.canManage.value = false
    const wrapper = mountRoom()

    expect(wrapper.find('[data-testid="mic-control"]').exists()).toBe(false)
    await wrapper.get('[data-testid="call-microphone"]').trigger('click')
    await wrapper.get('[data-testid="call-camera"]').trigger('click')
    await wrapper.get('[data-testid="resume-call-audio"]').trigger('click')
    await wrapper.get('[data-testid="call-retry"]').trigger('click')

    expect(audioMock.stopTest).toHaveBeenCalledTimes(1)
    expect(conferenceMock.toggleMicrophone).toHaveBeenCalledWith('default')
    expect(conferenceMock.toggleCamera).toHaveBeenCalledTimes(1)
    expect(conferenceMock.startAudio).toHaveBeenCalledTimes(1)
    expect(conferenceMock.retry).toHaveBeenCalledTimes(1)
  })

  it('disposes the physical microphone source when leaving the view', () => {
    const wrapper = mountRoom()

    wrapper.unmount()

    expect(sharedMicrophoneSourceMock.dispose).toHaveBeenCalledTimes(1)
    expect(audioMock.stopTest).toHaveBeenCalled()
    expect(videoMock.stopTest).toHaveBeenCalled()
  })

  it('routes input selection through the shared microphone transaction', async () => {
    const wrapper = mountRoom()

    expect(wrapper.get('[data-testid="mic-control"]').find('[data-testid="select-audio-input"]').exists()).toBe(false)
    await wrapper.get('[data-testid="select-audio-input"]').trigger('click')

    expect(switchSharedMicrophoneDeviceMock).toHaveBeenCalledWith({
      deviceId: 'microphone-2',
      previousDeviceId: 'default',
      microphoneSource: sharedMicrophoneSourceMock,
      conference: conferenceMock,
      transcription: transcriptionMock,
      stopTest: expect.any(Function),
      selectDevice: audioMock.selectDevice,
    })
    expect(transcriptionOptions).not.toHaveProperty('deviceId')
  })

  it('shares one physical microphone source between call and transcription', () => {
    mountRoom()

    expect(conferenceOptions?.microphoneSource).toBe(sharedMicrophoneSourceMock)
    expect(transcriptionOptions?.microphoneSource).toBe(sharedMicrophoneSourceMock)
    expect(audioInputOptions?.microphoneSource).toBe(sharedMicrophoneSourceMock)
  })

  it('abre a configuração do agente quando o anfitrião entra sem contexto de plateia', async () => {
    const wrapper = mountRoom()

    await wrapper.vm.$nextTick()

    expect(wrapper.get('[aria-label="Configuração da plateia"]')).toBeTruthy()
    expect(wrapper.text()).toContain('Configure a plateia')
    expect(wrapper.get('#ctx-domain')).toBeTruthy()
  })

  it('não inicia o microfone ao pular a configuração aberta na entrada', async () => {
    const wrapper = mountRoom()
    await wrapper.vm.$nextTick()

    await wrapper.get('.context-form .btn-ghost').trigger('click')

    expect(wrapper.find('[aria-label="Configuração da plateia"]').exists()).toBe(false)
    expect(transcriptionMock.start).not.toHaveBeenCalled()
  })

  it('mantém o formulário aberto e a captura pausada quando salvar contexto falha', async () => {
    sessionContextMocks.updateSessionContext.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountRoom()
    await wrapper.vm.$nextTick()
    await wrapper.get('#ctx-domain').setValue('Planejamento do projeto')

    await wrapper.get('.context-form form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[aria-label="Configuração da plateia"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Não foi possível salvar o contexto. Tente novamente.')
    expect(liveMock.session.value?.audienceContext).toBeNull()
    expect(transcriptionMock.start).not.toHaveBeenCalled()
  })

  it('retoma a captura somente quando a configuração foi aberta pelo clique no microfone', async () => {
    const wrapper = mountRoom()
    await wrapper.vm.$nextTick()
    await wrapper.get('.context-form .btn-ghost').trigger('click')

    await wrapper.get('[data-testid="mic-control"]').trigger('click')
    expect(wrapper.find('[aria-label="Configuração da plateia"]').exists()).toBe(true)

    await wrapper.get('.context-form .btn-ghost').trigger('click')
    expect(transcriptionMock.start).toHaveBeenCalledWith('default')
  })

  it('não abre a configuração para participante ou reunião encerrada', async () => {
    liveMock.canManage.value = false
    liveMock.role.value = 'GUEST'
    const participant = mountRoom()
    await participant.vm.$nextTick()
    expect(participant.find('[aria-label="Configuração da plateia"]').exists()).toBe(false)
    participant.unmount()

    liveMock = createLiveMock()
    liveMock.session.value = {
      ...liveMock.session.value!,
      status: 'ENDED',
      endedAt: '2026-07-31T13:00:00.000Z',
    }
    const ended = mountRoom()
    await ended.vm.$nextTick()
    expect(ended.find('[aria-label="Configuração da plateia"]').exists()).toBe(false)
  })

  it('encaminha somente segmentos PCM ao backend, sem callbacks textuais no cliente', async () => {
    mountRoom()
    expect(transcriptionOptions).not.toHaveProperty('onPartial')
    expect(transcriptionOptions).not.toHaveProperty('onFinal')
    const segment = {
      pcm16: new ArrayBuffer(32_000),
      sampleRate: 16_000 as const,
      durationMs: 1_000,
    }

    await transcriptionOptions?.onAudioSegment?.(segment)

    expect(liveMock.publishAudioSegment).toHaveBeenCalledWith(segment)
  })

  it('prioriza a legenda e mantém a superfície secundária fechada por padrão', () => {
    const wrapper = mountRoom()

    expect(wrapper.get('a.skip-link').attributes('href')).toBe('#captions-main')
    expect(wrapper.get('#captions-main').attributes('aria-label')).toContain('Legenda')
    const controls = wrapper.get('nav[aria-label="Controles da reunião"]')
    expect(controls).toBeTruthy()
    expect(wrapper.find('[data-testid="meeting-panel"]').exists()).toBe(false)

    const chatTrigger = wrapper.get('button[aria-controls="meeting-panel"]')
    expect(chatTrigger.attributes('aria-expanded')).toBe('false')
    expect(chatTrigger.text()).toContain('Chat')
    expect(controls.get('[data-testid="mic-control"]')).toBeTruthy()
    expect(wrapper.get('#captions-main').find('[data-testid="mic-control"]').exists()).toBe(false)
  })

  it('abre o painel com foco interno e fecha por Escape devolvendo foco ao gatilho', async () => {
    const wrapper = mountRoom()
    const chatTrigger = wrapper
      .findAll('button[aria-controls="meeting-panel"]')
      .find((button) => button.text().includes('Chat'))!

    await chatTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    const panel = wrapper.get('[data-testid="meeting-panel"]')
    const closeButton = panel.get('button[aria-label="Fechar painel"]')
    expect(panel.attributes('role')).toBe('complementary')
    expect(wrapper.get('main.room').classes()).toContain('room--panel-open')
    expect(chatTrigger.attributes('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(closeButton.element)

    await panel.trigger('keydown', { key: 'Escape' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="meeting-panel"]').exists()).toBe(false)
    expect(wrapper.get('main.room').classes()).not.toContain('room--panel-open')
    expect(document.activeElement).toBe(chatTrigger.element)
  })

  it('mantém chamada e ações do participante sem expor transcrição ou administração', () => {
    liveMock.role.value = 'GUEST'
    liveMock.canManage.value = false
    liveMock.currentParticipantId.value = 'guest-1'
    liveMock.participants.value.push({
      participantId: 'guest-1',
      name: 'Lia',
      role: 'GUEST',
    })

    const wrapper = mountRoom()
    const controls = wrapper.get('nav[aria-label="Controles da reunião"]')

    expect(controls.text()).toContain('Levantar mão')
    expect(wrapper.find('[data-testid="conference-controls"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mic-control"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Encerrar reunião')
    expect(wrapper.text()).not.toContain('Convidar')
  })

  it('transforma o painel em sheet modal e torna o conteúdo externo inerte no mobile', async () => {
    compactViewport = true
    const wrapper = mountRoom()
    const chatTrigger = wrapper
      .findAll('button[aria-controls="meeting-panel"]')
      .find((button) => button.text().includes('Chat'))!

    await chatTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    const panel = wrapper.get('[data-testid="meeting-panel"]')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('true')
    expect(wrapper.get('.topbar').attributes('inert')).toBeDefined()
    expect(wrapper.get('#captions-main').attributes('inert')).toBeDefined()
    expect(wrapper.get('nav[aria-label="Controles da reunião"]').attributes('inert')).toBeDefined()
  })

  it('preserva o palco e explicita reconexão quando a sessão perde o socket', () => {
    liveMock.status.value = 'offline'
    const wrapper = mountRoom()

    expect(wrapper.get('[data-testid="caption-stage"]').attributes('data-caption-state')).toBe(
      'reconnecting',
    )
    expect(wrapper.get('[data-testid="meeting-status"]').text()).toContain('Reconectando')
    expect(wrapper.get('#captions-main')).toBeTruthy()
    expect(wrapper.find('[data-testid="conference-controls"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="conference-media"]').exists()).toBe(true)
  })

  it('contém o foco dentro do sheet mobile enquanto ele está aberto', async () => {
    compactViewport = true
    const wrapper = mountRoom()
    const chatTrigger = wrapper
      .findAll('button[aria-controls="meeting-panel"]')
      .find((button) => button.text().includes('Chat'))!
    await chatTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    const panel = wrapper.get('[data-testid="meeting-panel"]')
    const closeButton = panel.get('button[aria-label="Fechar painel"]')
    const lastButton = panel.get('[data-testid="panel-action"]')

    ;(lastButton.element as HTMLButtonElement).focus()
    await panel.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton.element)

    ;(closeButton.element as HTMLButtonElement).focus()
    await panel.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastButton.element)
  })

  it('lista de participantes tem role list e aria-live polite', async () => {
    const wrapper = mountRoom()

    const peopleTrigger = wrapper
      .findAll('button[aria-controls="meeting-panel"]')
      .find((b) => b.text().includes('Pessoas'))!
    await peopleTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    const list = wrapper.find('[role="list"][aria-live="polite"]')
    expect(list.exists()).toBe(true)
    expect(list.attributes('aria-label')).toContain('Participantes')
  })

  it('botão Remover abre dialog de confirmação e não remove direto', async () => {
    liveMock.participants.value = [
      { participantId: 'host-1', name: 'Cauê', role: 'HOST' },
      { participantId: 'part-2', name: 'Lia', role: 'PARTICIPANT' },
    ]
    const wrapper = mountRoom()

    const peopleTrigger = wrapper
      .findAll('button[aria-controls="meeting-panel"]')
      .find((b) => b.text().includes('Pessoas'))!
    await peopleTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    const removeBtn = wrapper.get('button[aria-label="Remover Lia da sala"]')
    await removeBtn.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="dialog"][aria-modal="true"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Remover participante?')
    expect(wrapper.text()).toContain('Lia')
    expect(liveMock.removeParticipant).not.toHaveBeenCalled()
  })

  it('cancelar no dialog fecha sem remover', async () => {
    liveMock.participants.value = [
      { participantId: 'host-1', name: 'Cauê', role: 'HOST' },
      { participantId: 'part-2', name: 'Lia', role: 'PARTICIPANT' },
    ]
    const wrapper = mountRoom()

    const peopleTrigger = wrapper
      .findAll('button[aria-controls="meeting-panel"]')
      .find((b) => b.text().includes('Pessoas'))!
    await peopleTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.get('button[aria-label="Remover Lia da sala"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    await wrapper.get('[role="dialog"] button.ghost').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(liveMock.removeParticipant).not.toHaveBeenCalled()
  })

  it('confirmar no dialog chama removeParticipant e fecha', async () => {
    liveMock.participants.value = [
      { participantId: 'host-1', name: 'Cauê', role: 'HOST' },
      { participantId: 'part-2', name: 'Lia', role: 'PARTICIPANT' },
    ]
    const wrapper = mountRoom()

    const peopleTrigger = wrapper
      .findAll('button[aria-controls="meeting-panel"]')
      .find((b) => b.text().includes('Pessoas'))!
    await peopleTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.get('button[aria-label="Remover Lia da sala"]').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.get('[role="dialog"] button.danger').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(liveMock.removeParticipant).toHaveBeenCalledWith('part-2')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('exibe banner de sala de espera quando há fila e painel não está em Pessoas', async () => {
    liveMock.admissionQueue.value = [
      { admissionId: 'adm-1', displayName: 'Rui', isGuest: false, requestedAt: '2026-07-31T12:00:00.000Z' },
    ]
    const wrapper = mountRoom()

    expect(wrapper.find('[role="alert"][aria-live="assertive"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('1 pessoa aguardando aprovação')
  })

  it('oculta banner de sala de espera quando painel está em Pessoas', async () => {
    liveMock.admissionQueue.value = [
      { admissionId: 'adm-1', displayName: 'Rui', isGuest: false, requestedAt: '2026-07-31T12:00:00.000Z' },
    ]
    const wrapper = mountRoom()

    const peopleTrigger = wrapper
      .findAll('button[aria-controls="meeting-panel"]')
      .find((b) => b.text().includes('Pessoas'))!
    await peopleTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="alert"][aria-live="assertive"]').exists()).toBe(false)
  })

  it('banner Ver abre painel de Pessoas', async () => {
    liveMock.admissionQueue.value = [
      { admissionId: 'adm-1', displayName: 'Rui', isGuest: false, requestedAt: '2026-07-31T12:00:00.000Z' },
    ]
    const wrapper = mountRoom()

    await wrapper.get('.admission-banner__btn').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="meeting-panel"]').exists()).toBe(true)
  })

  it('mantém leitura e remove controles de mutação após o encerramento', () => {
    liveMock.session.value = { ...liveMock.session.value!, status: 'ENDED', endedAt: '2026-07-31T13:00:00.000Z' }
    const wrapper = mountRoom()

    expect(wrapper.get('[data-testid="caption-stage"]').attributes('data-caption-state')).toBe('ended')
    expect(wrapper.find('[data-testid="mic-control"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="conference-controls"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Reunião encerrada')
    expect(wrapper.text()).not.toContain('Convidar')
    expect(wrapper.text()).not.toContain('Levantar mão')
    expect(wrapper.get('nav[aria-label="Controles da reunião"]').text()).toContain('Chat')
  })
})
