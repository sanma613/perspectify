import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const ENCRYPTED_PAYLOAD_VERSION = 'v1'

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY

  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY is required')
  }

  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }

  return Buffer.from(keyHex, 'hex')
}

export function encrypt(text: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${ENCRYPTED_PAYLOAD_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(data: string): string {
  const parts = data.split(':')
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted payload format')
  }

  const [version, ivHex, authTagHex, encryptedHex] = parts

  if (version !== ENCRYPTED_PAYLOAD_VERSION) {
    throw new Error('Unsupported encrypted payload version')
  }

  if (
    ivHex.length !== IV_LENGTH * 2
    || authTagHex.length !== AUTH_TAG_LENGTH * 2
    || encryptedHex.length === 0
  ) {
    throw new Error('Invalid encrypted payload format')
  }

  const key = getEncryptionKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    throw new Error('Failed to decrypt data')
  }
}
