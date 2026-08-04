export interface PrepareWhisperAudioOptions {
  targetSampleRate?: number
  trimThreshold?: number
  marginMs?: number
  analysisWindowMs?: number
}

const DEFAULT_TARGET_RATE = 16_000
const DEFAULT_TRIM_THRESHOLD = 0.006
const DEFAULT_MARGIN_MS = 200
const DEFAULT_WINDOW_MS = 20

function trimByEnergy(
  input: Float32Array,
  sampleRate: number,
  threshold: number,
  marginMs: number,
  windowMs: number,
) {
  if (input.length === 0 || threshold <= 0) return input
  const windowFrames = Math.max(1, Math.round((sampleRate * windowMs) / 1_000))
  let firstActive = -1
  let lastActive = -1

  for (let start = 0; start < input.length; start += windowFrames) {
    const end = Math.min(input.length, start + windowFrames)
    let energy = 0
    for (let index = start; index < end; index += 1) {
      energy += input[index] * input[index]
    }
    const rms = Math.sqrt(energy / Math.max(1, end - start))
    if (rms >= threshold) {
      if (firstActive < 0) firstActive = start
      lastActive = end
    }
  }

  if (firstActive < 0) return new Float32Array()
  const marginFrames = Math.round((sampleRate * marginMs) / 1_000)
  return input.slice(
    Math.max(0, firstActive - marginFrames),
    Math.min(input.length, lastActive + marginFrames),
  )
}

function resample(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
) {
  if (input.length === 0 || sourceSampleRate === targetSampleRate) return input.slice()
  const outputLength = Math.max(
    1,
    Math.floor((input.length * targetSampleRate) / sourceSampleRate),
  )
  const output = new Float32Array(outputLength)
  const ratio = sourceSampleRate / targetSampleRate

  if (ratio > 1) {
    for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
      const start = Math.floor(outputIndex * ratio)
      const end = Math.max(start + 1, Math.floor((outputIndex + 1) * ratio))
      let sum = 0
      let count = 0
      for (let inputIndex = start; inputIndex < end && inputIndex < input.length; inputIndex += 1) {
        sum += input[inputIndex]
        count += 1
      }
      output[outputIndex] = count > 0 ? sum / count : 0
    }
    return output
  }

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const position = outputIndex * ratio
    const left = Math.floor(position)
    const right = Math.min(input.length - 1, left + 1)
    const fraction = position - left
    output[outputIndex] = input[left] * (1 - fraction) + input[right] * fraction
  }
  return output
}

export function prepareWhisperAudio(
  input: Float32Array,
  sourceSampleRate: number,
  options: PrepareWhisperAudioOptions = {},
) {
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
    return new Float32Array()
  }
  const trimmed = trimByEnergy(
    input,
    sourceSampleRate,
    options.trimThreshold ?? DEFAULT_TRIM_THRESHOLD,
    options.marginMs ?? DEFAULT_MARGIN_MS,
    options.analysisWindowMs ?? DEFAULT_WINDOW_MS,
  )
  return resample(
    trimmed,
    sourceSampleRate,
    options.targetSampleRate ?? DEFAULT_TARGET_RATE,
  )
}
