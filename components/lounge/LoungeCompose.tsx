"use client"
import type { FormEvent } from "react"
export type LoungeDraft = { title: string; body: string; isSecret: boolean }
export function LoungeCompose({ draft, onChange, onSubmit, onCancel, busy, authenticated }: { draft: LoungeDraft; onChange: (draft: LoungeDraft) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void; busy: boolean; authenticated: boolean }) {
  return <form className="lounge-compose" onSubmit={onSubmit} aria-label="새 이야기 작성">
    <label htmlFor="lounge-title">제목 <span>{draft.title.length} / 80</span></label>
    <input id="lounge-title" required maxLength={80} value={draft.title} onChange={event => onChange({ ...draft, title: event.target.value })} disabled={busy} />
    <label htmlFor="lounge-body">내용 <span>{draft.body.length.toLocaleString()} / 5,000</span></label>
    <textarea id="lounge-body" required maxLength={5000} rows={8} placeholder="편하게 이야기를 남겨주세요." value={draft.body} onChange={event => onChange({ ...draft, body: event.target.value })} disabled={busy} />
    <label className="lounge-secret"><input type="checkbox" checked={draft.isSecret} onChange={event => onChange({ ...draft, isSecret: event.target.checked })} disabled={busy} /><span className="lounge-secret-label">🔒 비밀글로 작성</span><span className="lounge-secret-help">작성자 본인과 관리자만 읽을 수 있어요.</span></label>
    <div className="lounge-actions"><button type="button" onClick={onCancel} disabled={busy}>취소</button><button type="submit" disabled={busy}>{busy ? "등록 중…" : authenticated ? "등록" : "로그인하고 등록"}</button></div>
  </form>
}
