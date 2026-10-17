"use client"

import { useRef, type PointerEvent } from "react"

export function HeroVisual() {
  const cardRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const entryTimerRef = useRef<number | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })

  function handlePointerEnter(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    const card = cardRef.current
    if (!card) return
    if (card.dataset.tilting === "true" || card.dataset.entering === "true") return

    if (entryTimerRef.current !== null) clearTimeout(entryTimerRef.current)
    card.dataset.entering = "true"
    entryTimerRef.current = window.setTimeout(() => {
      delete card.dataset.entering
      entryTimerRef.current = null
    }, 280)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    const offsetX = x - 0.5
    const offsetY = y - 0.5
    pointerRef.current = { x: offsetX, y: offsetY }

    if (frameRef.current !== null) return

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const card = cardRef.current
      if (!card) return

      const { x, y } = pointerRef.current
      const brightness = Math.max(-1, Math.min(1, -(x + y) * 2))
      const bottomRightReduction = x > 0 && y > 0 ? 1 - Math.min(x, y) * 0.8 : 1
      card.dataset.tilting = "true"
      card.style.setProperty("--tilt-x", `${-y * 14}deg`)
      card.style.setProperty("--tilt-y", `${x * 14}deg`)
      card.style.setProperty(
        "--shade-color",
        brightness > 0 ? `rgba(255, 255, 255, ${brightness * 0.16})` : `rgba(0, 0, 0, ${-brightness * 0.064 * bottomRightReduction})`,
      )
    })
  }

  function resetTilt() {
    if (entryTimerRef.current !== null) {
      clearTimeout(entryTimerRef.current)
      entryTimerRef.current = null
    }

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    const card = cardRef.current

    if (!card) return

    delete card.dataset.entering
    delete card.dataset.tilting
    card.style.setProperty("--tilt-x", "0deg")
    card.style.setProperty("--tilt-y", "0deg")
    card.style.setProperty("--shade-color", "transparent")
  }

  return (
    <div className="hero-visual-shell" onPointerEnter={handlePointerEnter} onPointerMove={handlePointerMove} onPointerLeave={resetTilt}>
      <div className="hero-visual" ref={cardRef} aria-label="장주민 포트폴리오 소개 카드">
        <div className="visual-label">CURRENT FOCUS</div>
        <div className="visual-orbit visual-orbit-one" />
        <div className="visual-orbit visual-orbit-two" />
        <div className="visual-core">WEB<br />×<br />SECURITY</div>
        <p>Next.js · JavaScript · Linux</p>
      </div>
    </div>
  )
}
