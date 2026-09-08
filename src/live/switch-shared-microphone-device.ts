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
  if (restoreConference) await options.conference.toggleMicrophone()
  if (restoreTranscription) await options.transcription.stop({ flush: true })
  await options.selectDevice(options.deviceId)
  await options.microphoneSource.reset(options.deviceId)
  if (restoreTranscription) await options.transcription.start(options.deviceId)
  if (restoreConference) await options.conference.toggleMicrophone(options.deviceId)
}
