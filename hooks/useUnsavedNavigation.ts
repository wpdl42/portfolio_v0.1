"use client"

import { useEffect, useRef, type RefObject } from "react"

// A same-URL history entry lets Back be cancelled before Next navigates away.
// Keep Next's history fields intact and never store form contents in history.
export function useUnsavedNavigation(dirty: boolean, busy: boolean, leaving: RefObject<boolean>) {
  const guard = useRef<{ token: string; url: string } | null>(null)

  useEffect(() => {
    if (!dirty || guard.current) return
    const token = crypto.randomUUID()
    const url = location.pathname + location.search
    guard.current = { token, url }
    history.pushState({ ...history.state, portfolioCmsGuard: token }, "", url)
  }, [dirty])

  useEffect(() => {
    function back(event: PopStateEvent) {
      const current = guard.current
      if (!current || leaving.current || event.state?.portfolioCmsGuard === current.token) return
      if (location.pathname + location.search !== current.url) return
      event.stopImmediatePropagation()
      if (busy || (dirty && !window.confirm("저장하지 않은 변경 사항이 있습니다. 변경을 버리고 이동할까요?"))) {
        history.pushState({ ...history.state, portfolioCmsGuard: current.token }, "", current.url)
        return
      }
      guard.current = null
      leaving.current = true
      history.back()
    }
    window.addEventListener("popstate", back, true)
    return () => window.removeEventListener("popstate", back, true)
  }, [dirty, busy, leaving])
}
