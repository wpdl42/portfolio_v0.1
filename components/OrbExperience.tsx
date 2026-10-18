"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
} from "react"
import { CategoryContent } from "@/components/CategoryContent"
import { OrbEditorialPanel } from "@/components/OrbEditorialPanel"
import { OrbSearch } from "@/components/OrbSearch"
import { FluidOrb } from "@/components/FluidOrb"
import { useSatelliteMotion } from "@/hooks/useSatelliteMotion"
import {
  type Project,
} from "@/lib/portfolio"
import { categories, matchesCategory, parseCategory, type CategoryId } from "@/lib/orb-content"
import { resolveOrbLighting } from "@/lib/orb-lighting"
import { getProjectDetail } from "@/lib/project-details"

type SheetState = "closed" | "partial" | "expanded"

export function OrbExperience({
  projects,
  initialCategory,
  initialView,
}: {
  projects: Project[]
  initialCategory?: string
  initialView?: string
}) {
  const router = useRouter()
  const initialActive = parseCategory(initialCategory)
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(
    initialActive,
  )
  const [sheetState, setSheetState] = useState<SheetState>(
    initialActive
      ? initialView === "expanded"
        ? "expanded"
        : "partial"
      : "closed",
  )
  const [isClosing, setIsClosing] = useState(false)
  const [closingView, setClosingView] = useState<SheetState>("partial")
  const [searchQuery, setSearchQuery] = useState("")
  const [hoveredCategory, setHoveredCategory] = useState<CategoryId | null>(
    null,
  )
  const [focusedCategory, setFocusedCategory] = useState<CategoryId | null>(
    null,
  )
  const editorial = activeCategory === "about" || activeCategory === "contact"
  const interactionCategory =
    sheetState === "expanded" || editorial ? null : (hoveredCategory ?? focusedCategory)
  const lighting = useMemo(
    () => resolveOrbLighting(interactionCategory, activeCategory, searchQuery, projects),
    [interactionCategory, activeCategory, searchQuery, projects],
  )
  const [targetProjectId, setTargetProjectId] = useState<number | null>(null)
  const [filter, setFilter] = useState(initialCategory === "experiments" ? "Experiments" : "All")
  const [sort, setSort] = useState("Latest")
  const sheetRef = useRef<HTMLElement>(null)
  const sheetScrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startY: number
    startTime: number
    pointerId: number
    startHeight: number
  } | null>(null)
  const suppressHandleClickRef = useRef(false)
  const sceneRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closingCategoryRef = useRef<CategoryId | null>(null)
  const restoreFocusRef = useRef<CategoryId | null>(null)
  const focusPanelRef = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [searchResultsOpen, setSearchResultsOpen] = useState(false)
  useSatelliteMotion(sceneRef, activeCategory, sheetState !== "expanded", searchResultsOpen)

  useEffect(() => {
    if (!initialActive) return
    const params = new URLSearchParams(location.search)
    if (initialCategory !== initialActive) {
      params.set("category", initialActive)
      if (initialCategory === "experiments") params.set("filter", "Experiments")
      window.history.replaceState(null, "", `/?${params}`)
    }
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem("orb-explore-return") ?? "null")
        if (saved?.category === initialActive && saved.url === location.pathname + location.search) {
          setFilter(saved.filter ?? "All")
          setSort(saved.sort ?? "Latest")
          setTargetProjectId(saved.projectId ?? null)
          requestAnimationFrame(() => { if (sheetScrollRef.current) sheetScrollRef.current.scrollTop = saved.scrollTop ?? 0 })
        } else if (params.get("filter") === "Experiments") setFilter("Experiments")
      } catch { /* Navigation works without browser storage. */ }
    }, 0)
    return () => clearTimeout(timer)
  }, [initialActive, initialCategory])

  const finishClose = useCallback(() => {
    const category = closingCategoryRef.current
    if (!category) return
    closingCategoryRef.current = null
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setActiveCategory(null)
    setIsClosing(false)
    setHoveredCategory(null)
    setFocusedCategory(null)
    restoreFocusRef.current = category
  }, [])

  useEffect(() => {
    if (activeCategory || !restoreFocusRef.current) return
    const category = restoreFocusRef.current
    restoreFocusRef.current = null
    const frame = requestAnimationFrame(() => document.getElementById(`category-${category}`)?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [activeCategory])

  useEffect(() => {
    if (!activeCategory || editorial || sheetState === "closed" || !focusPanelRef.current) return
    focusPanelRef.current = false
    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [activeCategory, editorial, sheetState])

  const closeSheet = useCallback(
    (updateHistory = true) => {
      if (!activeCategory || closingCategoryRef.current) return
      closingCategoryRef.current = activeCategory
      setClosingView(sheetState)
      setIsClosing(true)
      setSheetState("closed")
      if (updateHistory) window.history.pushState(null, "", "/")
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? 0
        : 730
      closeTimerRef.current = setTimeout(finishClose, duration)
    },
    [activeCategory, sheetState, finishClose],
  )

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && activeCategory && sheetState !== "closed") {
        event.preventDefault()
        closeSheet()
      }
    }
    document.addEventListener("keydown", onEscape)
    return () => document.removeEventListener("keydown", onEscape)
  }, [activeCategory, sheetState, closeSheet])

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const category = params.get("category") ?? undefined
      const next = parseCategory(category)
      if (!next) {
        closeSheet(false)
        return
      }
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      closingCategoryRef.current = null
      setIsClosing(false)
      setActiveCategory(next)
      setFilter(category === "experiments" || params.get("filter") === "Experiments" ? "Experiments" : "All")
      setSheetState(params.get("view") === "expanded" ? "expanded" : "partial")
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [closeSheet])

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    },
    [],
  )

  function setUrl(
    category: CategoryId | null,
    view: SheetState,
    replace = false,
  ) {
    const url = category ? `/?category=${category}&view=${view}` : "/"
    if (window.location.pathname + window.location.search === url) return
    window.history[replace ? "replaceState" : "pushState"](null, "", url)
  }

  function openCategory(
    category: CategoryId,
    projectId: number | null = null,
    focusPanel = false,
    nextFilter = "All",
  ) {
    restoreFocusRef.current = null
    focusPanelRef.current = focusPanel
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closingCategoryRef.current = null
    setIsClosing(false)
    setActiveCategory(category)
    setTargetProjectId(projectId)
    setSheetState("partial")
    setSearchQuery("")
    setFilter(nextFilter)
    sheetScrollRef.current?.scrollTo({ top: 0 })
    setUrl(category, "partial")
    if (nextFilter === "Experiments") window.history.replaceState(null, "", `/?category=projects&view=partial&filter=Experiments`)
  }

  function changeSheet(next: SheetState) {
    if (!activeCategory) return
    setSheetState(next)
    setUrl(activeCategory, next, true)
    if (next === "partial")
      sheetScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragRef.current = {
      startY: event.clientY,
      startTime: event.timeStamp,
      pointerId: event.pointerId,
      startHeight: sheetRef.current?.getBoundingClientRect().height ?? 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      Math.abs(event.clientY - drag.startY) < 5
    )
      return
    const height = Math.max(
      180,
      Math.min(
        window.innerHeight,
        drag.startHeight - (event.clientY - drag.startY),
      ),
    )
    if (sheetRef.current) {
      sheetRef.current.dataset.dragging = "true"
      sheetRef.current.style.setProperty("--sheet-drag-height", `${height}px`)
    }
  }

  function resetDrag() {
    dragRef.current = null
    if (sheetRef.current) {
      delete sheetRef.current.dataset.dragging
      sheetRef.current.style.removeProperty("--sheet-drag-height")
    }
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    const distance = event.clientY - drag.startY
    const velocity = distance / Math.max(event.timeStamp - drag.startTime, 1)
    if (Math.abs(distance) > 8) {
      suppressHandleClickRef.current = true
      window.setTimeout(() => {
        suppressHandleClickRef.current = false
      }, 350)
    }
    if (distance < -65 || (velocity < -0.55 && distance < -25))
      changeSheet("expanded")
    else if (distance > 65 || (velocity > 0.55 && distance > 25)) {
      if (sheetState === "expanded") changeSheet("partial")
      else closeSheet()
    }
    requestAnimationFrame(() => {
      if (!dragRef.current) resetDrag()
    })
  }

  function onSheetWheel(event: WheelEvent<HTMLElement>) {
    if (sheetState === "partial" && event.deltaY > 12) {
      event.preventDefault()
      changeSheet("expanded")
    }
  }

  const selected = categories.find((category) => category.id === activeCategory)
  const displayedView = isClosing ? closingView : sheetState
  const filteredProjects = useMemo(() => projects.filter(
    (project) =>
      filter === "All" ||
      (filter === "Web" && /Web|Next/i.test(project.category)) ||
      (filter === "Java" && /Java/i.test(project.category)) ||
      (["React", "Next.js", "MongoDB"].includes(filter) && getProjectDetail(project).tags.includes(filter)),
  ), [projects, filter])
  const visibleProjects =
    useMemo(() => sort === "Oldest" ? [...filteredProjects].reverse() : filteredProjects, [sort, filteredProjects])

  return (
    <div
      className={`orb-experience orb-state-${sheetState} orb-mode-${activeCategory ?? "home"}`}
      data-category={activeCategory ?? undefined}
      data-closing={isClosing || undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && sheetState !== "closed") {
          event.preventDefault()
          closeSheet()
        }
      }}
    >
      <Link
        className="orb-wordmark"
        href="/"
        tabIndex={sheetState === "expanded" || editorial ? -1 : 0}
        aria-hidden={sheetState === "expanded" || editorial}
        inert={editorial}
        onClick={(event) => {
          if (sheetState !== "closed") {
            event.preventDefault()
            closeSheet()
          }
        }}
        aria-label="홈으로 돌아가기"
      >
        /J
      </Link>
      <div className="orb-identity">
        <p>Jang Jumin</p>
        <span>웹 개발 · 보안을 배우고 기록합니다.</span>
      </div>

      <div
        className="orb-scene"
        ref={sceneRef}
        inert={sheetState === "expanded" || editorial}
        aria-hidden={sheetState === "expanded" || editorial}
      >
        <div className="orb-ambient" aria-hidden="true" />
        <div className="orb-orbit orb-orbit-one" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="orb-orbit orb-orbit-two" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="orb-orbit orb-orbit-three" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="orb-sphere" aria-hidden="true">
          <FluidOrb active={editorial || sheetState !== "expanded"} interactive={!editorial} lighting={lighting} />
        </div>
        {categories.map((category) => (
          <button
            key={category.id}
            id={`category-${category.id}`}
            type="button"
            className={`orb-node orb-node-${category.id}`}
            aria-pressed={activeCategory === category.id}
            data-glowing={
              sheetState === "closed" && matchesCategory(searchQuery, category, projects)
                ? "true"
                : undefined
            }
            data-active={activeCategory === category.id ? "true" : undefined}
            data-interacting={
              hoveredCategory === category.id || focusedCategory === category.id
                ? "true"
                : undefined
            }
            style={{ "--node-color": category.color } as CSSProperties}
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch") setHoveredCategory(category.id)
            }}
            onPointerLeave={() =>
              setHoveredCategory((current) =>
                current === category.id ? null : current,
              )
            }
            onPointerCancel={() =>
              setHoveredCategory((current) =>
                current === category.id ? null : current,
              )
            }
            onFocus={(event) => {
              if (event.currentTarget.matches(":focus-visible"))
                setFocusedCategory(category.id)
            }}
            onBlur={() =>
              setFocusedCategory((current) =>
                current === category.id ? null : current,
              )
            }
            onPointerDown={() => setFocusedCategory(null)}
            onClick={(event) =>
              openCategory(category.id, null, event.detail === 0)
            }
          >
            <span className="orb-node-dot" />
            {category.label}
          </button>
        ))}
        <OrbSearch
          projects={projects}
          onOpenChange={setSearchResultsOpen}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSelect={(result) => {
            if (result.noteId) {
              try { sessionStorage.setItem("orb-explore-return", JSON.stringify({ category: "notes", url: "/?category=notes&view=expanded", scrollTop: 0 })) } catch {}
              router.push(`/notes/${result.noteId}`)
            } else openCategory(result.category, result.projectId ?? null, true, result.kind === "experiment" ? "Experiments" : "All")
          }}
        />
      </div>

      <section
        className="orb-sheet"
        ref={sheetRef}
        data-view={displayedView}
        aria-labelledby={activeCategory ? "orb-sheet-title" : undefined}
        aria-label={activeCategory ? undefined : "콘텐츠 패널"}
        aria-hidden={sheetState === "closed" || editorial}
        inert={sheetState === "closed" || editorial}
        onClickCapture={(event) => {
          const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href^="/projects/"],a[href^="/notes/"]')
          if (!anchor) return
          const firstVisible = sheetRef.current?.querySelector<HTMLAnchorElement>('.featured-track .project-card[aria-hidden="false"]')
          try { sessionStorage.setItem("orb-explore-return", JSON.stringify({ category: activeCategory, url: location.pathname + location.search, filter, sort, scrollTop: sheetScrollRef.current?.scrollTop ?? 0, projectId: Number(firstVisible?.pathname.split("/").pop()) || null })) } catch {}
        }}
        onWheel={onSheetWheel}
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === "transform"
          )
            finishClose()
        }}
      >
        <button
          type="button"
          className="orb-sheet-handle"
          aria-label={sheetState === "expanded" ? "패널 축소" : "패널 확장"}
          aria-expanded={sheetState === "expanded"}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={resetDrag}
          onClick={() => {
            if (suppressHandleClickRef.current) {
              suppressHandleClickRef.current = false
              return
            }
            changeSheet(sheetState === "expanded" ? "partial" : "expanded")
          }}
        >
          <span />
        </button>
        <div className="orb-sheet-scroll" ref={sheetScrollRef}>
          <div className="orb-sheet-inner">
            <header className="orb-sheet-heading">
              <div>
                <div className="orb-title-row">
                  <h1 id="orb-sheet-title" ref={headingRef} tabIndex={-1}>
                    {selected?.label}
                  </h1>
                  {(activeCategory === "projects" || activeCategory === "notes") && <span>
                    {activeCategory === "projects"
                      ? `${projects.length} Projects`
                      : activeCategory === "notes" ? "Notes archive" : ""}
                  </span>}
                </div>
                <p>{selected?.intro}</p>
              </div>
              <p>{selected?.summary}</p>
            </header>
            {activeCategory === "projects" && (
              <div
                className="orb-sheet-filters"
                aria-label="프로젝트 필터와 정렬"
              >
                <div>
                  {["All", "Web", "Java", "React", "Next.js", "MongoDB", "Experiments"].map((value) => (
                    <button
                      type="button"
                      key={value}
                      data-selected={filter === value}
                      onClick={() => {
                        setFilter(value)
                        const params = new URLSearchParams(location.search)
                        if (value === "Experiments") params.set("filter", value)
                        else params.delete("filter")
                        window.history.replaceState(null, "", `/?${params}`)
                      }}
                    >
                      {value === "All" ? `All (${projects.length})` : value}
                    </button>
                  ))}
                </div>
                <label>
                  정렬{" "}
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="Latest">최신순</option>
                    <option value="Oldest">오래된 순</option>
                  </select>
                </label>
              </div>
            )}
            {activeCategory && (
              <CategoryContent
                category={activeCategory}
                expanded={displayedView === "expanded"}
                projects={visibleProjects}
                targetProjectId={targetProjectId}
                experiments={filter === "Experiments"}
              />
            )}
          </div>
        </div>
        <div className="orb-sheet-actions" role="group" aria-label="패널 조작">
          <button
            className="orb-sheet-toggle"
            type="button"
            onClick={() =>
              changeSheet(sheetState === "expanded" ? "partial" : "expanded")
            }
            aria-label={sheetState === "expanded" ? "패널 축소" : "패널 확장"}
            title={sheetState === "expanded" ? "패널 축소" : "패널 확장"}
          >
            {sheetState === "expanded" ? "↙" : "↗"}
          </button>
          <button
            className="orb-sheet-close"
            type="button"
            onClick={() => closeSheet()}
            aria-label="패널 닫기"
            title="패널 닫기"
          >
            ×
          </button>
        </div>
      </section>
      {editorial && <OrbEditorialPanel category={activeCategory as "about" | "contact"} open={sheetState !== "closed"} onClose={() => closeSheet()} />}
    </div>
  )
}
