"use client"

import { useCallback, useEffect, useLayoutEffect, useRef } from "react"

export const loungeCloseEvent = "portfolio:lounge-before-close"
const discardMessage = "작성 중인 내용이 저장되지 않았습니다. 내용을 버리고 이동할까요?"

export function useLoungeNavigationGuard(dirty: boolean, busy: boolean, onBlocked: (message: string) => void) {
  const state = useRef({ dirty, busy, onBlocked })
  const current = useRef<{ url: string; history: unknown } | null>(null)
  const accepted = useRef(false)
  useLayoutEffect(() => {
    state.current = { dirty, busy, onBlocked }
    accepted.current = false
  }, [dirty, busy, onBlocked])

  const confirmNavigation = useCallback(() => {
    if (state.current.busy) { state.current.onBlocked("저장 중입니다. 완료 후 이동해 주세요."); return false }
    return !state.current.dirty || window.confirm(discardMessage)
  }, [])
  const rememberUrl = useCallback(() => {
    current.current = { url: location.pathname + location.search, history: history.state }
  }, [])

  useEffect(() => {
    rememberUrl()
    const close = (event: Event) => {
      if (accepted.current) return
      if (!confirmNavigation()) event.preventDefault()
      else accepted.current = true
    }
    const unload = (event: BeforeUnloadEvent) => {
      if (accepted.current || !state.current.dirty && !state.current.busy) return
      event.preventDefault(); event.returnValue = ""
    }
    const pop = (event: PopStateEvent) => {
      const previous = current.current
      if (previous && !confirmNavigation()) {
        event.stopImmediatePropagation()
        // Restore the current URL before Orb/Next process the rejected navigation.
        // Form contents and credentials are never written into history.
        history.pushState(previous.history, "", previous.url)
        return
      }
      accepted.current = true
      rememberUrl()
    }
    window.addEventListener(loungeCloseEvent, close)
    window.addEventListener("beforeunload", unload)
    window.addEventListener("popstate", pop, true)
    return () => {
      window.removeEventListener(loungeCloseEvent, close)
      window.removeEventListener("beforeunload", unload)
      window.removeEventListener("popstate", pop, true)
    }
  }, [confirmNavigation, rememberUrl])
  return { confirmNavigation, rememberUrl }
}
