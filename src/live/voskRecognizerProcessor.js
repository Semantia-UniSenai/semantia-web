class SemantiaVoskProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.recognizerId = null
    this.recognizerPort = null
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
    if (!this.recognizerPort || !this.recognizerId || this.chunkOffset === 0) return
    const audioChunk =
      this.chunkOffset === this.chunk.length
        ? this.chunk
        : this.chunk.slice(0, this.chunkOffset)
    this.recognizerPort.postMessage(
      {
        action: 'audioChunk',
        data: audioChunk,
        recognizerId: this.recognizerId,
        sampleRate,
      },
      [audioChunk.buffer],
    )
    this.chunk = new Float32Array(this.chunkSize)
    this.chunkOffset = 0
  }

  process(inputs) {
    if (this.disposed) return false
    const samples = inputs[0]?.[0]
    if (!samples || !this.recognizerPort || !this.recognizerId) return true

    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]
      this.levelPeak = Math.max(this.levelPeak, Math.abs(sample))
      this.chunk[this.chunkOffset] = sample * 0x8000
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
