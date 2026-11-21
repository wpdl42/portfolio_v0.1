"use client"
import { useRef, useState, type FormEvent } from "react"
import { credentialError, type GuestbookViewer } from "@/lib/guestbook"
import { loungeError, loungeRequest } from "./api"

export function LoungeAuth({ onSuccess, onCancel }: { onSuccess: (viewer: GuestbookViewer) => void; onCancel: () => void }) {
  const [nickname, setNickname] = useState(""), [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false), [error, setError] = useState("")
  const submitting = useRef(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const invalid = credentialError(nickname, password)
    if (invalid) { setError(invalid); return }
    submitting.current = true; setBusy(true); setError("")
    try {
      const result = await loungeRequest<{ viewer: GuestbookViewer }>("/session", { method: "POST", body: JSON.stringify({ nickname, password }) })
      setPassword(""); onSuccess(result.viewer)
    } catch (error) { setError(loungeError(error)) }
    finally { submitting.current = false; setBusy(false) }
  }
  return <form className="lounge-auth" onSubmit={submit} aria-label="Lounge 로그인 및 가입">
    <h2>닉네임으로 이어가기</h2><p>처음 쓰는 닉네임은 가입하고, 등록된 닉네임은 같은 비밀번호로 로그인합니다. 작성 중인 내용은 유지됩니다.</p>
    <div className="guestbook-credentials"><label>닉네임<input name="nickname" autoComplete="username" required minLength={2} maxLength={20} value={nickname} onChange={event => setNickname(event.target.value)} disabled={busy} autoFocus /></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} placeholder="8자 이상" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label></div>
    {error && <p role="alert" className="guestbook-error">{error}</p>}
    <div className="lounge-actions"><button type="submit" disabled={busy}>{busy ? "확인 중…" : "로그인 / 가입"}</button><button type="button" disabled={busy} onClick={onCancel}>취소</button></div>
  </form>
}
