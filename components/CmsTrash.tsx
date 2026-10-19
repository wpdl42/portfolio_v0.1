"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { cmsLabels } from "@/lib/cms/schema"
import type { CmsTrashItem } from "@/lib/cms/types"
import { CmsConfirmDialog } from "./CmsConfirmDialog"

export function CmsTrash({ initialItems }: { initialItems: CmsTrashItem[] }) {
  const router = useRouter(), submitting = useRef(false)
  const [items, setItems] = useState(initialItems), [target, setTarget] = useState<CmsTrashItem | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("")
  const title = (item: CmsTrashItem) => String(item.data.title ?? item.data.name ?? item.data.label ?? item.key)
  async function restore() {
    if (!target || submitting.current) return
    submitting.current = true; setBusy(true); setError("")
    try {
      const response = await fetch(`/api/admin/content/${target.kind}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: target.key, version: target.version }), signal: AbortSignal.timeout(15000) })
      const result = await response.json()
      if (!response.ok) { setError(result.error || "복원하지 못했습니다."); return }
      setItems(current => current.filter(item => !(item.kind === target.kind && item.key === target.key))); setMessage(`${title(target)} 항목을 복원했습니다. 이전 공개 상태와 연결이 유지됩니다.`); setTarget(null); router.refresh()
    } catch { setError("복원을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.") }
    finally { submitting.current = false; setBusy(false) }
  }
  async function reload() {
    if (submitting.current) return
    submitting.current = true; setBusy(true)
    try { const response = await fetch("/api/admin/trash", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(); setItems(result.items); setMessage("최신 휴지통을 불러왔습니다.") }
    catch { setMessage("목록을 불러오지 못했습니다. 세션과 연결을 확인해 주세요.") }
    finally { submitting.current = false; setBusy(false) }
  }
  return <div className="cms-admin cms-trash"><header className="cms-admin-header"><div><p className="cms-eyebrow">RECOVERABLE CONTENT</p><h1>휴지통</h1></div><div><Link href="/admin/projects">콘텐츠 관리</Link><button type="button" disabled={busy} onClick={reload}>새로 불러오기</button></div></header>
    <p>원본 내용과 연결은 보존됩니다. 복원하면 삭제 전 공개 여부와 표시 순서로 돌아갑니다. 영구 삭제는 제공하지 않습니다.</p>
    <p role="status">{message}</p>
    {!items.length && <p className="cms-empty">휴지통이 비어 있습니다.</p>}
    <ul className="cms-trash-list">{items.map(item => <li key={`${item.kind}:${item.key}`}><div><small>{cmsLabels[item.kind]} · {item.deletedAt && new Date(item.deletedAt).toLocaleString("ko-KR")}</small><h2>{title(item)}</h2><p>{item.data.visibility === "private" ? "복원 후에도 비공개" : "복원 시 공개"}</p></div><button type="button" disabled={busy} onClick={() => { setError(""); setTarget(item) }}>복원</button></li>)}</ul>
    {target && <CmsConfirmDialog title={`“${title(target)}” 복원`} description="삭제 전 내용, 주소, 공개 여부와 관련 연결을 유지하며 목록에 복원합니다." action="복원" busy={busy} error={error} onCancel={() => setTarget(null)} onConfirm={restore} />}
  </div>
}
