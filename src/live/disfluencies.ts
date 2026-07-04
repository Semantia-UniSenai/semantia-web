/**
 * Limpeza barata (regex) de disfluências da fala — remove palavras de vício
 * e repetições antes de a frase final ser publicada para a sala. É a
 * primeira camada da adaptação semântica do Semantia; a camada de LLM
 * (`transcript:adapted`) virá depois dela, no backend.
 *
 * Conservadora de propósito: só cai fora o que é ruído inequívoco como
 * palavra isolada ("né", "aham", "ééé"). Palavras ambíguas ("tipo", "então",
 * "assim") ficam — cortá-las mudaria frases legítimas ("tipo de dado").
 */

/**
 * Vícios de fala como fontes de regex (unidas com `|` em um único padrão).
 * Cada entrada casa entre limites de palavra, sem diferenciar maiúsculas.
 */
export const FILLER_PATTERNS: readonly string[] = [
  // Hesitações vocalizadas: "ééé", "ãh", "hã", "hum", "humm", "ahn", "ehn"…
  'é{2,}',
  'ã+h*',
  'hã+',
  'hum+',
  'aham+',
  'uhum+',
  'ahn+',
  'ehn+',
  // Marcadores de vício que nunca carregam conteúdo sozinhos.
  'né',
  'tá ligado',
  'tipo assim',
]

// `\b` do JS é ASCII e falha ao lado de letras acentuadas ("né", "ééé") —
// os limites de palavra aqui são lookarounds unicode.
const FILLER_REGEX = new RegExp(
  `(?<!\\p{L})(?:${FILLER_PATTERNS.join('|')})(?!\\p{L})`,
  'giu',
)

// Gagueira/repetição imediata da mesma palavra: "o o o professor" → "o professor".
const REPEATED_WORD_REGEX = /(?<!\p{L})(\p{L}+)(?:\s+\1(?!\p{L}))+/giu

// Pontuação órfã deixada pela remoção: " ," → ",", ",," → ",".
const ORPHAN_SPACE_REGEX = /\s+([.,!?;:])/g
const DOUBLED_PUNCT_REGEX = /([.,!?;:])(?:\s*[,;:])+/g

/**
 * Remove vícios e repetições de `text`. Pode devolver string vazia quando a
 * frase inteira era ruído ("né?") — o chamador decide não publicar nesse caso.
 */
export function stripDisfluencies(text: string): string {
  return text
    .replace(FILLER_REGEX, '')
    .replace(REPEATED_WORD_REGEX, '$1')
    .replace(ORPHAN_SPACE_REGEX, '$1')
    .replace(DOUBLED_PUNCT_REGEX, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
