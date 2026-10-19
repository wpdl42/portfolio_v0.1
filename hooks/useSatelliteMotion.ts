"use client"

import { useEffect, useRef, type RefObject } from "react"
import type { CategoryId } from "@/lib/orb-content"

const orbits = [
  { phase: .7, speed: .09, x: 22, y: 12 },
  { phase: 2.8, speed: -.073, x: 24, y: 10 },
  { phase: 4.1, speed: .064, x: 13, y: 17 },
  { phase: 1.9, speed: -.081, x: 24, y: 12 },
  { phase: 5.2, speed: .058, x: 22, y: 10 },
  { phase: 3.6, speed: -.067, x: 16, y: 14 },
]

export function useSatelliteMotion(scene: RefObject<HTMLDivElement | null>, activeCategory: CategoryId | null, enabled: boolean, searchOpen = false, layoutKey = "") {
  const activeRef = useRef(activeCategory)
  const enabledRef = useRef(enabled)
  const searchOpenRef = useRef(searchOpen)
  const wakeRef = useRef<(() => void) | null>(null)
  useEffect(() => { activeRef.current = activeCategory; enabledRef.current = enabled; wakeRef.current?.() }, [activeCategory, enabled])
  useEffect(() => { searchOpenRef.current = searchOpen; wakeRef.current?.() }, [searchOpen])

  useEffect(() => {
    const root = scene.current
    if (!root) return
    const reduced = matchMedia("(prefers-reduced-motion: reduce)")
    const mobile = matchMedia("(max-width: 768px)")
    const nodes = Array.from(root.querySelectorAll<HTMLButtonElement>(".orb-node")).map((element, index) => ({ element, orbit: orbits[index], radiusX: orbits[index].x, radiusY: orbits[index].y, clock: 0, hover: false, focus: false, pressed: false }))
    let frame = 0
    let lastTime = 0
    let visible = true
    const cleanups: (() => void)[] = []

    function measureBounds() {
      for (const node of nodes) {
        // Keep the full elliptical path and its small scale change inside the scene.
        node.radiusX = Math.min(node.orbit.x, Math.max(0,node.element.offsetLeft - 8), Math.max(0,root!.clientWidth - node.element.offsetLeft - node.element.offsetWidth - 8))
        node.radiusY = Math.min(node.orbit.y, Math.max(0,node.element.offsetTop - 8), Math.max(0,root!.clientHeight - node.element.offsetTop - node.element.offsetHeight - 8))
      }
    }

    for (const node of nodes) {
      const onEnter = () => { node.hover = true }
      const onLeave = () => { node.hover = false }
      const onFocus = () => { node.focus = true }
      const onBlur = () => { node.focus = false }
      const onPress = () => { node.pressed = true }
      const onRelease = () => { node.pressed = false }
      node.element.addEventListener("pointerenter", onEnter)
      node.element.addEventListener("pointerleave", onLeave)
      node.element.addEventListener("focus", onFocus)
      node.element.addEventListener("blur", onBlur)
      node.element.addEventListener("pointerdown", onPress)
      window.addEventListener("pointerup", onRelease)
      window.addEventListener("pointercancel", onRelease)
      cleanups.push(() => {
        node.element.removeEventListener("pointerenter", onEnter)
        node.element.removeEventListener("pointerleave", onLeave)
        node.element.removeEventListener("focus", onFocus)
        node.element.removeEventListener("blur", onBlur)
        node.element.removeEventListener("pointerdown", onPress)
        window.removeEventListener("pointerup", onRelease)
        window.removeEventListener("pointercancel", onRelease)
      })
    }

    function tick(time: number) {
      frame = 0
      if (document.hidden || !visible || !enabledRef.current || reduced.matches || mobile.matches) { wake(); return }
      if (lastTime && time - lastTime < 32) { frame = requestAnimationFrame(tick); return }
      const delta = lastTime ? Math.min(time - lastTime, 70) / 1000 : 0
      lastTime = time
      for (const node of nodes) {
        const paused = searchOpenRef.current && node.element.offsetTop + node.element.offsetHeight >= root!.clientHeight / 2 - 40 || node.hover || node.focus || node.pressed || document.activeElement === node.element || node.element.matches(":focus, :hover") || node.element.id === `category-${activeRef.current}`
        node.element.dataset.motion = paused ? "paused" : "running"
        if (paused) continue
        node.clock += delta
        const angle = node.orbit.phase + node.clock * node.orbit.speed
        node.element.style.setProperty("--satellite-x", `${Math.cos(angle) * node.radiusX}px`)
        node.element.style.setProperty("--satellite-y", `${Math.sin(angle) * node.radiusY}px`)
        node.element.style.setProperty("--satellite-scale", `${1 + Math.sin(angle) * .025}`)
      }
      frame = requestAnimationFrame(tick)
    }

    function wake() {
      cancelAnimationFrame(frame)
      lastTime = 0
      if (mobile.matches || reduced.matches) {
        for (const { element } of nodes) {
          element.style.setProperty("--satellite-x", "0px")
          element.style.setProperty("--satellite-y", "0px")
          element.style.setProperty("--satellite-scale", "1")
          element.dataset.motion = "static"
        }
      } else if (!document.hidden && visible && enabledRef.current) frame = requestAnimationFrame(tick)
      else nodes.forEach(({ element }) => { element.dataset.motion = "paused" })
    }

    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake() })
    observer.observe(root)
    const resize = new ResizeObserver(measureBounds)
    resize.observe(root)
    for (const { element } of nodes) resize.observe(element)
    measureBounds()
    reduced.addEventListener("change", wake)
    mobile.addEventListener("change", wake)
    document.addEventListener("visibilitychange", wake)
    wakeRef.current = wake
    wake()
    return () => {
      cancelAnimationFrame(frame)
      wakeRef.current = null
      observer.disconnect()
      resize.disconnect()
      reduced.removeEventListener("change", wake)
      mobile.removeEventListener("change", wake)
      document.removeEventListener("visibilitychange", wake)
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [scene, layoutKey])
}
