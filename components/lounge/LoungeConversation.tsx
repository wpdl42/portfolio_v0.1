"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { CmsConfirmDialog } from "@/components/CmsConfirmDialog"
import { messageError } from "@/lib/guestbook"
import { loungeTitleError, type LoungeDetail, type LoungeMessage } from "@/lib/lounge/types"
import { loungeError, loungeRequest, LoungeRequestError } from "./api"

const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })
const dateOnly = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" })
export const loungeDate = (value: string) => dateTime.format(new Date(value))
export const loungeListDate = (value: string) => dateOnly.format(new Date(value))
export function LoungeConversation({ detail, authenticated, onLogin, onBack, onChange, onDeleted, onDraftState }: { detail: LoungeDetail; authenticated: boolean; onLogin: () => void; onBack: () => void; onChange: (detail: LoungeDetail) => void; onDeleted: () => void; onDraftState: (state: { dirty: boolean; busy: boolean }) => void }) {
  const { thread, messages } = detail
  const [body, setBody] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const [editing, setEditing] = useState<LoungeMessage | "title" | null>(null), [text, setText] = useState("")
  const [deleting, setDeleting] = useState<LoungeMessage | "thread" | null>(null), [trash, setTrash] = useState(false)
  const [deletedMessages, setDeletedMessages] = useState<LoungeMessage[]>([])
  const [trashCursor, setTrashCursor] = useState<string | null>(null)
  const submitting = useRef(false), requestRef = useRef<{ body: string; id: string } | null>(null)
  const dirty = !!body || !!editing && text !== (editing === "title" ? thread.title : editing.body)
  useEffect(() => { onDraftState({ dirty, busy }) }, [dirty, busy, onDraftState])
  useEffect(() => () => onDraftState({ dirty: false, busy: false }), [onDraftState])
  async function action(work: () => Promise<void>) {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError("")
    try { await work() } catch (error) { if (error instanceof LoungeRequestError && error.status === 401) onLogin(); setError(loungeError(error)) }
    finally { submitting.current = false; setBusy(false) }
  }
  const refresh = async () => onChange(await loungeRequest<LoungeDetail>(`/${thread.id}`))
  async function reply(event: FormEvent) {
    event.preventDefault()
    const invalid = messageError(body)
    if (invalid) { setError(invalid); return }
    if (!requestRef.current || requestRef.current.body !== body) requestRef.current = { body, id: crypto.randomUUID() }
    await action(async () => {
      onChange(await loungeRequest<LoungeDetail>(`/${thread.id}/messages`, { method: "POST", body: JSON.stringify({ body, requestId: requestRef.current!.id }) }))
      setBody(""); requestRef.current = null
    })
  }
  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    const invalid = editing === "title" ? loungeTitleError(text) : messageError(text)
    if (invalid) { setError(invalid); return }
    await action(async () => {
      await loungeRequest(editing === "title" ? `/${thread.id}` : `/${thread.id}/messages/${editing.id}`, { method: "PATCH", body: JSON.stringify(editing === "title" ? { title: text, version: thread.version } : { body: text, version: editing.version }) })
      await refresh(); setEditing(null)
    })
  }
  async function remove() {
    if (!deleting) return
    await action(async () => {
      await loungeRequest(deleting === "thread" ? `/${thread.id}` : `/${thread.id}/messages/${deleting.id}`, { method: "DELETE", body: JSON.stringify({ version: deleting === "thread" ? thread.version : deleting.version }) })
      if (deleting === "thread") onDeleted()
      else await refresh()
      setDeleting(null)
    })
  }
  async function loadTrash(more = false) {
    await action(async () => {
      const page = await loungeRequest<LoungeDetail>(`/${thread.id}?messages=trash${more && trashCursor ? `&before=${trashCursor}` : ""}`)
      setDeletedMessages(current => more ? [...page.messages, ...current] : page.messages); setTrashCursor(page.previousCursor); setTrash(true)
    })
  }
  async function restore(message: LoungeMessage) {
    await action(async () => {
      await loungeRequest(`/${thread.id}/messages/${message.id}`, { method: "PATCH", body: JSON.stringify({ action: "restore", version: message.version }) })
      setDeletedMessages(current => current.filter(item => item.id !== message.id)); await refresh()
    })
  }
  async function earlier() {
    if (!detail.previousCursor) return
    const scroller = document.querySelector<HTMLElement>(".orb-editorial-contact .orb-editorial-content")
    const top = scroller?.scrollTop ?? 0, height = scroller?.scrollHeight ?? 0
    await action(async () => {
      const page = await loungeRequest<LoungeDetail>(`/${thread.id}?before=${detail.previousCursor}`)
      onChange({ ...page, messages: [...page.messages, ...messages] })
      requestAnimationFrame(() => { if (scroller) scroller.scrollTop = top + scroller.scrollHeight - height })
    })
  }
  return <section className="lounge-conversation" aria-label="이야기 대화">
    <button type="button" className="lounge-back" onClick={onBack}>← 목록으로</button>
    <header><h2 tabIndex={-1} id="lounge-detail-title">{thread.isSecret && <span aria-label="비밀글">🔒 </span>}{thread.title}</h2><p>{thread.nickname} · {loungeDate(thread.createdAt)} · {thread.isSecret ? "비밀글" : "공개글"} · {thread.status === "answered" ? "답변 완료" : "답변 대기"}</p>
      <div className="lounge-actions"><button type="button" onClick={() => action(refresh)} disabled={busy}>대화 새로고침</button>{thread.canManage && <><button type="button" onClick={() => { setEditing("title"); setText(thread.title) }} disabled={busy}>제목 수정</button><button type="button" className="lounge-danger" onClick={() => setDeleting("thread")} disabled={busy}>이야기 삭제</button><button type="button" onClick={() => loadTrash()} disabled={busy}>삭제한 메시지</button></>}</div>
    </header>
    {editing && <form className="lounge-edit" onSubmit={saveEdit}><label>{editing === "title" ? "제목 수정" : "메시지 수정"}<textarea value={text} onChange={event => setText(event.target.value)} maxLength={editing === "title" ? 80 : 5000} required disabled={busy} autoFocus /></label><div className="lounge-actions"><button type="submit" disabled={busy}>저장</button><button type="button" onClick={() => setEditing(null)} disabled={busy}>취소</button></div></form>}
    {error && <p className="guestbook-error" role="alert">{error}</p>}
    {detail.previousCursor && <button type="button" onClick={earlier} disabled={busy}>이전 대화 더 보기</button>}
    <ol className="lounge-messages">{messages.map(message => <li key={message.id} data-message-id={message.id} data-owner={message.isOwner}>
      <span className="lounge-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></svg></span>
      <div className="lounge-message-meta"><strong>{message.nickname}</strong>{message.isOwner && <span className="guestbook-owner">관리자</span>}</div>
      <p>{message.body}</p>
      <time className="lounge-message-time" dateTime={message.createdAt}>{loungeDate(message.createdAt)}</time>
      {message.canManage && <div className="lounge-message-tools"><button type="button" disabled={busy} onClick={() => { setEditing(message); setText(message.body) }}>수정</button><button type="button" disabled={busy} className="lounge-danger" onClick={() => setDeleting(message)}>삭제</button></div>}
    </li>)}</ol>
    {!messages.length && <p>표시할 메시지가 없습니다.</p>}
    {trash && <section className="lounge-message-trash"><h3>삭제한 메시지</h3><button type="button" onClick={() => setTrash(false)}>접기</button>{!deletedMessages.length && <p>삭제한 메시지가 없습니다.</p>}{trashCursor && <button type="button" disabled={busy} onClick={() => loadTrash(true)}>이전 삭제 메시지 더 보기</button>}{deletedMessages.map(message => <article key={message.id}><strong>{message.nickname}</strong><p>{message.body}</p><button type="button" disabled={busy} onClick={() => restore(message)}>복원</button></article>)}</section>}
    {thread.canReply ? <form className="lounge-reply" onSubmit={reply} aria-label="답글 작성"><label className="lounge-visually-hidden" htmlFor="lounge-reply">대화 이어가기</label><textarea id="lounge-reply" rows={2} maxLength={5000} placeholder="답글을 입력하세요." required value={body} onChange={event => setBody(event.target.value)} disabled={busy} /><div><span className="lounge-reply-count">{body.length.toLocaleString()} / 5,000</span><button type="submit" disabled={busy || !body.trim()}>{busy ? "처리 중…" : "전송"}</button></div></form> : <p className="lounge-readonly">작성자와 관리자만 답글을 남길 수 있어요.{!authenticated && <span> 로그인은 ‘새 이야기’에서 할 수 있어요.</span>}</p>}
    {deleting && <div onKeyDownCapture={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) setDeleting(null) } }}><CmsConfirmDialog title={deleting === "thread" ? thread.title : "메시지 삭제"} description="휴지통으로 이동합니다. 복원할 수 있으며, 이야기를 삭제하면 모든 대화가 목록에서 숨겨집니다." action="삭제" busy={busy} error={error} onCancel={() => setDeleting(null)} onConfirm={remove} /></div>}
  </section>
}
