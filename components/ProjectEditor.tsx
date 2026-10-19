"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react"
import type { Project } from "@/lib/projects/types"
import { getProjectArtwork, getProjectDetail } from "@/lib/projects/catalog"
import { ProjectArtwork } from "@/components/ProjectArtwork"
import { ProjectDetailTabs } from "@/components/ProjectDetailTabs"
import {
  createEditorPreview, createEditorValues, loadProjectDrafts, saveProjectDraft,
  validateEditorValues, type ProjectDraft, type ProjectEditorValues,
} from "@/lib/projects/editor-drafts"

type Field = { name: keyof ProjectEditorValues; label: string; placeholder?: string; multiline?: boolean; hint?: string }
const basicFields: Field[] = [
  { name: "title", label: "프로젝트 제목", placeholder: "프로젝트 이름" },
  { name: "category", label: "분류", placeholder: "Web · Personal" },
  { name: "description", label: "카드 소개", multiline: true, hint: "프로젝트 목록과 검색에 표시할 짧은 소개입니다." },
  { name: "role", label: "담당 역할", placeholder: "직접 담당한 역할" },
  { name: "period", label: "제작 기간", placeholder: "예: 2026.09 — 진행 중" },
  { name: "tags", label: "기술 태그", placeholder: "React, Next.js, MongoDB", hint: "쉼표로 구분합니다." },
  { name: "keywords", label: "검색 키워드", placeholder: "수업, 실습, 웹 페이지" },
  { name: "link", label: "사이트 방문 주소", placeholder: "https://example.com", hint: "입력하면 카드와 상세 미리보기에 사이트 방문 링크가 표시됩니다." },
  { name: "thumbnail", label: "실행 화면 이미지", placeholder: "/images/project-example.png 또는 https://…", hint: "현재는 이미지 주소를 입력합니다. 이미지가 없으면 일러스트를 사용합니다." },
]
const detailFields: Field[] = [
  { name: "overview", label: "프로젝트 개요", multiline: true },
  { name: "features", label: "주요 기능", multiline: true, hint: "한 줄에 한 항목씩 입력합니다." },
  { name: "process", label: "개발 과정", multiline: true },
  { name: "technologyNote", label: "기술 선택과 활용", multiline: true },
  { name: "learnings", label: "배운 점", multiline: true, hint: "한 줄에 한 항목씩 입력합니다." },
]

function initialDrafts() {
  try { return { drafts: loadProjectDrafts(window.localStorage), error: "" } }
  catch { return { drafts: [] as ProjectDraft[], error: "브라우저 초안을 읽지 못했습니다. 저장 공간 설정이나 이전 초안 데이터를 확인해 주세요." } }
}

