class SemantiaVoskProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.recognizerId = null
    this.recognizerPort = null
    this.transport = 'direct'
    this.mirrorAudio = false
    this.chunkSize = 2048
    this.chunk = new Float32Array(this.chunkSize)
    this.chunkOffset = 0
    this.levelFrames = 0
    this.levelPeak = 0
    this.disposed = false
    this.port.onmessage = (event) => this.handleMessage(event)
  }

  handleMessage(event) {
    if (event.data?.action === 'init') {
      this.recognizerId = event.data.recognizerId
      this.recognizerPort = event.ports[0]
      this.mirrorAudio = event.data.mirrorAudio === true
      return
    }
    if (event.data?.action === 'set-transport' && event.data.transport === 'main-thread') {
      this.flushChunk()
      this.recognizerPort?.close()
      this.recognizerPort = null
      this.transport = 'main-thread'
      this.port.postMessage({
        action: 'transport-ready',
        transport: 'main-thread',
      })
      return
    }
    if (event.data?.action === 'dispose') {
      this.flushChunk()
      this.recognizerPort?.close()
      this.recognizerPort = null
      this.disposed = true
    }
  }

  flushChunk() {
    if (this.chunkOffset === 0) return
    const audioChunk =
      this.chunkOffset === this.chunk.length
        ? this.chunk
        : this.chunk.slice(0, this.chunkOffset)

    if (this.transport === 'direct' && this.recognizerPort && this.recognizerId) {
      if (this.mirrorAudio) {
        const mirrorChunk = audioChunk.slice()
        this.port.postMessage(
          {
            action: 'audio-mirror',
            samples: mirrorChunk,
            sampleRate,
          },
          [mirrorChunk.buffer],
        )
      }
      const scaledChunk = audioChunk.map((sample) => sample * 0x8000)
      this.recognizerPort.postMessage(
        {
          action: 'audioChunk',
          data: scaledChunk,
          recognizerId: this.recognizerId,
          sampleRate,
        },
        [scaledChunk.buffer],
      )
    } else if (this.transport === 'main-thread') {
      this.port.postMessage(
        {
          action: 'audio-chunk',
          samples: audioChunk,
          sampleRate,
        },
        [audioChunk.buffer],
      )
    }

    this.chunk = new Float32Array(this.chunkSize)
    this.chunkOffset = 0
  }

  process(inputs) {
    if (this.disposed) return false
    const samples = inputs[0]?.[0]
    const directReady = this.recognizerPort && this.recognizerId
    if (!samples || (this.transport === 'direct' && !directReady)) return true

    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]
      this.levelPeak = Math.max(this.levelPeak, Math.abs(sample))
      this.chunk[this.chunkOffset] = sample
      this.chunkOffset += 1
      if (this.chunkOffset === this.chunk.length) this.flushChunk()
    }

    this.levelFrames += samples.length
    if (this.levelFrames >= sampleRate / 4) {
      this.port.postMessage({
        action: 'audio-level',
        peak: this.levelPeak,
        frames: this.levelFrames,
      })
      this.levelFrames = 0
      this.levelPeak = 0
    }
    return true
  }
}

registerProcessor('semantia-vosk-recognizer', SemantiaVoskProcessor)
