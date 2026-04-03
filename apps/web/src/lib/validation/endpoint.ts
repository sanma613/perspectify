import { z } from 'zod'

export const endpointSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
  destination: z.string().url('Enter a valid destination URL.'),
  secret: z
    .string()
    .trim()
    .startsWith('whsec_', 'Secret must start with whsec_.')
    .refine((value) => value.slice('whsec_'.length).length >= 13, {
      message: 'After whsec_, include at least 13 characters.',
    }),
})
