"use client"
import { useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
export function AdminLogin({ configured, returnTo }: { configured: boolean; returnTo: string }) {
  const router = useRouter()
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("")
  const submitting = useRef(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError("")
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000) })
      setCode("")
      const result = await response.json()
      if (!response.ok) { setError(result.error || "로그인하지 못했습니다."); return }
      router.replace(returnTo); router.refresh()
    } catch { setCode(""); setError("연결하지 못했습니다. 잠시 후 다시 시도해 주세요.") }
    finally { submitting.current = false; setBusy(false) }
  }
  return <section className="cms-login"><Link href="/">← 포트폴리오</Link><p className="cms-eyebrow">ADMIN WORKSPACE</p><h1>관리자 로그인</h1><p>관리자 코드를 입력해 콘텐츠를 관리합니다.</p>{!configured && <p className="cms-alert" role="status">서버의 ADMIN_CODE(12자 이상)와 ADMIN_SESSION_SECRET(32자 이상)을 설정해 주세요.</p>}<form onSubmit={submit}><label htmlFor="admin-code">관리자 코드</label><input id="admin-code" type="password" autoComplete="current-password" value={code} onChange={event => setCode(event.target.value)} required maxLength={256} disabled={!configured || busy} /><button disabled={!configured || busy || !code} type="submit">{busy ? "확인 중…" : "로그인"}</button><p role="alert">{error}</p></form></section>
}
