import { computed, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AckError,
  ChatMessage,
  LiveSessionDetails,
  Participant,
  ParticipantRole,
  RaisedHand,
  TranscriptEntry,
} from '../live/types'

let liveMock: ReturnType<typeof createLiveMock>
let audioMock: ReturnType<typeof createAudioMock>
let transcriptionMock: ReturnType<typeof createTranscriptionMock>
let transcriptionOptions: {
  onAudioSegment?: (segment: unknown) => Promise<unknown>
} | null
let compactViewport = false

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  route: {
    params: { sessionId: 'meeting-1' },
    query: {},
  },
}))

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
  useAudioInputDevices: () => audioMock,
}))

vi.mock('../live/useMeetingTranscription', () => ({
  useMeetingTranscription: (options: typeof transcriptionOptions) => {
    transcriptionOptions = options
    return transcriptionMock
  },
}))

import LiveRoomView from './LiveRoomView.vue'

function createLiveMock() {
  const session = ref<LiveSessionDetails | null>({
    id: 'meeting-1',
    title: 'Reunião de produto',
    roomId: 'room-1',
    joinToken: 'invite-token',
    status: 'LIVE',
    createdAt: '2026-07-31T12:00:00.000Z',
    startedAt: '2026-07-31T12:00:00.000Z',
    endedAt: null,
    roomName: 'Reunião de produto',
    hostId: 'host-1',
    hostName: 'Cauê',
  })
  const role = ref<ParticipantRole | null>('HOST')
  const ended = computed(() => session.value?.status === 'ENDED')

  return {
    status: ref<'offline' | 'connecting' | 'connected'>('connected'),
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
    partialText: ref(''),
    ended,
    canPublishTranscript: computed(() => role.value === 'HOST' && !ended.value),
    joined: computed(() => true),
    currentParticipantId: ref<string | null>('host-1'),
    connect: vi.fn(),
    disconnect: vi.fn(),
    publishPartial: vi.fn(),
    publishFinal: vi.fn(),
    publishAudioSegment: vi.fn().mockResolvedValue({ ok: true }),
    pendingAudioCount: ref(0),
    transcriptionStatus: ref(null),
    sendChat: vi.fn(),
    raiseHand: vi.fn(),
    lowerHand: vi.fn(),
    lowerParticipantHand: vi.fn(),
    endSession: vi.fn(),
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
    refresh: vi.fn(),
    selectDevice: vi.fn(),
    startTest: vi.fn(),
    stopTest: vi.fn(),
  }
}

function createTranscriptionMock() {
  return {
    supported: true,
    listening: ref(false),
    loading: ref(false),
    error: ref<string | null>(null),
    engine: ref<'browser' | 'local' | null>(null),
    inputState: ref<'idle' | 'waiting' | 'silent' | 'receiving'>('idle'),
    audioLevel: ref(0),
    transport: ref<'direct' | 'switching' | 'compatible' | null>(null),
    hasHypothesis: ref(false),
    qualityStatus: ref<'idle' | 'loading' | 'ready' | 'refining' | 'fallback'>('idle'),
    qualityProgress: ref(0),
    start: vi.fn(),
    stop: vi.fn(),
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
          template: '<div data-testid="mic-control">Microfone</div>',
        },
      },
    },
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  liveMock = createLiveMock()
  audioMock = createAudioMock()
  transcriptionMock = createTranscriptionMock()
  transcriptionOptions = null
  compactViewport = false
  routerMocks.push.mockReset()

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
  it('encaminha segmentos PCM ao backend da sessão', async () => {
    mountRoom()
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

  it('mantém ações do participante na barra sem expor áudio ou administração', () => {
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

  it('mantém leitura e remove controles de mutação após o encerramento', () => {
    liveMock.session.value = { ...liveMock.session.value!, status: 'ENDED', endedAt: '2026-07-31T13:00:00.000Z' }
    const wrapper = mountRoom()

    expect(wrapper.get('[data-testid="caption-stage"]').attributes('data-caption-state')).toBe('ended')
    expect(wrapper.find('[data-testid="mic-control"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Reunião encerrada')
    expect(wrapper.text()).not.toContain('Convidar')
    expect(wrapper.text()).not.toContain('Levantar mão')
    expect(wrapper.get('nav[aria-label="Controles da reunião"]').text()).toContain('Chat')
  })
})
