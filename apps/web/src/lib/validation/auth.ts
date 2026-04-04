import { z } from 'zod'

const signupPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must include at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character.')

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

export const signUpSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: signupPasswordSchema,
  confirm: z.string().min(1, 'Please confirm your password.'),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(80, 'Name must be 80 characters or less.'),
}).refine((data) => data.password === data.confirm, {
  message: "Passwords don't match",
  path: ['confirm'],
})

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address.'),
})

export const resetPasswordSchema = z
  .object({
    password: signupPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
