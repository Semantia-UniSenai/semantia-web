import { beforeEach, describe, expect, it, vi } from 'vitest'

const processorPortPostMessage = vi.fn()
const processorPortClose = vi.fn()
const recognizerPortPostMessage = vi.fn()
const recognizerPortClose = vi.fn()
let registeredProcessor: (new () => FakeAudioWorkletProcessor) | null = null

class FakeAudioWorkletProcessor {
  port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: processorPortPostMessage,
    close: processorPortClose,
  }
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  registeredProcessor = null
  vi.stubGlobal('sampleRate', 48_000)
  vi.stubGlobal('AudioWorkletProcessor', FakeAudioWorkletProcessor)
  vi.stubGlobal(
    'registerProcessor',
    vi.fn((_name: string, processor: new () => FakeAudioWorkletProcessor) => {
      registeredProcessor = processor
    }),
  )
  // O worklet é JavaScript porque executa no AudioWorkletGlobalScope, não no DOM.
  // @ts-expect-error o módulo registra o processor por efeito colateral
  await import('./voskRecognizerProcessor.js')
})

describe('voskRecognizerProcessor', () => {
  it('acknowledges compatible transport and forwards normalized chunks to the main thread', () => {
    expect(registeredProcessor).not.toBeNull()
    const processor = new (registeredProcessor as unknown as new () => {
      port: FakeAudioWorkletProcessor['port']
      process: (inputs: Float32Array[][]) => boolean
    })()
    const recognizerPort = {
      postMessage: recognizerPortPostMessage,
      close: recognizerPortClose,
    }

    processor.port.onmessage?.({
      data: { action: 'init', recognizerId: 'recognizer-1' },
      ports: [recognizerPort],
    } as unknown as MessageEvent)
    processor.port.onmessage?.({
      data: { action: 'set-transport', transport: 'main-thread' },
      ports: [],
    } as unknown as MessageEvent)

    expect(processorPortPostMessage).toHaveBeenCalledWith({
      action: 'transport-ready',
      transport: 'main-thread',
    })

    const frame = new Float32Array(128).fill(0.25)
    for (let index = 0; index < 16; index += 1) processor.process([[frame]])

    const audioCall = processorPortPostMessage.mock.calls.find(
      ([message]) => message.action === 'audio-chunk',
    )
    expect(audioCall).toBeDefined()
    expect(audioCall?.[0].samples).toBeInstanceOf(Float32Array)
    expect(audioCall?.[0].samples[0]).toBe(0.25)
    expect(audioCall?.[0].sampleRate).toBe(48_000)
    expect(recognizerPortClose).toHaveBeenCalledTimes(1)
  })
})
