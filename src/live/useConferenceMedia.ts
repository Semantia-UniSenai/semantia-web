import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { LiveKitConferenceClient } from './media/livekit-conference-client'
import type { ConferenceClient } from './media/conference-client'
import type {
  MicrophoneLease,
  SharedMicrophoneSource,
} from './media/shared-microphone-source'
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
  microphoneSource?: SharedMicrophoneSource
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
  let microphoneLease: MicrophoneLease | null = null
  let microphoneOperation: Promise<void> | null = null
  let cameraOperation: Promise<void> | null = null
  const participantsById = new Map<string, ConferenceParticipantRef>()
  const tracksByKey = new Map<string, ConferenceTrackRef>()

  function reportControlError(cause: unknown, message: string): void {
    mediaError.value =
      cause instanceof ConferenceClientError
        ? { code: cause.code, message: cause.message }
        : { code: 'MEDIA_CONTROL_FAILED', message }
  }

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
    try {
      await client.startAudio()
      audioPlaybackBlocked.value = false
      mediaError.value = null
    } catch (cause) {
      reportControlError(cause, 'Não foi possível ativar o áudio da chamada')
      throw cause
    }
  }

  async function switchDevice(
    kind: MediaDeviceKind,
    deviceId: string,
  ): Promise<void> {
    try {
      await client?.switchDevice(kind, deviceId)
      mediaError.value = null
    } catch (cause) {
      reportControlError(cause, 'Não foi possível trocar o dispositivo da chamada')
      throw cause
    }
  }

  async function performCameraToggle(deviceId?: string): Promise<void> {
    const activeClient = client
    if (!activeClient) return
    const enabled = !cameraEnabled.value
    try {
      await activeClient.setCameraEnabled(enabled, deviceId)
      if (client !== activeClient) return
      cameraEnabled.value = enabled
      mediaError.value = null
    } catch (cause) {
      reportControlError(cause, 'Não foi possível alterar a câmera da chamada')
      throw cause
    }
  }

  function toggleCamera(deviceId?: string): Promise<void> {
    if (cameraOperation) return cameraOperation
    const operation = performCameraToggle(deviceId).finally(() => {
      if (cameraOperation === operation) cameraOperation = null
    })
    cameraOperation = operation
    return operation
  }

  async function performMicrophoneToggle(deviceId?: string): Promise<void> {
    const activeClient = client
    if (!activeClient) return
    if (microphoneEnabled.value) {
      try {
        await activeClient.unpublishMicrophoneTrack()
        mediaError.value = null
      } catch (cause) {
        reportControlError(cause, 'Não foi possível alterar o microfone da chamada')
        throw cause
      } finally {
        microphoneLease?.release()
        microphoneLease = null
        microphoneEnabled.value = false
      }
      return
    }
    if (!options.microphoneSource) {
      try {
        await activeClient.setMicrophoneEnabled(true, deviceId)
        if (client !== activeClient) return
        microphoneEnabled.value = true
        mediaError.value = null
        return
      } catch (cause) {
        reportControlError(cause, 'Não foi possível alterar o microfone da chamada')
        throw cause
      }
    }
    const lease = await options.microphoneSource.acquire(deviceId ?? 'default')
    if (client !== activeClient) {
      lease.release()
      return
    }
    try {
      await activeClient.publishMicrophoneTrack(lease.track)
    } catch (cause) {
      lease.release()
      reportControlError(cause, 'Não foi possível alterar o microfone da chamada')
      throw cause
    }
    if (client !== activeClient) {
      lease.release()
      return
    }
    microphoneLease = lease
    microphoneEnabled.value = true
    mediaError.value = null
  }

  function toggleMicrophone(deviceId?: string): Promise<void> {
    if (microphoneOperation) return microphoneOperation
    const operation = performMicrophoneToggle(deviceId).finally(() => {
      if (microphoneOperation === operation) microphoneOperation = null
    })
    microphoneOperation = operation
    return operation
  }

  async function cleanupClient(): Promise<void> {
    const currentClient = client
    client = null
    const activeMicrophoneLease = microphoneLease
    microphoneLease = null
    activeMicrophoneLease?.release()
    microphoneEnabled.value = false
    cameraEnabled.value = false
    audioPlaybackBlocked.value = false
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
