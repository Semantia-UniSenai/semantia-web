/// <reference lib="webworker" />

import { env, pipeline } from '@huggingface/transformers'
import { prepareWhisperAudio } from './audioPreprocessing'

const MODEL_ID =
  import.meta.env.VITE_WHISPER_MODEL_ID?.trim() ||
  'onnx-community/whisper-small'
const TARGET_SAMPLE_RATE = 16_000

interface LoadMessage {
  type: 'load'
}
interface TranscribeMessage {
  type: 'transcribe'
  requestId: string
  samples: Float32Array
  sampleRate: number
}
type IncomingMessage = LoadMessage | TranscribeMessage

interface WhisperResult {
  text?: string
}

env.allowLocalModels = false
env.allowRemoteModels = true
env.useBrowserCache = true

let transcriberPromise: Promise<any> | null = null
let readyPosted = false
let serial = Promise.resolve()

function post(message: unknown) {
  self.postMessage(message)
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : 'whisper-failed'
}

function ensureTranscriber() {
  if (!transcriberPromise) {
    let maxProgress = 0
    transcriberPromise = pipeline('automatic-speech-recognition', MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (update) => {
        const progress = 'progress' in update ? update.progress : undefined
        if (!Number.isFinite(progress)) return
        maxProgress = Math.max(maxProgress, progress ?? 0)
        post({ type: 'progress', progress: maxProgress })
      },
    }).then((transcriber) => {
      if (!readyPosted) {
        readyPosted = true
        post({ type: 'ready' })
      }
      return transcriber
    })
  }
  return transcriberPromise
}

async function transcribe(message: TranscribeMessage) {
  const startedAt = performance.now()
  try {
    const audio = prepareWhisperAudio(message.samples, message.sampleRate, {
      targetSampleRate: TARGET_SAMPLE_RATE,
    })
    if (audio.length < TARGET_SAMPLE_RATE / 4) {
      post({
        type: 'complete',
        requestId: message.requestId,
        text: '',
        inferenceMs: performance.now() - startedAt,
      })
      return
    }
    const transcriber = await ensureTranscriber()
    const result = (await transcriber(audio, {
      language: 'portuguese',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    })) as WhisperResult | WhisperResult[]
    const text = Array.isArray(result)
      ? result.map((item) => item.text ?? '').join(' ')
      : result.text ?? ''
    post({
      type: 'complete',
      requestId: message.requestId,
      text: text.trim(),
      inferenceMs: performance.now() - startedAt,
    })
  } catch (cause) {
    post({
      type: 'error',
      requestId: message.requestId,
      error: errorMessage(cause),
    })
  }
}

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data
  if (message.type === 'load') {
    void ensureTranscriber().catch((cause) => {
      transcriberPromise = null
      readyPosted = false
      post({ type: 'error', error: errorMessage(cause) })
    })
    return
  }
  serial = serial.then(() => transcribe(message))
}
