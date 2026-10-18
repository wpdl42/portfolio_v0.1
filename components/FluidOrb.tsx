"use client"

import { useEffect, useRef } from "react"
import { createFluidRenderer } from "@/lib/fluid-orb"
import { blendLightColors, categoryLight, orbHoverLight, resolveOrbLightSource, type OrbLighting, type OrbLightValues } from "@/lib/orb-lighting"
import { categories } from "@/lib/orb-content"
import { idleSurface, intersectOrbSurface, pointerProximity, proximityColor, proximitySurfacePoint, type OrbPointerInput, type Vec3 } from "@/lib/orb-surface"

type Fade = { value: number; from: number; to: number; start: number; duration: number }
const fade = (): Fade => ({ value: 0, from: 0, to: 0, start: 0, duration: 0 })
// The form uses the same screen-to-mesh ray intersection, deformation and light
// as the exposed sphere. Native window tracking also covers focused inputs/SVGs.
// Only result rows, category controls and content panels interrupt surface input.
const pointerExcludedSelector = ".orb-search-results, .orb-node, .orb-sheet"
function sampleFade(item: Fade, now: number) {
  const t = item.duration ? Math.min(1, Math.max(0, (now - item.start) / item.duration)) : 1
  item.value = item.from + (item.to - item.from) * t * t * (3 - 2 * t)
  return t < 1
}
function targetFade(item: Fade, value: number, now: number, duration: number, force = false) {
  sampleFade(item, now)
  if (item.to !== value || force && item.value !== value) { item.from = item.value; item.to = value; item.start = now; item.duration = duration }
}

