"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent, type TransitionEvent } from "react"
import type { Project } from "@/lib/portfolio"
import { getProjectDetail } from "@/lib/project-details"
import { ProjectArtwork } from "@/components/ProjectArtwork"

type DragState = {
  pointerId: number
  startX: number
  startPosition: number
  position: number
  dragged: boolean
  samples: { x: number; time: number }[]
}

export function FeaturedProjectsCarousel({ projects, expanded = false, initialProjectId }: { projects: Project[]; expanded?: boolean; initialProjectId?: number | null }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const strideRef = useRef(0)
  const indexRef = useRef(projects.length)
  const dragRef = useRef<DragState | null>(null)
  const inertiaRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)

  const moveTo = useCallback((position: number, animate: boolean) => {
    const track = trackRef.current
    if (!track) return

    track.style.transition = animate ? "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)" : "none"
    track.style.transform = `translate3d(${-position}px, 0, 0)`
  }, [])

  const updateVisibleCards = useCallback(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return

    const bounds = viewport.getBoundingClientRect()
    for (const [index, wrapper] of Array.from(track.children).entries()) {
      const card = wrapper.querySelector<HTMLElement>(".project-card")!
      const rect = card.getBoundingClientRect()
      const hidden = expanded ? index < projects.length || index >= projects.length * 2 : rect.right <= bounds.left || rect.left >= bounds.right
      card.setAttribute("aria-hidden", hidden ? "true" : "false")
      card.setAttribute("tabindex", hidden ? "-1" : "0")
      wrapper.setAttribute("aria-hidden", hidden ? "true" : "false")
      wrapper.querySelector(".project-visit-link")?.setAttribute("tabindex", hidden ? "-1" : "0")
    }
  }, [expanded, projects.length])

  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return

    const measure = () => {
      indexRef.current = projects.length + Math.max(0, projects.findIndex((project) => project.id === initialProjectId))
      const card = track.querySelector<HTMLElement>(".project-card")
      if (!card) return

      strideRef.current = card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).gap)
      moveTo(indexRef.current * strideRef.current, false)
      updateVisibleCards()
    }

    measure()
    const pauseWhenHidden = () => {
      if (!document.hidden || inertiaRef.current === null) return
      cancelAnimationFrame(inertiaRef.current)
      inertiaRef.current = null
      delete viewport.dataset.inertia
      updateVisibleCards()
    }
    document.addEventListener("visibilitychange", pauseWhenHidden)
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", pauseWhenHidden)
      if (inertiaRef.current !== null) cancelAnimationFrame(inertiaRef.current)
      inertiaRef.current = null
    }
  }, [moveTo, updateVisibleCards, projects, initialProjectId])

  function wrap(position: number) {
    const cycle = projects.length * strideRef.current
    if (!cycle) return position
    return cycle + (((position - cycle) % cycle) + cycle) % cycle
  }

  function stopInertia() {
    if (inertiaRef.current !== null) {
      cancelAnimationFrame(inertiaRef.current)
      inertiaRef.current = null
    }
    if (viewportRef.current) delete viewportRef.current.dataset.inertia
  }

  function snapTo(position: number) {
    indexRef.current = Math.round(position / strideRef.current)
    moveTo(indexRef.current * strideRef.current, true)
  }

  function recordPointer(drag: DragState, x: number) {
    const time = performance.now()
    drag.samples.push({ x, time })
    while (drag.samples.length > 2 && drag.samples[0].time < time - 100) {
      drag.samples.shift()
    }
  }

  function startInertia(position: number, initialVelocity: number) {
    const viewport = viewportRef.current
    if (viewport) viewport.dataset.inertia = "true"

    let velocity = Math.max(-3, Math.min(3, initialVelocity))
    let lastTime = performance.now()
    let elapsed = 0

    const step = (time: number) => {
      const delta = Math.min(time - lastTime, 32)
      lastTime = time
      elapsed += delta
      position = wrap(position + velocity * delta)
      moveTo(position, false)
      velocity *= Math.exp(-delta / 260)

      if (Math.abs(velocity) < 0.06 || elapsed > 1400) {
        inertiaRef.current = null
        if (viewport) delete viewport.dataset.inertia
        snapTo(position)
        return
      }

      inertiaRef.current = requestAnimationFrame(step)
    }

    inertiaRef.current = requestAnimationFrame(step)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (expanded) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (!strideRef.current) return
    if (dragRef.current) return

    const track = trackRef.current
    if (!track) return

    stopInertia()
    suppressClickRef.current = false
    const currentPosition = -new DOMMatrixReadOnly(getComputedStyle(track).transform).m41
    track.style.transition = "none"
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startPosition: wrap(currentPosition),
      position: wrap(currentPosition),
      dragged: false,
      samples: [{ x: event.clientX, time: performance.now() }],
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    if (!drag.dragged) {
      if (Math.abs(event.clientX - drag.startX) < 8) return
      drag.dragged = true
      suppressClickRef.current = true
      event.currentTarget.dataset.dragging = "true"
      event.currentTarget.setPointerCapture(event.pointerId)
      if (document.activeElement instanceof HTMLElement && event.currentTarget.contains(document.activeElement)) {
        document.activeElement.blur()
      }
    }

    drag.position = wrap(drag.startPosition - (event.clientX - drag.startX))
    recordPointer(drag, event.clientX)
    moveTo(drag.position, false)
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, canceled = false) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    drag.position = wrap(drag.startPosition - (event.clientX - drag.startX))
    recordPointer(drag, event.clientX)
    dragRef.current = null
    delete event.currentTarget.dataset.dragging
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (!drag.dragged) {
      snapTo(drag.position)
      return
    }

    const first = drag.samples[0]
    const last = drag.samples[drag.samples.length - 1]
    const duration = last.time - first.time
    const velocity = duration > 0 ? (first.x - last.x) / duration : 0

    if (canceled || Math.abs(velocity) < 0.25 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      snapTo(drag.position)
    } else {
      startInertia(drag.position, velocity)
    }
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== trackRef.current || event.propertyName !== "transform") return

    const count = projects.length
    if (indexRef.current < count) indexRef.current += count
    if (indexRef.current >= count * 2) indexRef.current -= count
    moveTo(indexRef.current * strideRef.current, false)
    updateVisibleCards()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (expanded) return
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    if (inertiaRef.current !== null && trackRef.current) {
      const position = -new DOMMatrixReadOnly(getComputedStyle(trackRef.current).transform).m41
      indexRef.current = Math.round(wrap(position) / strideRef.current)
    }
    stopInertia()
    indexRef.current += event.key === "ArrowRight" ? 1 : -1
    moveTo(indexRef.current * strideRef.current, true)
  }

  function handlePointerLeave() {
    const drag = dragRef.current
    if (!drag || drag.dragged) return
    dragRef.current = null
    snapTo(drag.position)
  }

  return (
    <div
      className="featured-viewport"
      ref={viewportRef}
      role="region"
      aria-roledescription={expanded ? undefined : "carousel"}
      aria-label="최근 프로젝트"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishDrag(event)}
      onPointerCancel={(event) => finishDrag(event, true)}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
    >
      <div className="featured-track" ref={trackRef} onTransitionEnd={handleTransitionEnd}>
        {[0, 1, 2].flatMap((copy) =>
          projects.map((project) => (
            <div className="project-card-wrap" key={`${copy}-${project.id}`} data-copy={copy}>
            <Link
              className={`project-card accent-${project.accent}`}
              href={`/projects/${project.routeId ?? project.id}`}
              key={`${copy}-${project.id}`}
              data-copy={copy}
              aria-hidden={copy !== 1}
              aria-label={`${project.title} 상세 보기`}
              tabIndex={copy === 1 ? 0 : -1}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onClick={(event) => {
                if (suppressClickRef.current && event.detail !== 0) {
                  event.preventDefault()
                  suppressClickRef.current = false
                }
              }}
            >
              <div className="project-preview">
                <span>{String(project.id).padStart(2, "0")}</span>
                <ProjectArtwork project={project} />
              </div>
              <div className="project-body">
                <div className="project-card-meta"><span>{project.category}</span><span>{project.period.split(" —")[0]}</span></div>
                <h3>{project.title}</h3>
                <p className="project-description">{project.description}</p>
                <div className="project-card-tags">{getProjectDetail(project).tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <span className="orb-card-arrow" aria-hidden="true">→</span>
              </div>
            </Link>
            {project.link && <a className="project-visit-link" href={project.link} target="_blank" rel="noreferrer" draggable={false} onDragStart={event=>event.preventDefault()} onPointerDown={event=>event.stopPropagation()}>사이트 방문 ↗</a>}
            </div>
          )),
        )}
      </div>
    </div>
  )
}
