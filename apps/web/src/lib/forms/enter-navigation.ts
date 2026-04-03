import type { KeyboardEvent } from 'react'

type EnterAdvanceOptions = {
  onComplete?: () => void
  allowFormSubmit?: boolean
  enforceValidity?: boolean
}

function isVisible(element: HTMLElement) {
  return element.offsetParent !== null || element.getClientRects().length > 0
}

function isTextLikeField(element: HTMLElement) {
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly
  if (element instanceof HTMLSelectElement) return !element.disabled

  if (element instanceof HTMLInputElement) {
    if (element.disabled || element.readOnly) return false
    const unsupported = new Set(['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'reset', 'submit'])
    return !unsupported.has(element.type)
  }

  return false
}

function canValidate(element: HTMLElement): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  )
}

function ensureValid(element: HTMLElement) {
  if (!canValidate(element)) return true
  if (element.checkValidity()) return true
  element.reportValidity()
  return false
}

export function handleEnterAdvance(event: KeyboardEvent<HTMLElement>, options?: EnterAdvanceOptions) {
  if (event.key !== 'Enter') return
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.nativeEvent.isComposing) return

  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (!isTextLikeField(target)) return

  const container = event.currentTarget
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>('input, select, textarea')
  ).filter((element) => isVisible(element) && isTextLikeField(element))

  if (candidates.length === 0) return

  const currentIndex = candidates.findIndex((element) => element === target)
  if (currentIndex === -1) return

  const enforceValidity = options?.enforceValidity !== false
  if (enforceValidity && !ensureValid(target)) return

  event.preventDefault()

  const nextField = candidates[currentIndex + 1]
  if (nextField) {
    nextField.focus()
    return
  }

  const submitTrigger =
    container.querySelector<HTMLElement>('button[data-enter-submit]:not([disabled])') ??
    container.querySelector<HTMLElement>('button[type="submit"]:not([disabled])')

  if (submitTrigger) {
    if (enforceValidity) {
      const firstInvalid = candidates.find((element) => !ensureValid(element))
      if (firstInvalid) {
        firstInvalid.focus()
        return
      }
    }

    submitTrigger.click()
    return
  }

  if (container instanceof HTMLFormElement && options?.allowFormSubmit !== false) {
    if (enforceValidity && !container.checkValidity()) {
      container.reportValidity()
      return
    }

    container.requestSubmit()
    return
  }

  options?.onComplete?.()
}