"use client"
import { useEffect, useId, useRef } from "react"

export function CmsConfirmDialog({ title, description, action, busy, error, onCancel, onConfirm }: { title: string; description: string; action: string; busy: boolean; error?: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId()
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog className="cms-confirm" ref={ref} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`}>{description}</p>
    {error && <p className="cms-field-error" role="alert">{error}</p>}
    <div><button type="button" disabled={busy} onClick={onCancel} autoFocus>취소</button><button type="button" className={action === "삭제" ? "cms-danger" : "cms-primary"} disabled={busy} onClick={onConfirm}>{busy ? "처리 중…" : action}</button></div>
  </dialog>
}
