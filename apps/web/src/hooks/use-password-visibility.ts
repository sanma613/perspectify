import { useState } from 'react'

export function usePasswordVisibility() {
  const [visible, setVisible] = useState(false)

  return {
    visible,
    toggle: () => setVisible((value) => !value),
    inputType: visible ? 'text' : 'password',
  } as const
}