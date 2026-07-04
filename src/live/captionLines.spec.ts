import { describe, expect, it } from 'vitest'
import { splitIntoLines } from './captionLines'

describe('splitIntoLines', () => {
  it('frase curta vira uma linha única', () => {
    expect(splitIntoLines('bom dia turma')).toEqual(['bom dia turma'])
  })

  it('frase longa quebra balanceada, sem linha órfã de uma palavra', () => {
    // 9 palavras com máximo 7: 5+4, nunca 7+2.
    expect(
      splitIntoLines('um dois três quatro cinco seis sete oito nove'),
    ).toEqual(['um dois três quatro cinco', 'seis sete oito nove'])
  })

  it('respeita limite de sentença antes de contar palavras', () => {
    expect(splitIntoLines('Primeira frase. Segunda frase aqui.')).toEqual([
      'Primeira frase.',
      'Segunda frase aqui.',
    ])
  })

  it('texto vazio ou só espaços vira lista vazia', () => {
    expect(splitIntoLines('')).toEqual([])
    expect(splitIntoLines('   ')).toEqual([])
  })

  it('aceita máximo customizado', () => {
    expect(splitIntoLines('a b c d', 2)).toEqual(['a b', 'c d'])
  })
})
