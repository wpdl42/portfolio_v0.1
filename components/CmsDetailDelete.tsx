"use client"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CmsConfirmDialog } from "./CmsConfirmDialog"

export function CmsDetailDelete({ kind, itemKey, version, title }: { kind: "projects" | "notes"; itemKey: string; version: number; title: string }) {
  const router = useRouter(), submitting = useRef(false)
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("")
  async function remove() {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError("")
    try {
      const response = await fetch(`/api/admin/content/${kind}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: itemKey, version }), signal: AbortSignal.timeout(15000) })
      const result = await response.json()
      if (!response.ok) { setError(result.error || "삭제하지 못했습니다."); return }
      router.replace(`/?category=${kind}&view=expanded`); router.refresh()
    } catch { setError("삭제를 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.") }
    finally { submitting.current = false; setBusy(false) }
  }
  return <div className="cms-detail-tools"><button className="cms-danger" type="button" disabled={busy} onClick={() => setOpen(true)}>이 항목 삭제</button>{open && <CmsConfirmDialog title={`“${title}” 삭제`} description="공개 목록·상세·검색에서 제외하고 휴지통에 보관합니다. 삭제 후 해당 카테고리 목록으로 이동합니다." action="삭제" busy={busy} error={error} onCancel={() => setOpen(false)} onConfirm={remove} />}</div>
}
