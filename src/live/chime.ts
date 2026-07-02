/**
 * Aviso sonoro de "mão levantada" — dois toques suaves via WebAudio.
 * Gerado por osciladores (sem asset de áudio, sem request extra).
 */

interface AudioWindow {
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (ctx) return ctx
  const w = globalThis as AudioWindow
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

function tone(at: number, freq: number, duration: number) {
  const audio = getContext()
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  // Envelope curto (attack rápido, release suave) para soar como sino, não beep.
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(0.18, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(at)
  osc.stop(at + duration)
}

export function playHandChime(): void {
  const audio = getContext()
  if (!audio) return
  // Contexts nascem suspensos até o 1º gesto do usuário; retomar é idempotente.
  void audio.resume()
  const now = audio.currentTime
  tone(now, 830, 0.35)
  tone(now + 0.18, 1108, 0.5)
}
