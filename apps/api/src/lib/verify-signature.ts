import { createHmac, timingSafeEqual } from 'crypto'

const TOLERANCE_SECONDS = 300 // 5 minutos — mismo default que la librería de Stripe

/**
 * Verifica la firma HMAC de un webhook de Stripe.
 * Reimplementa exactamente lo que hace stripe.webhooks.constructEvent()
 * sin necesitar la dependencia de stripe.
 *
 * @param rawBody  - body crudo como string (no parseado)
 * @param signature - header Stripe-Signature completo
 * @param secret   - whsec_... del endpoint del usuario
 */
export function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string
): { valid: boolean; event: unknown | null; error?: string } {
  try {
    // Parsear header: "t=1714000000,v1=abc123..."
    const parts: Record<string, string> = {}
    for (const pair of signature.split(',')) {
      const [key, value] = pair.split('=')
      if (key && value) parts[key] = value
    }

    const timestamp = parts['t']
    const v1 = parts['v1']

    if (!timestamp || !v1) {
      return { valid: false, event: null, error: 'Missing timestamp or signature' }
    }

    // Verificar que el webhook no sea muy antiguo (replay attack)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - parseInt(timestamp)) > TOLERANCE_SECONDS) {
      return { valid: false, event: null, error: 'Timestamp too old' }
    }

    // Reconstruir el HMAC: SHA256("timestamp.rawBody", secret)
    const signedPayload = `${timestamp}.${rawBody}`
    const expectedHmac = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex')

    // Comparación segura contra timing attacks
    const isValid = timingSafeEqual(
      Buffer.from(expectedHmac, 'hex'),
      Buffer.from(v1, 'hex')
    )

    if (!isValid) {
      return { valid: false, event: null, error: 'Signature mismatch' }
    }

    return { valid: true, event: JSON.parse(rawBody) }
  } catch (err) {
    return {
      valid: false,
      event: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
