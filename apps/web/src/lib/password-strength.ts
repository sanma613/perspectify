export function passwordStrength(value: string): 'weak' | 'medium' | 'strong' {
  if (value.length < 8) return 'weak'
  const hasSpecial = /[^A-Za-z0-9]/.test(value)
  if (value.length >= 12 && hasSpecial) return 'strong'
  return 'medium'
}