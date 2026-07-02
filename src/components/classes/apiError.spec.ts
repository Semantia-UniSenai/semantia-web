import { describe, expect, it } from 'vitest'
import { apiErrorStatus, extractApiError } from './apiError'

describe('extractApiError', () => {
  it('devolve a message string do payload da API', () => {
    const e = { response: { data: { message: 'Turma não encontrada' } } }
    expect(extractApiError(e, 'fallback')).toBe('Turma não encontrada')
  })

  it('devolve a primeira mensagem quando message é array (class-validator)', () => {
    const e = { response: { data: { message: ['campo inválido', 'outro erro'] } } }
    expect(extractApiError(e, 'fallback')).toBe('campo inválido')
  })

  it('array vazio cai no fallback', () => {
    const e = { response: { data: { message: [] } } }
    expect(extractApiError(e, 'fallback')).toBe('fallback')
  })

  it('message vazia/ausente ou erro sem response caem no fallback', () => {
    expect(extractApiError({ response: { data: { message: '' } } }, 'fb')).toBe('fb')
    expect(extractApiError({ response: {} }, 'fb')).toBe('fb')
    expect(extractApiError(new Error('rede'), 'fb')).toBe('fb')
    expect(extractApiError(null, 'fb')).toBe('fb')
    expect(extractApiError(undefined, 'fb')).toBe('fb')
  })
})

describe('apiErrorStatus', () => {
  it('devolve o status HTTP quando presente', () => {
    expect(apiErrorStatus({ response: { status: 404 } })).toBe(404)
    expect(apiErrorStatus({ response: { status: 403 } })).toBe(403)
  })

  it('devolve undefined sem response/status', () => {
    expect(apiErrorStatus({ response: {} })).toBeUndefined()
    expect(apiErrorStatus(new Error('rede'))).toBeUndefined()
    expect(apiErrorStatus(null)).toBeUndefined()
  })
})
