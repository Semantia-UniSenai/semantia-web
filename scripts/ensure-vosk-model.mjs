import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'

export const DEFAULT_MODEL_SOURCE_URL =
  'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-pt-0.3.tar.gz'
export const DEFAULT_MODEL_TARGET = 'public/models/vosk-model-small-pt-0.3.model'
export const DEFAULT_MODEL_BYTES = 32_440_432
export const DEFAULT_MODEL_SHA256 =
  '499771532fc4c5fc9d7657003a4193275c7f3561a6ccda9226f1d427c010887c'

async function inspectFile(path) {
  try {
    const metadata = await stat(path)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    return { bytes: metadata.size, sha256: hash.digest('hex') }
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function hasExpectedIntegrity(value, expectedBytes, expectedSha256) {
  return value?.bytes === expectedBytes && value.sha256 === expectedSha256
}

export async function ensureModel({
  sourceUrl,
  targetPath,
  expectedBytes,
  expectedSha256,
  fetchImpl = fetch,
}) {
  const current = await inspectFile(targetPath)
  if (hasExpectedIntegrity(current, expectedBytes, expectedSha256)) return 'cached'

  await mkdir(dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
  const hash = createHash('sha256')
  let bytes = 0
  let file

  try {
    const response = await fetchImpl(sourceUrl, { redirect: 'follow' })
    if (!response.ok || !response.body) {
      throw new Error(`Falha ao baixar modelo Vosk: HTTP ${response.status}`)
    }

    file = await open(temporaryPath, 'wx')
    for await (const chunk of Readable.fromWeb(response.body)) {
      const buffer = Buffer.from(chunk)
      bytes += buffer.length
      hash.update(buffer)
      await file.write(buffer)
    }
    await file.sync()
    await file.close()
    file = null

    const sha256 = hash.digest('hex')
    if (bytes !== expectedBytes || sha256 !== expectedSha256) {
      throw new Error(
        `Falha de integridade do modelo Vosk: bytes=${bytes}, sha256=${sha256}`,
      )
    }

    await rm(targetPath, { force: true })
    await rename(temporaryPath, targetPath)
    return 'downloaded'
  } finally {
    await file?.close().catch(() => undefined)
    await rm(temporaryPath, { force: true })
  }
}

async function main() {
  const targetPath = resolve(process.env.VOSK_MODEL_TARGET ?? DEFAULT_MODEL_TARGET)
  const result = await ensureModel({
    sourceUrl: process.env.VOSK_MODEL_SOURCE_URL ?? DEFAULT_MODEL_SOURCE_URL,
    targetPath,
    expectedBytes: Number(process.env.VOSK_MODEL_BYTES ?? DEFAULT_MODEL_BYTES),
    expectedSha256: process.env.VOSK_MODEL_SHA256 ?? DEFAULT_MODEL_SHA256,
  })
  console.log(
    result === 'cached'
      ? `Modelo Vosk validado no cache: ${targetPath}`
      : `Modelo Vosk baixado e validado: ${targetPath}`,
  )
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
