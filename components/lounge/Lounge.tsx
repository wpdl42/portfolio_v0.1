"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import type { GuestbookViewer } from "@/lib/guestbook"
import { messageError } from "@/lib/guestbook"
import { loungeTitleError, type LoungeDetail, type LoungePage, type LoungeScope, type LoungeThread } from "@/lib/lounge/types"
import { LoungeAuth } from "./LoungeAuth"
import { LoungeCompose, type LoungeDraft } from "./LoungeCompose"
import { LoungeConversation, loungeListDate as loungeDate } from "./LoungeConversation"
import { loungeError, loungeRequest, LoungeRequestError } from "./api"
import { useLoungeNavigationGuard } from "@/hooks/useLoungeNavigationGuard"

export function Lounge() {
  const root = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<GuestbookViewer | null>(null), [sessionLoading, setSessionLoading] = useState(true)
  const [screen, setScreen] = useState<"list" | "new" | "detail">("list"), [threadId, setThreadId] = useState<string | null>(null)
  const [scope, setScope] = useState<LoungeScope>("public"), [authFor, setAuthFor] = useState<"new" | "mine" | "reply" | null>(null)
  const [page, setPage] = useState<LoungePage>({ threads: [], nextCursor: null }), [detail, setDetail] = useState<LoungeDetail | null>(null)
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("")
  const [detailMissing, setDetailMissing] = useState(false)
  const [draft, setDraft] = useState<LoungeDraft>({ title: "", body: "", isSecret: false })
  const [conversationState, setConversationState] = useState({ dirty: false, busy: false })
  const dirty = screen === "new" && !!(draft.title || draft.body || draft.isSecret) || screen === "detail" && conversationState.dirty
  const { confirmNavigation, rememberUrl } = useLoungeNavigationGuard(dirty, busy || conversationState.busy, setStatus)
  const submitting = useRef(false), draftRequest = useRef<{ payload: string; id: string } | null>(null)
  const listPosition = useRef({ top: 0, id: "" }), restoreList = useRef(false)
  const listCount = useRef(0)
  const scrollArea = () => root.current?.closest<HTMLElement>(".orb-editorial-content")

  useEffect(() => {
    const controller = new AbortController()
    const syncRoute = (restore = false) => {
      if (new URLSearchParams(location.search).get("category") !== "contact") return
      const params = new URLSearchParams(location.search)
      const id = params.get("thread")
      setThreadId(id); setScreen(id ? "detail" : "list"); setLoading(true); setError(""); setAuthFor(null)
      if (!id && restore) restoreList.current = true
    }
    const onPopState = () => syncRoute(true)
    window.addEventListener("popstate", onPopState)
    loungeRequest<{ viewer: GuestbookViewer | null }>("/session", { signal: controller.signal }).then(result => { setViewer(result.viewer); if (result.viewer?.isOwner && new URLSearchParams(location.search).get("scope") === "all") setScope("all") }).catch(error => { if (!controller.signal.aborted) setError(loungeError(error)) }).finally(() => { if (!controller.signal.aborted) { setSessionLoading(false); syncRoute() } })
    const viewport = window.visualViewport
    const frame = root.current?.closest<HTMLElement>(".orb-editorial")
    const resize = () => { frame?.style.setProperty("--lounge-height", `${viewport?.height ?? innerHeight}px`); frame?.style.setProperty("--lounge-top", `${viewport?.offsetTop ?? 0}px`) }
    resize(); viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize)
    return () => { controller.abort(); window.removeEventListener("popstate", onPopState); viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize); frame?.style.removeProperty("--lounge-height"); frame?.style.removeProperty("--lounge-top") }
  }, [])

  useEffect(() => {
    if (sessionLoading || screen !== "list") return
    const controller = new AbortController()
    const params = new URLSearchParams({ scope, ...(query ? { q: query } : {}) })
    const expected = restoreList.current ? listCount.current : 0
    const load = async () => {
      let result = await loungeRequest<LoungePage>(`?${params}`, { signal: controller.signal })
      while (result.nextCursor && result.threads.length < expected) {
        params.set("before", result.nextCursor)
        const next = await loungeRequest<LoungePage>(`?${params}`, { signal: controller.signal })
        result = { threads: [...result.threads, ...next.threads], nextCursor: next.nextCursor }
      }
      return result
    }
    load().then(result => {
      setPage(result)
      listCount.current = result.threads.length
      if (restoreList.current) requestAnimationFrame(() => {
        restoreList.current = false
        const scroller = scrollArea(); if (scroller) scroller.scrollTop = listPosition.current.top
        const focus = root.current?.querySelector<HTMLElement>(`[data-thread-id="${listPosition.current.id}"]`) ?? root.current?.querySelector<HTMLElement>(".lounge-new")
        focus?.focus({ preventScroll: true })
      })
    }).catch(error => { if (!controller.signal.aborted) { setPage({ threads: [], nextCursor: null }); if (error instanceof LoungeRequestError && error.status === 401) { setViewer(null); setAuthFor("mine") } setError(loungeError(error)) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [screen, scope, query, revision, sessionLoading])

  useEffect(() => {
    if (sessionLoading || screen !== "detail" || !threadId) return
    const controller = new AbortController()
    loungeRequest<LoungeDetail>(`/${encodeURIComponent(threadId)}`, { signal: controller.signal }).then(result => {
      setDetail(result)
      setDetailMissing(false)
      requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("#lounge-detail-title")?.focus({ preventScroll: true }))
    }).catch(error => { if (!controller.signal.aborted) { setDetail(null); setDetailMissing(error instanceof LoungeRequestError && error.status === 404); setError(loungeError(error)) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [screen, threadId, sessionLoading, revision])

  function url(id: string | null) {
    const params = new URLSearchParams(location.search)
    params.set("category", "contact"); params.set("view", "partial")
    if (id) params.set("thread", id); else params.delete("thread")
    window.history.pushState(null, "", `/?${params}`)
    rememberUrl()
  }
  function openThread(id: string, created = false) {
    listPosition.current = { top: created ? 0 : scrollArea()?.scrollTop ?? 0, id }
    setThreadId(id); setDetail(null); setScreen("detail"); setLoading(true); setError(""); setAuthFor(null); url(id)
    scrollArea()?.scrollTo({ top: 0 })
  }
  function back(force = false) {
    if (!force && !confirmNavigation()) return
    if (threadId && listPosition.current.id !== threadId) listPosition.current = { top: 0, id: threadId }
    url(null); setScreen("list"); setThreadId(null); setLoading(true); setAuthFor(null); setError(""); restoreList.current = true
  }
  function chooseScope(next: LoungeScope) {
    if (next !== "public" && !viewer) { setAuthFor("mine"); return }
    listCount.current = 0; restoreList.current = false
    setScope(next); setLoading(true); setRevision(value => value + 1); setError(""); setAuthFor(null)
  }
  function startNew() {
    listPosition.current = { top: scrollArea()?.scrollTop ?? 0, id: "" }
    setScreen("new"); setError(""); setAuthFor(viewer ? null : "new")
    scrollArea()?.scrollTo({ top: 0 })
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(viewer ? "#lounge-title" : "input[name=nickname]")?.focus({ preventScroll: true }))
  }
  function authenticated(identity: GuestbookViewer) {
    setViewer(identity); setError(""); setStatus("로그인했습니다.")
    if (authFor === "mine") { setScope("mine"); setScreen("list"); setLoading(true); setRevision(value => value + 1) }
    else if (authFor === "reply") { if (!detail) setLoading(true); setRevision(value => value + 1) }
    if (authFor === "new") scrollArea()?.scrollTo({ top: 0 })
    setAuthFor(null)
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(screen === "new" ? "#lounge-title" : "#lounge-reply")?.focus({ preventScroll: true }))
  }
  async function action(work: () => Promise<void>) {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError(""); setStatus("")
    try { await work() } catch (error) {
      if (error instanceof LoungeRequestError && error.status === 401) { setViewer(null); setPage({ threads: [], nextCursor: null }); setAuthFor(screen === "new" ? "new" : "mine") }
      setError(loungeError(error))
    } finally { submitting.current = false; setBusy(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    const invalid = loungeTitleError(draft.title) || messageError(draft.body)
    if (invalid) { setError(invalid); return }
    if (!viewer) { setAuthFor("new"); return }
    const payload = JSON.stringify(draft)
    if (!draftRequest.current || draftRequest.current.payload !== payload) draftRequest.current = { payload, id: crypto.randomUUID() }
    await action(async () => {
      const result = await loungeRequest<LoungeDetail>("", { method: "POST", body: JSON.stringify({ ...draft, requestId: draftRequest.current!.id }) })
      if (result.thread.isSecret && scope === "public") setScope("mine")
      setDraft({ title: "", body: "", isSecret: false }); draftRequest.current = null; setStatus("새 이야기를 등록했습니다."); openThread(result.thread.id, true)
    })
  }
  async function logout() {
    if (!confirmNavigation()) return
    await action(async () => {
      await loungeRequest("/session", { method: "DELETE" })
      setViewer(null); setDetail(null); setPage({ threads: [], nextCursor: null }); setScope("public"); setScreen("list"); setLoading(true); setThreadId(null); url(null); setRevision(value => value + 1)
    })
  }
  async function restore(thread: LoungeThread) {
    await action(async () => { await loungeRequest(`/${thread.id}`, { method: "PATCH", body: JSON.stringify({ action: "restore", version: thread.version }) }); setStatus("이야기를 복원했습니다."); setRevision(value => value + 1) })
  }
  async function more() {
    if (!page.nextCursor) return
    await action(async () => {
      const result = await loungeRequest<LoungePage>(`?${new URLSearchParams({ scope, before: page.nextCursor!, ...(query ? { q: query } : {}) })}`)
      const threads = [...page.threads, ...result.threads.filter(item => !page.threads.some(old => old.id === item.id))]
      listCount.current = threads.length
      setPage({ threads, nextCursor: result.nextCursor })
    })
  }

  return <div className="orb-guestbook lounge" data-screen={screen} ref={root}>
    <header className="lounge-heading"><p className="orb-editorial-eyebrow">LOUNGE</p><h1 id="orb-editorial-title" tabIndex={-1}>{screen === "new" ? "새 이야기를 남겨주세요." : "이야기를 남겨주세요."}</h1>{screen === "list" && <p className="guestbook-intro">질문이나 짧은 인사도 좋아요.</p>}</header>
    {viewer && <div className="guestbook-identity"><p><strong>{viewer.nickname}</strong>{viewer.isOwner && <span className="guestbook-owner">관리자</span>}<span>로 참여 중</span></p>{!viewer.isOwner && <button type="button" disabled={busy} onClick={logout}>로그아웃</button>}</div>}
    {authFor && <LoungeAuth onSuccess={authenticated} onCancel={() => { setAuthFor(null); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(screen === "new" ? "#lounge-title" : ".lounge-new")?.focus()) }} />}
    {error && <p className="guestbook-error" role="alert">{error}</p>}<p className="guestbook-status" role="status" aria-live="polite">{status}</p>
    <div className="lounge-view" key={screen}>
    {screen === "new" ? <LoungeCompose draft={draft} onChange={setDraft} onSubmit={submit} onCancel={() => { if (!confirmNavigation()) return; setDraft({ title: "", body: "", isSecret: false }); draftRequest.current = null; back(true) }} busy={busy} authenticated={!!viewer} /> : screen === "detail" ? <>
      {loading || sessionLoading ? <p role="status">대화를 불러오는 중입니다.</p> : detail ? <LoungeConversation key={detail.thread.id} detail={detail} authenticated={!!viewer} onLogin={() => setAuthFor("reply")} onBack={() => back()} onChange={setDetail} onDraftState={setConversationState} onDeleted={() => { setStatus("휴지통으로 이동했습니다."); back(true) }} /> : <div className="lounge-not-found"><h2>{detailMissing ? "이야기를 찾을 수 없습니다." : "대화를 불러오지 못했습니다."}</h2><p>{detailMissing ? "삭제되었거나 읽을 권한이 없는 이야기입니다." : "연결 상태를 확인하고 다시 시도해 주세요."}</p><button type="button" onClick={() => back()}>목록으로</button><button type="button" onClick={() => { setLoading(true); setRevision(value => value + 1) }}>다시 불러오기</button>{!viewer && <button type="button" onClick={() => setAuthFor("reply")}>작성자 로그인</button>}</div>}
    </> : <section className="lounge-list" aria-label="이야기 목록">
      <div className="lounge-list-toolbar"><button type="button" className="lounge-new" onClick={startNew} disabled={busy || sessionLoading}>+ 새 이야기</button><div role="group" aria-label="이야기 범위">{(["public", "mine", ...(viewer?.isOwner ? ["all"] : []), ...(viewer ? ["trash"] : [])] as LoungeScope[]).map(item => <button type="button" key={item} aria-pressed={scope === item} onClick={() => chooseScope(item)} disabled={busy}>{({ public: "공개글", mine: "내 글", all: "전체 글", trash: "휴지통" })[item]}</button>)}</div></div>
      <details className="lounge-search-disclosure"><summary>제목 검색</summary><form className="lounge-search" role="search" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setLoading(true); setRevision(value => value + 1) }}><label htmlFor="lounge-search">제목 검색</label><input id="lounge-search" type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={80} /><button type="submit" disabled={busy}>검색</button><button type="button" disabled={busy} onClick={() => { setLoading(true); setRevision(value => value + 1) }}>새로고침</button></form></details>
      {loading || sessionLoading ? <p role="status">이야기를 불러오는 중입니다.</p> : <><ol>{page.threads.map(thread => <li key={thread.id}>{scope === "trash" ? <div className="lounge-trash-row"><span>{thread.isSecret && "🔒 "}{thread.title}</span><button type="button" disabled={busy} onClick={() => restore(thread)}>복원</button></div> : <button type="button" className="lounge-thread" data-thread-id={thread.id} onClick={() => openThread(thread.id)}><span className="lounge-thread-title">{thread.isSecret && <span aria-label="비밀글">🔒 </span>}{thread.title}</span><span className="lounge-thread-meta"><span>{thread.nickname}</span><time dateTime={thread.createdAt}>{loungeDate(thread.createdAt)}</time></span><span className="lounge-row-badges">{thread.isSecret && <span className="lounge-secret-badge">비밀글</span>}<span className="lounge-answer-badge" data-answered={thread.status === "answered"}>{thread.status === "answered" ? "답변 완료" : "답변 대기"}</span></span></button>}</li>)}</ol>{!page.threads.length && !error && <p>아직 이야기가 없습니다. 새 이야기를 남겨보세요.</p>}{page.nextCursor && <button type="button" className="guestbook-more" disabled={busy} onClick={more}>이야기 더 보기</button>}<p className="lounge-list-note">ⓘ 비밀글은 작성자와 관리자만 확인할 수 있어요.</p></>}
    </section>}
    </div>
  </div>
}
