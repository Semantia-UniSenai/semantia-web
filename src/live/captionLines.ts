/**
 * Quebra de frases da transcrição em linhas curtas (estilo karaokê).
 *
 * O Web Speech devolve finais "frase a frase", mas uma fala contínua pode
 * fechar num final longo — na tela do aluno cada linha precisa ter poucas
 * palavras para leitura rápida. A quebra é balanceada: um final de 9 palavras
 * com máximo 7 vira 5+4, nunca 7+2 (evita linha órfã de uma palavra).
 */

export const MAX_WORDS_PER_LINE = 7

// Fecha uma sentença em ., !, ?, … ou reticências, preservando a pontuação.
const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+/

function chunkBalanced(words: string[], maxWords: number): string[] {
  if (words.length <= maxWords) return [words.join(' ')]
  const chunks = Math.ceil(words.length / maxWords)
  const perChunk = Math.ceil(words.length / chunks)
  const lines: string[] = []
  for (let i = 0; i < words.length; i += perChunk) {
    lines.push(words.slice(i, i + perChunk).join(' '))
  }
  return lines
}

/** Divide `text` em linhas de no máximo `maxWords` palavras. */
export function splitIntoLines(
  text: string,
  maxWords = MAX_WORDS_PER_LINE,
): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  return trimmed
    .split(SENTENCE_BOUNDARY)
    .flatMap((sentence) => chunkBalanced(sentence.split(/\s+/), maxWords))
}
