/// <reference types="node" />
import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo Node em JavaScript testado pelo Vitest
import { ensureModel } from '../../scripts/ensure-vosk-model.mjs'

const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex')

describe('ensureModel', () => {
  it('downloads atomically and reuses a model with valid size and checksum', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'semantia-model-'))
    const targetPath = join(directory, 'model.tar.gz')
    const payload = Buffer.from('modelo-vosk-fixture')
    const fetchImpl = async () => new Response(payload, { status: 200 })

    const downloaded = await ensureModel({
      sourceUrl: `data:application/octet-stream;base64,${payload.toString('base64')}`,
      targetPath,
      expectedBytes: payload.length,
      expectedSha256: sha256(payload),
      fetchImpl,
    })
    const cached = await ensureModel({
      sourceUrl: 'https://unused.invalid/model',
      targetPath,
      expectedBytes: payload.length,
      expectedSha256: sha256(payload),
      fetchImpl: async () => { throw new Error('cache should have been reused') },
    })

    expect(downloaded).toBe('downloaded')
    expect(cached).toBe('cached')
    expect(await readFile(targetPath)).toEqual(payload)
  })

  it('rejects a downloaded model with unexpected integrity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'semantia-model-'))
    const targetPath = join(directory, 'model.tar.gz')
    const payload = Buffer.from('conteudo-adulterado')

    await expect(ensureModel({
      sourceUrl: 'data:application/octet-stream;base64,',
      targetPath,
      expectedBytes: payload.length,
      expectedSha256: sha256(Buffer.from('modelo-correto')),
      fetchImpl: async () => new Response(payload, { status: 200 }),
    })).rejects.toThrow(/integridade/i)
  })
})