export function FluidOrb({ active, lighting, interactive = true }: { active: boolean; lighting: OrbLighting; interactive?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(active)
  const interactiveRef = useRef(interactive)
  const wakeRef = useRef<(() => void) | null>(null)
  const lightRef = useRef(lighting)
  const updateLightRef = useRef<((target: OrbLighting) => void) | null>(null)

  useEffect(() => { activeRef.current = active; wakeRef.current?.() }, [active])
  useEffect(() => { interactiveRef.current = interactive; wakeRef.current?.() }, [interactive])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const input: OrbPointerInput = { clientX: 0, clientY: 0, updatedAt: 0, eligible: false }
    const categoryNodes = categories.map((category) => ({ element: document.getElementById(`category-${category.id}`), color: categoryLight({ category: category.id, source: "selection" }).color }))
    const compact = window.matchMedia("(max-width: 768px)").matches
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const renderer = createFluidRenderer(canvas, compact, (reason) => { root.dataset.fallbackReason = reason })
    let frame = 0
    let lastTime = 0
    let elapsed = 0
    let visible = true
    let loaded = false
    let lost = false
    let disposed = false
    let smoothX = 0
    let smoothY = 0
    let smoothAimX = 0
    let smoothAimY = 0
    let light = categoryLight({ category: null, source: "default" })
    let from = light
    let to = light
    let lightStart = 0
    let lightDuration = 0
    const surface = idleSurface()
    const contactFade = fade()
    const glowFade = fade()
    let glowMode = "rest"
    let directColor: Vec3 = [1, 1, 1]
    let proximityStrength = 0
    let nearby = false
    let surfaceTime = 0
    let lastInputTime = 0
    let lastInputX = 0
    let lastInputY = 0
    let targetSpeed = 0
    let surfaceSettling = false
    let hovered = false
    let lastAimX = 0
    let lastAimY = 0

    function updateSurface(now: number) {
      const delta = surfaceTime ? Math.min(50, Math.max(1, now - surfaceTime)) : 16
      surfaceTime = now
      let hit: Vec3 | null = null
      let aimX = lastAimX
      let aimY = lastAimY
      let targetColor = directColor
      let targetLightPoint: Vec3 | null = null
      let targetStrength = 0
      if (input.eligible && activeRef.current && interactiveRef.current && !document.elementFromPoint(input.clientX, input.clientY)?.closest(pointerExcludedSelector)) {
        const bounds = root!.getBoundingClientRect()
        const proximity = pointerProximity(input.clientX, input.clientY, bounds)
        targetStrength = proximity.strength
        if (targetStrength > 0) {
          hit = intersectOrbSurface(input.clientX, input.clientY, bounds, elapsed, smoothX, smoothY, surface)
          targetLightPoint = proximitySurfacePoint(input.clientX, input.clientY, bounds, elapsed, smoothX, smoothY, surface)
          // Batch current screen positions on rendered frames, including CSS orbital transforms.
          const positions = categoryNodes.flatMap(({ element, color }) => {
            if (!element) return []
            const button = element.getBoundingClientRect()
            return [{ x: button.left + button.width / 2, y: button.top + button.height / 2, color }]
          })
          targetColor = proximityColor(input.clientX, input.clientY, positions, proximity.radius)
        }
        if (hit) {
          aimX = proximity.x / (bounds.width / 2)
          aimY = proximity.y / (bounds.height / 2)
          const size = Math.max(1, Math.hypot(aimX, aimY))
          aimX /= size; aimY /= size
          lastAimX = aimX; lastAimY = aimY
          if (lastInputTime !== input.updatedAt) {
            const elapsedInput = Math.max(16, input.updatedAt - lastInputTime)
            targetSpeed = lastInputTime ? Math.min(1, Math.hypot(input.clientX - lastInputX, input.clientY - lastInputY) / Math.max(1, bounds.width / 2) / elapsedInput * 120) : 0
            lastInputX = input.clientX; lastInputY = input.clientY; lastInputTime = input.updatedAt
          }
        }
      }
      hovered = !!hit
      nearby = targetStrength > 0
      if (!hit || now - input.updatedAt > 90) targetSpeed = 0
      targetFade(contactFade, hit ? 1 : 0, now, hit ? 250 : 780)
      const categoryWins = lightRef.current.source === "interaction"
      const nextGlowMode = categoryWins ? "category" : nearby ? "proximity" : "rest"
      targetFade(glowFade, nearby && !categoryWins ? 1 : 0, now, nearby || categoryWins ? 250 : 780, nextGlowMode !== glowMode)
      glowMode = nextGlowMode
      const contactInMotion = sampleFade(contactFade, now)
      const glowInMotion = sampleFade(glowFade, now)
      const blend = 1 - Math.exp(-delta / 90)
      if (nearby) proximityStrength += (targetStrength - proximityStrength) * (1 - Math.exp(-delta / 110))
      else if (glowFade.value < .0001) proximityStrength = 0
      directColor = blendLightColors(directColor, targetColor, blend)
      const colorError = directColor.reduce((sum, value, index) => sum + Math.abs(value - targetColor[index]), 0)
      let pointError = 0
      if (hit) {
        const point = surface.point.map((value, index) => value + (hit![index] - value) * (1 - Math.exp(-delta / 65))) as Vec3
        const length = Math.hypot(...point)
        surface.point = point.map((value) => value / length) as Vec3
        pointError = Math.hypot(...surface.point.map((value, index) => value - hit![index]))
      }
      if (targetLightPoint) {
        const point = surface.lightPoint.map((value, index) => value + (targetLightPoint![index] - value) * (1 - Math.exp(-delta / 100))) as Vec3
        const length = Math.hypot(...point)
        surface.lightPoint = point.map((value) => value / length) as Vec3
        pointError += Math.hypot(...surface.lightPoint.map((value, index) => value - targetLightPoint![index]))
      }
      const targetX = reduced.matches ? 0 : aimX * contactFade.value
      const targetY = reduced.matches ? 0 : aimY * contactFade.value
      if (hit) {
        smoothAimX += (aimX - smoothAimX) * (1 - Math.exp(-delta / 90))
        smoothAimY += (aimY - smoothAimY) * (1 - Math.exp(-delta / 90))
      }
      smoothX = reduced.matches ? 0 : smoothAimX * contactFade.value
      smoothY = reduced.matches ? 0 : smoothAimY * contactFade.value
      surface.speed = reduced.matches ? 0 : surface.speed + (targetSpeed - surface.speed) * blend
      surface.motion = reduced.matches ? 0 : contactFade.value
      surface.glow = glowFade.value * proximityStrength
      surface.color = directColor
      surface.motionScale = reduced.matches ? 0 : 1
      surfaceSettling = contactInMotion || glowInMotion || colorError > .001 || pointError > .0005 || nearby && Math.abs(proximityStrength - targetStrength) > .001 || Math.abs(smoothX - targetX) + Math.abs(smoothY - targetY) > .0005 || Math.abs(surface.speed - targetSpeed) > .001
      const source = resolveOrbLightSource(lightRef.current, nearby)
      const category = source === "orb" ? "" : lightRef.current.category ?? ""
      if (root!.dataset.surfaceHover !== `${hovered}`) root!.dataset.surfaceHover = `${hovered}`
      if (root!.dataset.proximity !== `${nearby}`) root!.dataset.proximity = `${nearby}`
      if (root!.dataset.lightSource !== source) root!.dataset.lightSource = source
      if (root!.dataset.lightCategory !== category) root!.dataset.lightCategory = category
    }

    function sampleLight(now: number) {
      const progress = lightDuration ? Math.min(1, Math.max(0, (now - lightStart) / lightDuration)) : 1
      const eased = progress * progress * (3 - 2 * progress)
      const mix = (a: number, b: number) => a + (b - a) * eased
      light = {
        color: blendLightColors(from.color, to.color, eased),
        direction: from.direction.map((value, index) => mix(value, to.direction[index])) as OrbLightValues["direction"],
        strength: mix(from.strength, to.strength),
      }
      return progress < 1
    }

    function updateLight(target: OrbLighting) {
      const now = performance.now()
      sampleLight(now)
      from = light
      to = categoryLight(target)
      // Read layout once on a state change, never in the animation loop.
      const node = target.category ? document.getElementById(`category-${target.category}`) : null
      if (node) {
        const button = node.getBoundingClientRect()
        const sphere = root!.getBoundingClientRect()
        const x = button.left + button.width / 2 - (sphere.left + sphere.width / 2)
        const y = sphere.top + sphere.height / 2 - (button.top + button.height / 2)
        const length = Math.hypot(x, y) || 1
        to.direction = [x / length, y / length]
      } else to.direction = light.direction
      lightStart = now
      lightDuration = target.source === "interaction" ? 250 : 420
      root!.dataset.lightCategory = target.category ?? ""
      root!.dataset.lightSource = target.source
      wake()
    }

    function draw(now = performance.now()) {
      if (disposed) return
      updateSurface(now)
      const amount = surface.glow
      const effectiveLight: OrbLightValues = {
        color: blendLightColors(light.color, directColor, amount),
        direction: light.direction.map((value, index) => value + (surface.lightPoint[index] - value) * amount) as [number, number],
        strength: Math.min(orbHoverLight.strength, light.strength + orbHoverLight.strength * amount),
      }
      // A screen-blended directional layer keeps the static fallback's details intact.
      const glow = glowRef.current
      if (glow && (!renderer || !loaded || lost)) {
        const rgb = effectiveLight.color.map((value) => Math.round(value * 255)).join(" ")
        const x = light.direction[0] * (1 - amount) + surface.lightPoint[0] * amount
        const y = light.direction[1] * (1 - amount) + surface.lightPoint[1] * amount
        glow.style.background = `radial-gradient(ellipse at ${50 + x * 36}% ${50 - y * 36}%, rgb(${rgb} / .75), rgb(${rgb} / .18) 38%, transparent 72%)`
        glow.style.opacity = `${effectiveLight.strength * .65}`
        root!.style.setProperty("--surface-x", `${smoothX * 1.25}%`)
        root!.style.setProperty("--surface-y", `${-smoothY * 1.25}%`)
        root!.style.setProperty("--surface-tilt-x", `${-smoothY * 4.3}deg`)
        root!.style.setProperty("--surface-tilt-y", `${smoothX * 4.3}deg`)
      }
      if (renderer && loaded && !lost) {
        renderer.draw(elapsed, smoothX, smoothY, light, surface)
        if (root!.dataset.renderer !== "webgl") root!.dataset.renderer = "webgl"
      }
    }

    function tick(time: number) {
      frame = 0
      if (disposed) return
      if (document.hidden || !visible || !activeRef.current) { wake(); return }
      const delta = lastTime ? time - lastTime : 0
      const lightingInMotion = sampleLight(time)
      const surfaceInMotion = !!renderer && loaded && !lost && !reduced.matches
      if (delta >= (compact ? 33 : 22) || !lastTime) {
        if (surfaceInMotion) elapsed += Math.min(delta, 50) / 1000
        lastTime = time
        draw(time)
      }
      if (surfaceInMotion || lightingInMotion || surfaceSettling || nearby && !reduced.matches) frame = requestAnimationFrame(tick)
      else { draw(); root!.dataset.renderState = reduced.matches ? "static" : "paused" }
    }

    function wake() {
      cancelAnimationFrame(frame)
      frame = 0
      lastTime = 0
      const lightingInMotion = sampleLight(performance.now())
      if (!document.hidden && visible && activeRef.current) draw()
      else {
        input.eligible = false; hovered = nearby = false; root!.dataset.surfaceHover = "false"; root!.dataset.proximity = "false"
        if (!activeRef.current) {
          // An expanded panel must not restore an old contact pose when collapsed.
          Object.assign(contactFade, fade())
          Object.assign(glowFade, fade())
          smoothX = smoothY = smoothAimX = smoothAimY = 0
          surface.motion = surface.glow = surface.speed = 0
          proximityStrength = 0
          surfaceSettling = false
          glowMode = "rest"
          root!.dataset.lightSource = lightRef.current.source
          root!.dataset.lightCategory = lightRef.current.category ?? ""
        }
      }
      const running = !document.hidden && visible && activeRef.current && (!!renderer && loaded && !reduced.matches && !lost || lightingInMotion || surfaceSettling || nearby && !reduced.matches)
      root!.dataset.renderState = running ? "running" : reduced.matches ? "static" : "paused"
      if (running) frame = requestAnimationFrame(tick)
    }

    function loseContext(event: Event) {
      event.preventDefault()
      lost = true
      root!.dataset.renderer = "fallback"
      wake()
    }

    function onPointerMove(event: Event) {
      const pointer = event as PointerEvent
      input.eligible = activeRef.current && interactiveRef.current && pointer.pointerType !== "touch" && !(pointer.target as Element).closest(pointerExcludedSelector)
      input.clientX = pointer.clientX; input.clientY = pointer.clientY; input.updatedAt = performance.now()
      if (!frame) wake()
    }

    function onPointerLeave() {
      input.eligible = false
      if (!frame) wake()
    }

    function onPointerOut(event: PointerEvent) { if (!event.relatedTarget) onPointerLeave() }

    const image = new Image()
    image.onload = () => { if (disposed || lost || !renderer) return; renderer.loadImage(image); loaded = true; wake() }
    image.onerror = () => { lost = true; root.dataset.renderer = "fallback"; wake() }
    if (renderer) image.src = "/images/iridescent-orb.png"
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake() })
    observer.observe(root)
    const resize = new ResizeObserver(wake)
    resize.observe(canvas)
    document.addEventListener("visibilitychange", wake)
    reduced.addEventListener("change", wake)
    canvas.addEventListener("webglcontextlost", loseContext)
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("pointerout", onPointerOut)
    window.addEventListener("pointercancel", onPointerLeave)
    window.addEventListener("blur", onPointerLeave)
    wakeRef.current = wake
    updateLightRef.current = updateLight
    updateLight(lightRef.current)
    return () => {
      disposed = true
      wakeRef.current = null
      updateLightRef.current = null
      cancelAnimationFrame(frame)
      image.onload = null
      image.onerror = null
      observer.disconnect()
      resize.disconnect()
      document.removeEventListener("visibilitychange", wake)
      reduced.removeEventListener("change", wake)
      canvas.removeEventListener("webglcontextlost", loseContext)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerout", onPointerOut)
      window.removeEventListener("pointercancel", onPointerLeave)
      window.removeEventListener("blur", onPointerLeave)
      renderer?.dispose()
    }
  }, [])

  useEffect(() => {
    lightRef.current = lighting
    updateLightRef.current?.(lighting)
  }, [lighting])

  return <div className="orb-fluid" ref={rootRef} data-renderer="fallback" aria-hidden="true"><div className="orb-sphere-art" /><canvas ref={canvasRef} className="orb-webgl" /><div ref={glowRef} className="orb-category-glow" /></div>
}
