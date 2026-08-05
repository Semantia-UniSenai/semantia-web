const PROCESSOR_NAME = 'semantia-pcm-capture'
const BUFFER_FRAMES = 4_096

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(BUFFER_FRAMES)
    this.offset = 0
    this.disposed = false
    this.port.onmessage = (event) => {
      if (event.data?.action === 'dispose') this.disposed = true
    }
  }

  flush() {
    if (this.offset === 0) return
    const samples = this.buffer.slice(0, this.offset)
    let peak = 0
    for (let index = 0; index < samples.length; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index] ?? 0))
    }
    this.port.postMessage(
      { action: 'audio-chunk', samples, sampleRate, peak },
      [samples.buffer],
    )
    this.offset = 0
  }

  process(inputs) {
    if (this.disposed) return false
    const input = inputs[0]?.[0]
    if (!input) return true

    let inputOffset = 0
    while (inputOffset < input.length) {
      const writable = Math.min(
        this.buffer.length - this.offset,
        input.length - inputOffset,
      )
      this.buffer.set(input.subarray(inputOffset, inputOffset + writable), this.offset)
      this.offset += writable
      inputOffset += writable
      if (this.offset === this.buffer.length) this.flush()
    }
    return true
  }
}

registerProcessor(PROCESSOR_NAME, PcmCaptureProcessor)
