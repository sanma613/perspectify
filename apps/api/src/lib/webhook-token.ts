import { createHash, randomBytes } from 'node:crypto'

const TOKEN_BYTES = 24
const TOKEN_PREFIX_LENGTH = 16

export function hashWebhookToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function getWebhookTokenPrefix(tokenHash: string): string {
  return tokenHash.slice(0, TOKEN_PREFIX_LENGTH)
}

export function createWebhookToken() {
  const token = randomBytes(TOKEN_BYTES).toString('hex')
  const tokenHash = hashWebhookToken(token)
  const tokenPrefix = getWebhookTokenPrefix(tokenHash)

  return { token, tokenHash, tokenPrefix }
}
