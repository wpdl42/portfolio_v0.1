"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { categories, searchKindLabels, searchPortfolio, type SearchItem } from "@/lib/orb-content"
import { useSearchResultSpace } from "@/hooks/useSearchResultSpace"
import type { Project } from "@/lib/portfolio"

export function OrbSearch({ query, onQueryChange, onSelect, onOpenChange, projects }: { query: string; onQueryChange: (value: string) => void; onSelect: (item: SearchItem) => void; onOpenChange: (open: boolean) => void; projects: Project[] }) {
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const results = useMemo(() => searchPortfolio(query, projects), [query, projects])
  const open = focused && !dismissed && !!query.trim()
  const selected = selectedIndex === null ? null : results[selectedIndex]
  useSearchResultSpace(wrapRef, resultsRef, open, query)
  useEffect(() => { onOpenChange(open); return () => onOpenChange(false) }, [open, onOpenChange])

  useEffect(() => {
    const list = resultsRef.current
    const option = selected ? document.getElementById(`result-${selected.id}`) : null
    if (!open || !list || !option) return
    const bounds = list.getBoundingClientRect()
    const rect = option.getBoundingClientRect()
    const scale = bounds.height / list.offsetHeight || 1
    if (rect.top < bounds.top) list.scrollTop -= (bounds.top - rect.top) / scale + 6
    else if (rect.bottom > bounds.bottom) list.scrollTop += (rect.bottom - bounds.bottom) / scale + 6
  }, [open, selected])

  function openSelected() {
    if (composingRef.current) return
    const item = selected ?? results[0]
    if (item) onSelect(item)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || composingRef.current || event.keyCode === 229) {
      if (event.key === "Enter") event.preventDefault()
      return
    }
    if (event.key === "Escape") { event.preventDefault(); setDismissed(true); setSelectedIndex(null); return }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    setDismissed(false)
    if (!results.length) return
    setSelectedIndex((current) => current === null ? event.key === "ArrowDown" ? 0 : results.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length)
  }

  return <div ref={wrapRef} className="orb-search-wrap" data-open={open || undefined} data-focused={focused || undefined} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <form className="orb-search" role="search" onSubmit={(event) => { event.preventDefault(); openSelected() }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2" /><path d="m16.2 16.2 5 5" /></svg>
      <input ref={inputRef} role="combobox" aria-label="포트폴리오 검색" aria-autocomplete="list" aria-expanded={open} aria-controls="orb-search-listbox" aria-activedescendant={open && selected ? `result-${selected.id}` : undefined} placeholder="Find something..." value={query} onFocus={() => { setFocused(true); setDismissed(false) }} onChange={(event) => { onQueryChange(event.target.value); setSelectedIndex(null); setDismissed(false) }} onKeyDown={handleKeyDown} onCompositionStart={() => { composingRef.current = true }} onCompositionEnd={() => { composingRef.current = false }} autoComplete="off" />
      {query && <button className="orb-search-clear" type="button" aria-label="검색어 지우기" onClick={() => { onQueryChange(""); setSelectedIndex(null); inputRef.current?.focus() }}>×</button>}
      <button type="submit" aria-label="선택한 검색 결과 열기" disabled={!results.length}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg></button>
    </form>
    {open && <div className="orb-search-results" ref={resultsRef}>
      <div id="orb-search-listbox" role="listbox" aria-label="검색 결과">
        {results.map((result, index) => <button id={`result-${result.id}`} type="button" role="option" tabIndex={-1} aria-selected={selectedIndex === index} key={result.id} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setSelectedIndex(index)} onClick={() => onSelect(result)}>
          <span className="orb-result-dot" style={{ background: categories.find((category) => category.id === result.category)?.color }} />
          <span className="orb-result-copy"><span>{result.label}</span><small>{searchKindLabels[result.kind]} · {categories.find((category) => category.id === result.category)?.label}</small></span>
          <span aria-hidden="true">↗</span>
        </button>)}
      </div>
      {!results.length && <p role="status">관련 페이지가 없습니다. 다른 검색어를 입력해 보세요.</p>}
    </div>}
    <span className="visually-hidden" role="status" aria-live="polite">{open ? `검색 결과 ${results.length}개` : ""}</span>
  </div>
}
