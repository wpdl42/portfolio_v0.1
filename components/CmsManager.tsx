"use client"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react"
import { cmsFields, cmsKinds, cmsLabels, parseCmsValues, safeContentUrl, toFormValues, type CmsKind } from "@/lib/cms/schema"
import type { CmsItem } from "@/lib/cms/types"
import { useUnsavedNavigation } from "@/hooks/useUnsavedNavigation"

function ImagePreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? <p className="cms-field-error">이미지를 불러오지 못했습니다. URL을 확인해 주세요.</p> : <Image src={src} alt="프로젝트 썸네일 미리보기" width={720} height={360} unoptimized onError={() => setFailed(true)} className="cms-thumbnail" />
}
export function CmsManager({ kind, initialItems, expiresAt }: { kind: CmsKind; initialItems: CmsItem[]; expiresAt: string }) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [selected, setSelected] = useState<CmsItem | null>(initialItems[0] ?? null)
  const [values, setValues] = useState(() => toFormValues(kind, initialItems[0]?.data))
  const [baseline, setBaseline] = useState(() => JSON.stringify(values))
  const [errors, setErrors] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [message, setMessage] = useState("")
  const [expired, setExpired] = useState(false), [conflict, setConflict] = useState(false)
  const submitting = useRef(false)
  const leaving = useRef(false)
  const dirty = JSON.stringify(values) !== baseline
  useUnsavedNavigation(dirty, busy, leaving)
  const singleton = ["categories", "about", "contact"].includes(kind)
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty && !leaving.current) { event.preventDefault(); event.returnValue = "" } }
    window.addEventListener("beforeunload", leave)
    return () => window.removeEventListener("beforeunload", leave)
  }, [dirty])
  useEffect(() => {
    const timer = window.setInterval(() => { if (Date.now() >= Date.parse(expiresAt)) setExpired(true) }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  function allowLeave() { return !dirty || window.confirm("저장하지 않은 변경 사항이 있습니다. 변경을 버리고 이동할까요?") }
  function navigate(event: MouseEvent<HTMLAnchorElement>) { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; if (busy || !allowLeave()) event.preventDefault(); else leaving.current = true }
  function choose(item: CmsItem | null) {
    if (busy || !allowLeave()) return
    leaving.current = false
    const next = toFormValues(kind, item?.data)
    if (!item && "order" in next) next.order = String(Math.max(0, ...items.map(entry => Number(entry.data.order) || 0))+1)
    setSelected(item); setValues(next); setBaseline(JSON.stringify(next)); setErrors({}); setMessage(""); setConflict(false)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const parsed = parseCmsValues(kind, values)
    setErrors(parsed.errors)
    if (!parsed.valid) { document.getElementById(`cms-${Object.keys(parsed.errors)[0]}`)?.focus(); setMessage("입력한 내용을 확인해 주세요."); return }
    submitting.current = true; setBusy(true); setMessage(""); setConflict(false)
    try {
      const response = await fetch(`/api/admin/content/${kind}`, { method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values, ...(selected ? { key: selected.key, version: selected.version } : {}) }), signal: AbortSignal.timeout(15000) })
      const result = await response.json()
      if (!response.ok) { setErrors(result.fields ?? {}); setMessage(result.error || "저장하지 못했습니다."); setExpired(response.status === 401); setConflict(response.status === 409); return }
      const saved = result.item as CmsItem
      const next = toFormValues(kind, saved.data)
      setSelected(saved); setValues(next); setBaseline(JSON.stringify(next)); setItems(current => [...current.filter(item => item.key !== saved.key), saved].sort((a,b) => Number(a.data.order ?? 0)-Number(b.data.order ?? 0))); setMessage("MongoDB에 저장했습니다. 공개 화면을 새로 열면 반영됩니다.")
      router.refresh()
    } catch { setMessage("저장을 완료하지 못했습니다. 입력 내용은 유지됩니다. 연결 상태를 확인해 주세요.") }
    finally { submitting.current = false; setBusy(false) }
  }
  async function reload() {
    if (!allowLeave() || busy) return
    setBusy(true)
    try {
      const response = await fetch(`/api/admin/content/${kind}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) { setMessage(result.error); if (response.status === 401) setExpired(true); return }
      const nextItems = result.items as CmsItem[], item = nextItems.find(item => item.key === selected?.key) ?? nextItems[0] ?? null
      const next = toFormValues(kind, item?.data)
      setItems(nextItems); setSelected(item); setValues(next); setBaseline(JSON.stringify(next)); setErrors({}); setConflict(false); setMessage("최신 내용을 불러왔습니다.")
    } catch { setMessage("최신 내용을 불러오지 못했습니다. 입력 내용은 유지됩니다.") }
    finally { setBusy(false) }
  }
  async function logout() {
    if (busy || !allowLeave()) return
    setBusy(true)
    try { const response = await fetch("/api/admin/session", { method: "DELETE" }); if (!response.ok) throw new Error(); leaving.current = true; router.replace("/admin/login"); router.refresh() } catch { leaving.current = false; setMessage("로그아웃을 완료하지 못했습니다. 다시 시도해 주세요."); setBusy(false) }
  }
  const previewUrl = kind === "projects" && selected ? `/projects/${selected.key}` : kind === "notes" && selected ? `/notes/${String(selected.data.slug)}` : `/?category=${kind === "categories" ? "projects" : kind}&view=expanded`
  const thumbnail = values.thumbnail
  return <div className="cms-admin">
    <header className="cms-admin-header"><div><p className="cms-eyebrow">PORTFOLIO CONTENT</p><h1>{cmsLabels[kind]} 관리</h1></div><div><Link href="/" onClick={navigate}>홈</Link><a href={previewUrl} target="_blank" rel="noreferrer">공개 화면 ↗</a><button type="button" disabled={busy} onClick={logout}>로그아웃</button></div></header>
    <nav className="cms-admin-nav" aria-label="콘텐츠 종류">{cmsKinds.map(section => <Link key={section} href={`/admin/${section}`} aria-current={kind === section ? "page" : undefined} onClick={navigate}>{cmsLabels[section]}</Link>)}</nav>
    {expired && <p className="cms-alert" role="alert">관리자 세션이 만료되었습니다. 입력 내용은 유지됩니다. <a href={`/admin/login?returnTo=/admin/${kind}`} target="_blank" rel="noreferrer">새 탭에서 다시 로그인 ↗</a> 후 저장을 다시 눌러 주세요.</p>}
    <div className="cms-admin-grid"><aside className="cms-items" aria-label="편집 항목">
      {!singleton && <button type="button" className="cms-add" disabled={busy} onClick={() => choose(null)}>+ 새 항목 추가</button>}
      {!items.length && <p>{singleton ? "초기 이전 스크립트로 기본 설정을 준비해 주세요." : "등록된 항목이 없습니다."}</p>}
      {items.map(item => <button type="button" key={item.key} aria-pressed={selected?.key === item.key} disabled={busy} onClick={() => choose(item)}><strong>{String(item.data.title ?? item.data.name ?? item.data.label ?? item.data.heading ?? cmsLabels[kind])}</strong><small>{kind === "projects" ? `ID ${item.key} · ` : ""}{item.data.visibility === "private" ? "비공개" : "공개"} · v{item.version}</small></button>)}
    </aside><section className="cms-form-panel">
      <div className="cms-form-heading"><h2>{selected ? "내용 수정" : "새 항목"}</h2><span>{dirty ? "저장하지 않은 변경 사항" : selected?.updatedAt ? `수정: ${new Date(selected.updatedAt).toLocaleString("ko-KR")}` : "입력 후 저장해 주세요."}</span></div>
      {selected && <p className="cms-item-key">고유 식별자: {selected.key} {kind === "categories" && "· 표시 이름과 별개로 URL과 연결을 유지합니다."}</p>}
      <form className="cms-fields" onSubmit={save} noValidate>
        {cmsFields[kind].map(field => <label className={`cms-field ${["textarea","lines","links"].includes(field.type ?? "") ? "cms-field-wide" : ""}`} key={field.name} htmlFor={`cms-${field.name}`}><span>{field.label}{field.required && <small>필수</small>}</span>
          {field.type === "select" ? <select id={`cms-${field.name}`} value={values[field.name]} onChange={event => { setValues(current => ({ ...current, [field.name]: event.target.value })); setMessage("") }} disabled={busy}>{field.options?.map(value => <option key={value} value={value}>{value === "public" ? "공개" : value === "private" ? "비공개" : value === "personal" ? "개인" : value === "team" ? "팀" : value === "experiment" ? "실험 작업" : value === "project" ? "프로젝트" : value || "표시하지 않음"}</option>)}</select> : ["textarea","lines","links"].includes(field.type ?? "") ? <textarea id={`cms-${field.name}`} value={values[field.name]} onChange={event => { setValues(current => ({ ...current, [field.name]: event.target.value })); setMessage("") }} rows={field.type === "textarea" ? 6 : 4} disabled={busy} required={field.required} aria-invalid={!!errors[field.name]} aria-describedby={`hint-${field.name}`} maxLength={field.max ?? 20000} /> : <input id={`cms-${field.name}`} type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "color" ? "color" : field.type === "email" ? "email" : "text"} value={values[field.name]} onChange={event => { setValues(current => ({ ...current, [field.name]: event.target.value })); setMessage("") }} min={field.type === "number" ? 0 : undefined} max={field.type === "number" ? 1000000 : undefined} required={field.required} disabled={busy} aria-invalid={!!errors[field.name]} aria-describedby={`hint-${field.name}`} maxLength={field.max ?? 20000} />}
          <small id={`hint-${field.name}`} className={errors[field.name] ? "cms-field-error" : ""}>{errors[field.name] || field.hint || (["tags","ids"].includes(field.type ?? "") ? "쉼표로 구분합니다." : field.type === "lines" ? "한 줄에 한 항목을 입력합니다." : "")}</small>
        </label>)}
        {thumbnail && safeContentUrl(thumbnail,true) && <div className="cms-field-wide"><ImagePreview key={thumbnail} src={thumbnail} /></div>}
        {kind === "about" && values.resume && safeContentUrl(values.resume) && <a href={values.resume} target="_blank" rel="noreferrer">이력서 미리보기 ↗</a>}
        <footer className="cms-save-bar"><div><p role="status" aria-live="polite">{message || errors._form || (busy ? "저장 중…" : "저장 버튼을 누르면 MongoDB에 반영됩니다.")}</p>{conflict && <button type="button" onClick={reload} disabled={busy}>최신 내용 불러오기</button>}</div><div><button type="button" disabled={busy} onClick={() => choose(selected)}>취소</button><button type="submit" className="cms-primary" disabled={busy || singleton && !selected}>{busy ? "저장 중…" : "저장"}</button></div></footer>
      </form>
    </section></div>
  </div>
}
