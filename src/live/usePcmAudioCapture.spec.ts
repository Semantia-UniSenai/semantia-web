import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePcmAudioCapture } from './usePcmAudioCapture'

const stopTrack = vi.fn()
const getUserMedia = vi.fn()
const source = { connect: vi.fn(), disconnect: vi.fn() }
const processor = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  onaudioprocess: null as ((event: { inputBuffer: AudioBuffer }) => void) | null,
}
const silentGain = {
  gain: { value: 1 },
  connect: vi.fn(),
  disconnect: vi.fn(),
}
const contextClose = vi.fn().mockResolvedValue(undefined)
const contextResume = vi.fn().mockResolvedValue(undefined)
const audioWorkletAddModule = vi.fn().mockResolvedValue(undefined)
let workletMessageHandler: ((event: MessageEvent) => void) | null = null
let latestWorkletNode: FakeAudioWorkletNode | null = null

class FakeAudioWorkletNode {
  port = {
    postMessage: vi.fn(),
    close: vi.fn(),
    set onmessage(listener: ((event: MessageEvent) => void) | null) {
      workletMessageHandler = listener
    },
    get onmessage() {
      return workletMessageHandler
    },
  }
  connect = vi.fn()
  disconnect = vi.fn()
  onprocessorerror: ((event: Event) => void) | null = null

  constructor() {
    latestWorkletNode = this
  }
}

class FakeAudioContext {
  sampleRate = 48_000
  state: AudioContextState = 'running'
  destination = {}
  audioWorklet = { addModule: audioWorkletAddModule }
  createMediaStreamSource = vi.fn(() => source)
  createScriptProcessor = vi.fn(() => processor)
  createGain = vi.fn(() => silentGain)
  close = contextClose
  resume = contextResume
}

beforeEach(() => {
  vi.clearAllMocks()
  workletMessageHandler = null
  latestWorkletNode = null
  processor.onaudioprocess = null
  silentGain.gain.value = 1
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('usePcmAudioCapture', () => {
  it('captures the selected microphone as PCM frames without recognition', async () => {
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
    const onAudioChunk = vi.fn()
    const capture = usePcmAudioCapture({ onAudioChunk })

    await expect(capture.start('usb-headset')).resolves.toBe(true)

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({ deviceId: { exact: 'usb-headset' } }),
    })
    expect(audioWorkletAddModule).toHaveBeenCalledTimes(1)
    expect(capture.listening.value).toBe(true)
    expect(capture.inputState.value).toBe('waiting')

    const samples = new Float32Array([0.1, -0.4, 0.2])
    workletMessageHandler?.({
      data: { action: 'audio-chunk', samples, sampleRate: 48_000, peak: 0.4 },
    } as MessageEvent)

    expect(onAudioChunk).toHaveBeenCalledWith(samples, 48_000)
    expect(capture.audioLevel.value).toBe(0.4)
    expect(capture.inputState.value).toBe('receiving')

    capture.stop()
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(source.disconnect).toHaveBeenCalled()
    expect(latestWorkletNode?.disconnect).toHaveBeenCalled()
    expect(contextClose).toHaveBeenCalled()
    expect(capture.listening.value).toBe(false)
  })

  it('falls back to ScriptProcessor when AudioWorklet is unavailable', async () => {
    const onAudioChunk = vi.fn()
    const capture = usePcmAudioCapture({ onAudioChunk })

    await capture.start()
    const samples = new Float32Array([0.25, -0.5])
    processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => samples } as unknown as AudioBuffer,
    })

    expect(onAudioChunk).toHaveBeenCalledTimes(1)
    expect(onAudioChunk.mock.calls[0]?.[0]).toEqual(samples)
    expect(onAudioChunk.mock.calls[0]?.[0]).not.toBe(samples)
    expect(capture.audioLevel.value).toBe(0.5)
    capture.stop()
  })

  it('reports capture failure and releases acquired resources', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    const capture = usePcmAudioCapture({ onAudioChunk: vi.fn() })

    await expect(capture.start()).resolves.toBe(false)

    expect(capture.error.value).toBe('not-allowed')
    expect(capture.listening.value).toBe(false)
    expect(contextClose).toHaveBeenCalled()
  })
})
