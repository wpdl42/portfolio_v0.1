"use client"

import { useLayoutEffect, type RefObject } from "react"

// Measure only on open/content/viewport changes, never on the orbital render loop.
export function useSearchResultSpace(wrapRef: RefObject<HTMLDivElement | null>, listRef: RefObject<HTMLDivElement | null>, open: boolean, query: string) {
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const list = listRef.current
    const scene = wrap?.closest<HTMLElement>(".orb-scene")
    const form = wrap?.querySelector<HTMLElement>(".orb-search")
    if (!open || !wrap || !list || !scene || !form) return
    list.scrollTop = 0
    const nodes = Array.from(scene.querySelectorAll<HTMLElement>(".orb-node"))
    let frame = 0
    function measure() {
      const search = form!.getBoundingClientRect()
      const scale = search.width / form!.offsetWidth || 1
      const viewport = window.visualViewport
      const viewTop = viewport?.offsetTop ?? 0
      const viewBottom = viewTop + (viewport?.height ?? innerHeight)
      const start = search.bottom + 8 * scale
      const style = getComputedStyle(list!)
      const chrome = (parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)) * scale
      const rows = Array.from(list!.querySelectorAll<HTMLElement>("[role=option]"))
      delete list!.dataset.compact
      let heights = rows.length ? rows.map(row => row.offsetHeight * scale) : [list!.querySelector<HTMLElement>("[role=status]")!.offsetHeight * scale]
      const minimumRows = Math.min(3, heights.length)
      if (start + chrome + heights.slice(0, minimumRows).reduce((sum, height) => sum + height, 0) > viewBottom - 16) {
        list!.dataset.compact = "true"
        if (rows.length) heights = rows.map(row => row.offsetHeight * scale)
      }
      const minimumEnd = start + chrome + heights.slice(0, minimumRows).reduce((sum, height) => sum + height, 0)
      const lowerEdges = nodes.map(node => node.getBoundingClientRect()).filter(rect => rect.bottom > search.bottom).map(rect => rect.top - 20)
      // Keep satellites in place. The first three results take priority over
      // the preferred satellite clearance; extra rows still use available space.
      const available = Math.max(0, Math.min(viewBottom - 16, Math.max(minimumEnd, Math.min(...lowerEdges))) - start)
      let used = chrome
      let count = 0
      for (const height of heights) {
        if (used + height > available + .5) break
        used += height
        count++
      }
      // All ranked results stay in the list; this is the number visible before scrolling.
      list!.style.maxHeight = `${Math.max(chrome + heights[0], used) / scale}px`
      list!.dataset.visibleCount = `${count}`
      list!.dataset.availableHeight = `${available / scale}`
      const selected = list!.querySelector<HTMLElement>('[aria-selected="true"]')
      if (selected) {
        const top = selected.offsetTop
        if (top < list!.scrollTop) list!.scrollTop = top
        else if (top + selected.offsetHeight > list!.scrollTop + list!.clientHeight) list!.scrollTop = top + selected.offsetHeight - list!.clientHeight
      }
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    measure()
    const resize = new ResizeObserver(schedule)
    resize.observe(form)
    nodes.forEach(node => resize.observe(node))
    list.querySelectorAll<HTMLElement>('[role=option], [role=status]').forEach(row => resize.observe(row))
    window.addEventListener("resize", schedule)
    window.visualViewport?.addEventListener("resize", schedule)
    window.visualViewport?.addEventListener("scroll", schedule)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      window.removeEventListener("resize", schedule)
      window.visualViewport?.removeEventListener("resize", schedule)
      window.visualViewport?.removeEventListener("scroll", schedule)
    }
  }, [open, query, wrapRef, listRef])
}
