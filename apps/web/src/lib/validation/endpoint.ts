import { z } from 'zod'

export const endpointSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
  destination: z.string().url('Enter a valid destination URL.'),
  secret: z
    .string()
    .trim()
    .min(12, 'Secret must be at least 12 characters.')
    .startsWith('whsec_', 'Secret must start with whsec_.'),
})
