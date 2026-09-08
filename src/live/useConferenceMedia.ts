import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { LiveKitConferenceClient } from './media/livekit-conference-client'
import type { ConferenceClient } from './media/conference-client'
import {
  ConferenceClientError,
  type ConferenceEvent,
  type ConferenceParticipantRef,
  type ConferenceStatus,
  type ConferenceTrackRef,
} from './media/types'
import type { Ack, AckError, MediaCredentials } from './types'

export interface UseConferenceMediaOptions {
  joined: Ref<boolean>
  ended: Ref<boolean>
  textConnectionStatus: Ref<'offline' | 'connecting' | 'connected'>
  requestMediaCredentials: () => Promise<Ack<MediaCredentials>>
  clientFactory?: () => ConferenceClient
}

export function useConferenceMedia(options: UseConferenceMediaOptions) {
  const mediaStatus = ref<ConferenceStatus>('idle')
  const mediaError = ref<AckError | null>(null)
  const microphoneEnabled = ref(false)
  const cameraEnabled = ref(false)
  const audioPlaybackBlocked = ref(false)
  const participants = ref<ConferenceParticipantRef[]>([])
  const tracks = ref<ConferenceTrackRef[]>([])
  const clientFactory =
    options.clientFactory ?? (() => new LiveKitConferenceClient())
  let client: ConferenceClient | null = null
  let unsubscribeClient: (() => void) | null = null
  let connecting: Promise<void> | null = null
  let disposed = false
  let attemptVersion = 0
  const participantsById = new Map<string, ConferenceParticipantRef>()
  const tracksByKey = new Map<string, ConferenceTrackRef>()

  function handleEvent(event: ConferenceEvent): void {
    if (event.type === 'status') {
      mediaStatus.value = event.status
      return
    }
    if (event.type === 'audio-playback') {
      audioPlaybackBlocked.value = event.blocked
      return
    }
    if (event.type === 'device-error') {
      mediaError.value = { code: event.code, message: event.message }
      return
    }
    if (event.type === 'participant-connected') {
      participantsById.set(event.participant.participantId, event.participant)
      participants.value = [...participantsById.values()]
      return
    }
    if (event.type === 'participant-disconnected') {
      participantsById.delete(event.participantId)
      participants.value = [...participantsById.values()]
      return
    }
    if (event.type === 'track-added' || event.type === 'track-updated') {
      tracksByKey.set(event.track.key, event.track)
    } else if (event.type === 'track-removed') {
      tracksByKey.delete(event.trackKey)
    } else {
      return
    }
    tracks.value = [...tracksByKey.values()]
  }

  async function connect(): Promise<void> {
    if (disposed || !options.joined.value || options.ended.value) return
    if (client) return
    if (connecting) return connecting
    const version = ++attemptVersion
    const attempt = (async () => {
      mediaError.value = null
      let credentials: Ack<MediaCredentials>
      try {
        credentials = await options.requestMediaCredentials()
      } catch {
        if (
          version === attemptVersion &&
          !disposed &&
          !options.ended.value &&
          options.joined.value
        ) {
          mediaStatus.value = 'failed'
          mediaError.value = {
            code: 'MEDIA_UNAVAILABLE',
            message: 'Não foi possível obter acesso à chamada',
          }
        }
        return
      }
      if (
        version !== attemptVersion ||
        disposed ||
        options.ended.value ||
        !options.joined.value
      ) {
        return
      }
      if (!credentials.ok) {
        mediaStatus.value = 'failed'
        mediaError.value = credentials.error
        return
      }
      const nextClient = clientFactory()
      client = nextClient
      const unsubscribe = nextClient.onEvent(handleEvent)
      unsubscribeClient = unsubscribe
      mediaStatus.value = 'connecting'
      const { serverUrl, participantToken } = credentials
      try {
        await nextClient.connect(serverUrl, participantToken)
        if (
          client !== nextClient ||
          version !== attemptVersion ||
          disposed ||
          options.ended.value ||
          !options.joined.value
        ) {
          return
        }
        mediaStatus.value = 'connected'
      } catch (cause) {
        const isCurrent =
          client === nextClient &&
          version === attemptVersion &&
          !disposed &&
          !options.ended.value &&
          options.joined.value
        unsubscribe()
        if (unsubscribeClient === unsubscribe) unsubscribeClient = null
        if (!isCurrent) return
        await nextClient.disconnect().catch(() => undefined)
        if (client === nextClient) client = null
        mediaStatus.value = 'failed'
        mediaError.value =
          cause instanceof ConferenceClientError
            ? { code: cause.code, message: cause.message }
            : {
                code: 'MEDIA_CONNECTION_FAILED',
                message: 'Não foi possível conectar o áudio e vídeo',
              }
      }
    })()
    connecting = attempt
    try {
      await attempt
    } finally {
      if (connecting === attempt) connecting = null
    }
  }

  watch(
    options.joined,
    (joined) => {
      if (joined) void connect()
    },
    { immediate: true },
  )

  watch(
    options.ended,
    (ended) => {
      if (ended) void disconnect()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    disposed = true
    void disconnect()
  })

  async function startAudio(): Promise<void> {
    if (!client) return
    await client.startAudio()
    audioPlaybackBlocked.value = false
  }

  async function switchDevice(
    kind: MediaDeviceKind,
    deviceId: string,
  ): Promise<void> {
    await client?.switchDevice(kind, deviceId)
  }

  async function toggleCamera(deviceId?: string): Promise<void> {
    if (!client) return
    const enabled = !cameraEnabled.value
    await client.setCameraEnabled(enabled, deviceId)
    cameraEnabled.value = enabled
  }

  async function toggleMicrophone(deviceId?: string): Promise<void> {
    if (!client) return
    const enabled = !microphoneEnabled.value
    await client.setMicrophoneEnabled(enabled, deviceId)
    microphoneEnabled.value = enabled
  }

  async function cleanupClient(): Promise<void> {
    const currentClient = client
    client = null
    unsubscribeClient?.()
    unsubscribeClient = null
    participantsById.clear()
    participants.value = []
    tracksByKey.clear()
    tracks.value = []
    await currentClient?.disconnect().catch(() => undefined)
  }

  async function disconnect(): Promise<void> {
    attemptVersion += 1
    connecting = null
    await cleanupClient()
    mediaStatus.value = 'idle'
    mediaError.value = null
    microphoneEnabled.value = false
    cameraEnabled.value = false
    audioPlaybackBlocked.value = false
  }

  async function retry(): Promise<void> {
    await cleanupClient()
    connecting = null
    await connect()
  }

  return {
    textConnectionStatus: options.textConnectionStatus,
    mediaStatus,
    mediaError,
    microphoneEnabled,
    cameraEnabled,
    audioPlaybackBlocked,
    participants,
    tracks,
    connect,
    disconnect,
    retry,
    startAudio,
    switchDevice,
    toggleCamera,
    toggleMicrophone,
  }
}