export function ProjectEditor({ projects, onClose }: { projects: Project[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [{ drafts, error: storageError }, setStorage] = useState(initialDrafts)
  const firstKey = projects[0] ? `project:${projects[0].id}` : "draft:new"
  const [activeKey, setActiveKey] = useState(firstKey)
  const [values, setValues] = useState(() => drafts.find(item => item.key === firstKey)?.values ?? createEditorValues(projects[0], projects[0] ? getProjectDetail(projects[0]) : undefined))
  const [baseline, setBaseline] = useState(() => JSON.stringify(values))
  const [errors, setErrors] = useState<ReturnType<typeof validateEditorValues>>({})
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<"card" | "detail">("card")
  const dirty = JSON.stringify(values) !== baseline
  const source = projects.find(project => `project:${project.id}` === activeKey)
  const preview = useMemo(() => createEditorPreview(values, source), [values, source])
  const hasArtwork = !!preview.thumbnail || !!getProjectArtwork(preview).path
  const entries = [
    ...projects.map(project => ({ key: `project:${project.id}`, title: drafts.find(draft => draft.key === `project:${project.id}`)?.values.title || project.title })),
    ...drafts.filter(draft => !projects.some(project => `project:${project.id}` === draft.key)).map(draft => ({ key: draft.key, title: draft.values.title })),
  ]

  useEffect(() => {
    const dialog = dialogRef.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialog.showModal()
    headingRef.current?.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (pending) dialogRef.current?.querySelector<HTMLButtonElement>(".project-editor-confirm button")?.focus()
  }, [pending])

  function applyAction(target: string) {
    setPending(null)
    if (target === "close") { onClose(); return }
    const key = target === "new" ? `draft:${crypto.randomUUID()}` : target
    const original = projects.find(project => `project:${project.id}` === key)
    const next = drafts.find(draft => draft.key === key)?.values ?? createEditorValues(original, original ? getProjectDetail(original) : undefined)
    setActiveKey(key)
    setValues(next)
    setBaseline(JSON.stringify(next))
    setErrors({})
    setMessage("")
    headingRef.current?.focus({ preventScroll: true })
  }

  function requestAction(target: string) {
    if (target === activeKey) return
    if (dirty) setPending(target)
    else applyAction(target)
  }

  function save() {
    const validation = validateEditorValues(values)
    setErrors(validation)
    const firstError = Object.keys(validation)[0]
    if (firstError) {
      dialogRef.current?.querySelector<HTMLElement>(`#editor-${firstError}`)?.focus()
      setMessage("입력한 내용을 확인해 주세요.")
      return false
    }
    const draft: ProjectDraft = { key: activeKey, projectId: source?.id ?? drafts.find(item => item.key === activeKey)?.projectId ?? null, values: { ...values }, updatedAt: new Date().toISOString() }
    try {
      const next = saveProjectDraft(window.localStorage, drafts, draft)
      setStorage({ drafts: next, error: "" })
      setBaseline(JSON.stringify(values))
      setMessage("이 브라우저에 초안을 저장했습니다.")
      return true
    } catch {
      setMessage("초안을 저장하지 못했습니다. 브라우저 저장 공간이나 초안 개수를 확인해 주세요. 입력 내용은 그대로 유지됩니다.")
      return false
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); save() }
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      requestAction("close")
      return
    }
    if (event.key !== "Tab") return
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href],[tabindex]'))
      .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0)
    const first = targets[0], last = targets[targets.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === headingRef.current)) {
      event.preventDefault()
      first?.focus()
    }
  }
  function change(name: keyof ProjectEditorValues, value: string) {
    setValues(current => ({ ...current, [name]: value }))
    setErrors(current => ({ ...current, [name]: undefined }))
    setMessage("")
  }
  function renderField(field: Field) {
    const props = { id: `editor-${field.name}`, name: field.name, value: values[field.name], required: field.name === "title", onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(field.name, event.target.value), "aria-invalid": !!errors[field.name], "aria-describedby": errors[field.name] || field.hint ? `editor-${field.name}-hint` : undefined, placeholder: field.placeholder, maxLength: field.name === "title" ? 120 : 20000 }
    return <label className={`project-editor-field ${field.multiline ? "project-editor-field-wide" : ""}`} key={field.name} htmlFor={props.id}>
      <span>{field.label}{field.name === "title" && <small>필수</small>}</span>
      {field.multiline ? <textarea {...props} rows={field.name === "description" ? 3 : 5} /> : <input {...props} type={field.name === "link" ? "url" : "text"} />}
      {(errors[field.name] || field.hint) && <small id={`editor-${field.name}-hint`} data-error={!!errors[field.name]}>{errors[field.name] || field.hint}</small>}
    </label>
  }

  return <dialog ref={dialogRef} className="project-editor" aria-modal="true" aria-labelledby="project-editor-title" aria-describedby="project-editor-notice" onCancel={event => { event.preventDefault(); event.stopPropagation(); requestAction("close") }} onKeyDown={handleKeyDown}>
    <header className="project-editor-header">
      <div><p>PROJECT WORKSPACE</p><h2 id="project-editor-title" ref={headingRef} tabIndex={-1}>프로젝트 편집</h2></div>
      <button type="button" className="project-editor-close" aria-label="프로젝트 편집 닫기" onClick={() => requestAction("close")}>×</button>
    </header>
    <p id="project-editor-notice" className="project-editor-notice">로그인 연결 전 미리보기입니다. 초안은 이 브라우저에만 저장되며 공개 프로젝트와 별도로 관리됩니다.</p>
    <div className="project-editor-layout">
      <aside className="project-editor-sidebar" aria-label="편집할 프로젝트">
        <button type="button" className="project-editor-add" onClick={() => requestAction("new")}>+ 프로젝트 추가</button>
        <div className="project-editor-list">{entries.map(entry => <button type="button" className="project-editor-item" key={entry.key} data-project-key={entry.key} aria-pressed={activeKey === entry.key} onClick={() => requestAction(entry.key)}><span>{entry.title}</span><small>{drafts.some(draft => draft.key === entry.key) ? "저장된 초안" : "기존 프로젝트"}</small></button>)}</div>
      </aside>
      <div className="project-editor-scroll">
        <form id="project-editor-form" className="project-editor-form" onSubmit={submit} noValidate>
          <section><div className="project-editor-section-heading"><h3>{source ? "프로젝트 수정" : "새 프로젝트"}</h3><span>{dirty ? "저장하지 않은 변경 사항" : "입력 내용을 미리 볼 수 있습니다."}</span></div><div className="project-editor-fields">{basicFields.map(renderField)}
            <label className="project-editor-field" htmlFor="editor-status"><span>진행 상태</span><select id="editor-status" value={values.status} onChange={event => change("status", event.target.value)}><option value="">표시하지 않음</option><option>진행 중</option><option>완료</option><option>예정</option></select></label>
            <label className="project-editor-field" htmlFor="editor-accent"><span>테마 색상</span><select id="editor-accent" value={values.accent} onChange={event => change("accent", event.target.value)}><option value="blue">블루</option><option value="orange">오렌지</option><option value="green">그린</option></select></label>
          </div></section>
          <section><h3>상세 페이지 내용</h3><div className="project-editor-fields">{detailFields.map(renderField)}</div></section>
        </form>
        <section className="project-editor-preview" aria-labelledby="project-editor-preview-title">
          <div className="project-editor-section-heading"><h3 id="project-editor-preview-title">미리보기</h3><div className="project-editor-preview-switch" role="group" aria-label="미리보기 종류"><button type="button" aria-pressed={previewMode === "card"} onClick={() => setPreviewMode("card")}>카드</button><button type="button" aria-pressed={previewMode === "detail"} onClick={() => setPreviewMode("detail")}>상세</button></div></div>
          <article className={`project-editor-preview-card accent-${preview.accent}`}>
            <div className="project-preview">{hasArtwork ? <ProjectArtwork project={preview} /> : <div className="project-editor-placeholder"><span aria-hidden="true">&lt;/&gt;</span><small>프로젝트 일러스트</small></div>}</div>
            <div className="project-editor-preview-copy"><p>{preview.category} · {preview.period}</p><h4>{preview.title}</h4><p>{preview.description}</p><div className="orb-detail-tags">{preview.detail!.tags.map(tag => <span key={tag}>{tag}</span>)}</div>{preview.link && <a href={preview.link} target="_blank" rel="noreferrer">사이트 방문 ↗</a>}</div>
          </article>
          {previewMode === "detail" && <ProjectDetailTabs key={activeKey} project={preview} detail={preview.detail!} />}
        </section>
      </div>
    </div>
    <footer className="project-editor-footer">
      {pending ? <div className="project-editor-confirm" role="alert"><p>저장하지 않은 변경 사항이 있습니다.</p><div><button type="button" onClick={() => { if (save()) applyAction(pending) }}>초안 저장 후 이동</button><button type="button" onClick={() => applyAction(pending)}>변경 버리고 이동</button><button type="button" onClick={() => setPending(null)}>계속 편집</button></div></div> : <><p role="status" aria-live="polite">{message || storageError || "임시 저장한 초안은 다음에 편집 화면을 열 때 불러옵니다."}</p><button className="project-editor-save" type="submit" form="project-editor-form">초안 임시 저장</button></>}
    </footer>
  </dialog>
}
