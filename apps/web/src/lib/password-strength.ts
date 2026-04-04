export function passwordStrength(value: string): 'weak' | 'medium' | 'strong' {
  const checks = [
    value.length >= 8,
    /[A-Z]/.test(value),
    /[a-z]/.test(value),
    /[0-9]/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ]
  const passedChecks = checks.filter(Boolean).length

  if (passedChecks <= 2) return 'weak'
  if (passedChecks < 5) return 'medium'
  return value.length >= 12 ? 'strong' : 'medium'
}