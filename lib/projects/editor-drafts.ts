import type { Project, ProjectDetail } from "./types"

export const projectDraftStorageKey = "portfolio-project-drafts-v1"

export type ProjectEditorValues = {
  title: string
  category: string
  description: string
  role: string
  period: string
  status: string
  accent: string
  link: string
  thumbnail: string
  tags: string
  keywords: string
  overview: string
  features: string
  process: string
  technologyNote: string
  learnings: string
}

export type ProjectDraft = {
  key: string
  projectId: number | null
  updatedAt: string
  values: ProjectEditorValues
}

export function createEditorValues(project?: Project, detail?: ProjectDetail): ProjectEditorValues {
  const content = detail ?? project?.detail
  return {
    title: project?.title ?? "",
    category: project?.category ?? "Web",
    description: project?.description ?? "",
    role: project?.role ?? "",
    period: project?.period ?? "",
    status: project?.status ?? (project ? "" : "진행 중"),
    accent: project?.accent ?? "blue",
    link: project?.link ?? "",
    thumbnail: project?.thumbnail ?? "",
    tags: content?.tags.join(", ") ?? "",
    keywords: project?.keywords?.join(", ") ?? "",
    overview: content?.overview ?? project?.description ?? "",
    features: content?.features?.join("\n") ?? "",
    process: content?.process ?? "",
    technologyNote: content?.technologyNote ?? "",
    learnings: content?.learnings.join("\n") ?? "",
  }
}

export function splitEditorList(value: string, separator: "tags" | "lines") {
  return Array.from(new Set(value.split(separator === "tags" ? /[,，\n]/ : /\r?\n/).map(item => item.trim()).filter(Boolean)))
}

export function isEditorUrl(value: string, image = false) {
  if (!value.trim()) return true
  if (/["'\\\u0000-\u0020]/.test(value)) return false
  if (image && /^\/images\/[\w./-]+$/.test(value) && !value.includes("..")) return true
  try {
    const url = new URL(value)
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
  } catch { return false }
}

export function validateEditorValues(values: ProjectEditorValues) {
  const errors: Partial<Record<keyof ProjectEditorValues, string>> = {}
  if (!values.title.trim()) errors.title = "프로젝트 제목을 입력해 주세요."
  if (values.title.length > 120) errors.title = "제목은 120자 이내로 입력해 주세요."
  if (!isEditorUrl(values.link)) errors.link = "http:// 또는 https://로 시작하는 사이트 주소를 입력해 주세요."
  if (!isEditorUrl(values.thumbnail, true)) errors.thumbnail = "이미지 URL 또는 /images/ 안의 파일 경로를 입력해 주세요."
  for (const [field, value] of Object.entries(values)) {
    if (value.length > 20000) errors[field as keyof ProjectEditorValues] = "내용은 20,000자 이내로 입력해 주세요."
  }
  return errors
}

/** Browser-only drafts are separate from published projects and future server writes. */
export function loadProjectDrafts(storage: Pick<Storage, "getItem">): ProjectDraft[] {
  const raw = storage.getItem(projectDraftStorageKey)
  if (!raw) return []
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 || !("drafts" in data) || !Array.isArray(data.drafts)) throw new Error("INVALID_DRAFT_STORAGE")
  const fields = Object.keys(createEditorValues())
  const unique = new Map<string, ProjectDraft>()
  for (const entry of data.drafts.slice(0, 100)) {
    if (!entry || typeof entry !== "object" || typeof entry.key !== "string" || !entry.values || typeof entry.values !== "object") continue
    const validId = entry.projectId === null || Number.isSafeInteger(entry.projectId) && entry.projectId > 0
    const validKey = entry.projectId === null ? /^draft:[\w-]+$/.test(entry.key) : entry.key === `project:${entry.projectId}`
    if (!validId || !validKey || typeof entry.updatedAt !== "string" || Number.isNaN(Date.parse(entry.updatedAt))) continue
    if (!fields.every(field => typeof entry.values[field] === "string" && entry.values[field].length <= 20000)) continue
    const values = Object.fromEntries(fields.map(field => [field, entry.values[field]])) as ProjectEditorValues
    if (!isEditorUrl(values.link) || !isEditorUrl(values.thumbnail, true)) continue
    unique.set(entry.key, { key: entry.key, projectId: entry.projectId, updatedAt: entry.updatedAt, values })
  }
  return [...unique.values()]
}

export function saveProjectDraft(storage: Pick<Storage, "setItem">, drafts: ProjectDraft[], draft: ProjectDraft) {
  const next = [draft, ...drafts.filter(item => item.key !== draft.key)]
  if (next.length > 100) throw new Error("DRAFT_LIMIT")
  storage.setItem(projectDraftStorageKey, JSON.stringify({ version: 1, drafts: next }))
  return next
}

export function createEditorPreview(values: ProjectEditorValues, source?: Project): Project {
  const errors = validateEditorValues(values)
  return {
    id: source?.id ?? 0,
    title: values.title.trim() || "프로젝트 제목",
    category: values.category.trim() || "분류 작성 예정",
    description: values.description.trim() || "프로젝트 소개를 입력하면 여기에 표시됩니다.",
    role: values.role.trim() || "작성 예정",
    period: values.period.trim() || "작성 예정",
    status: ["진행 중", "완료", "예정"].includes(values.status) ? values.status as Project["status"] : undefined,
    accent: ["blue", "orange", "green"].includes(values.accent) ? values.accent : "blue",
    link: errors.link ? undefined : values.link.trim() || undefined,
    thumbnail: errors.thumbnail ? undefined : values.thumbnail.trim() || undefined,
    keywords: splitEditorList(values.keywords, "tags"),
    detail: {
      tags: splitEditorList(values.tags, "tags"),
      overview: values.overview.trim() || values.description.trim() || "프로젝트 개요 작성 예정",
      features: splitEditorList(values.features, "lines"),
      process: values.process.trim() || "개발 과정 작성 예정",
      technologyNote: values.technologyNote.trim() || "사용 기술 설명 작성 예정",
      learnings: splitEditorList(values.learnings, "lines"),
    },
  }
}
