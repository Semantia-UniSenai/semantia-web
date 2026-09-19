import type { Ref } from 'vue'
import type { SharedMicrophoneSource } from './media/shared-microphone-source'

interface ConferenceMicrophoneController {
  microphoneEnabled: Readonly<Ref<boolean>>
  toggleMicrophone(deviceId?: string): Promise<void>
}

interface TranscriptionMicrophoneController {
  listening: Readonly<Ref<boolean>>
  loading: Readonly<Ref<boolean>>
  stop(options?: { flush?: boolean }): Promise<void>
  start(deviceId: string): Promise<boolean>
}

export interface SwitchSharedMicrophoneDeviceOptions {
  deviceId: string
  previousDeviceId: string
  microphoneSource: SharedMicrophoneSource
  conference: ConferenceMicrophoneController
  transcription: TranscriptionMicrophoneController
  stopTest(): Promise<void>
  selectDevice(deviceId: string): Promise<void>
}

export async function switchSharedMicrophoneDevice(
  options: SwitchSharedMicrophoneDeviceOptions,
): Promise<void> {
  const restoreConference = options.conference.microphoneEnabled.value
  const restoreTranscription =
    options.transcription.listening.value || options.transcription.loading.value

  await options.stopTest()
  let conferenceStopped = false
  let transcriptionStopped = false
  let deviceChangeStarted = false

  try {
    if (restoreConference) {
      await options.conference.toggleMicrophone()
      conferenceStopped = true
    }
    if (restoreTranscription) {
      await options.transcription.stop({ flush: true })
      transcriptionStopped = true
    }
    deviceChangeStarted = true
    await options.selectDevice(options.deviceId)
    await options.microphoneSource.reset(options.deviceId)
    if (restoreTranscription) {
      const started = await options.transcription.start(options.deviceId)
      if (!started) throw new Error('Could not restart transcription on the selected input')
    }
    if (restoreConference) {
      await options.conference.toggleMicrophone(options.deviceId)
    }
  } catch (cause) {
    try {
      if (deviceChangeStarted) {
        if (options.conference.microphoneEnabled.value) {
          await options.conference.toggleMicrophone()
        }
        if (
          options.transcription.listening.value ||
          options.transcription.loading.value
        ) {
          await options.transcription.stop({ flush: false })
        }
        await options.selectDevice(options.previousDeviceId)
        await options.microphoneSource.reset(options.previousDeviceId)
      }
      if (restoreTranscription && transcriptionStopped) {
        const restored = await options.transcription.start(options.previousDeviceId)
        if (!restored) throw new Error('Could not restore transcription input')
      }
      if (
        restoreConference &&
        conferenceStopped &&
        !options.conference.microphoneEnabled.value
      ) {
        await options.conference.toggleMicrophone(options.previousDeviceId)
      }
    } catch (rollbackCause) {
      throw new AggregateError(
        [cause, rollbackCause],
        'Could not switch or restore the microphone input',
      )
    }
    throw cause
  }
}
