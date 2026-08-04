import { describe, expect, it } from 'vitest'
import { prepareWhisperAudio } from './audioPreprocessing'

describe('prepareWhisperAudio', () => {
  it('downsamples 48 kHz to 16 kHz without changing a constant signal', () => {
    const input = new Float32Array(48_000).fill(0.25)
    const output = prepareWhisperAudio(input, 48_000, {
      trimThreshold: 0,
      marginMs: 0,
    })

    expect(output).toHaveLength(16_000)
    expect(output[0]).toBeCloseTo(0.25, 5)
    expect(output.at(-1)).toBeCloseTo(0.25, 5)
  })

  it('trims edge silence but keeps 200 ms of context around speech', () => {
    const input = new Float32Array(32_000)
    input.fill(0.2, 16_000, 24_000)

    const output = prepareWhisperAudio(input, 16_000, {
      trimThreshold: 0.01,
      marginMs: 200,
    })

    expect(output.length).toBeGreaterThanOrEqual(14_400)
    expect(output.length).toBeLessThanOrEqual(14_720)
    expect(Math.max(...output)).toBeCloseTo(0.2, 5)
  })

  it('returns an empty segment for background below the speech threshold', () => {
    const input = new Float32Array(16_000).fill(0.002)
    const output = prepareWhisperAudio(input, 16_000, {
      trimThreshold: 0.01,
    })
    expect(output).toHaveLength(0)
  })
})
