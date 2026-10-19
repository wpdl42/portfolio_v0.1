export const cmsKinds = ["projects", "skills", "journey", "notes", "about", "contact", "categories"] as const
export type CmsKind = typeof cmsKinds[number]
export const cmsNavigation = cmsKinds
export const deletableCmsKinds: readonly CmsKind[] = ["projects", "skills", "journey", "notes"]
export const canDeleteCmsKind = (kind: CmsKind) => deletableCmsKinds.includes(kind)
export type CmsField = { name: string; label: string; type?: "textarea" | "url" | "email" | "color" | "number" | "date" | "tags" | "lines" | "ids" | "links" | "select"; required?: boolean; max?: number; options?: string[]; initial?: string; hint?: string }
const visibility: CmsField = { name: "visibility", label: "공개 여부", type: "select", options: ["private", "public"], initial: "private" }
const order: CmsField = { name: "order", label: "표시 순서", type: "number", initial: "0" }
export const cmsLabels: Record<CmsKind, string> = { projects: "Projects", skills: "Skills", journey: "Journey", notes: "Notes", about: "About", contact: "Contact", categories: "위성 표시 설정" }
export const cmsFields: Record<CmsKind, CmsField[]> = {
  projects: [
    { name: "title", label: "제목", required: true, max: 120 }, { name: "category", label: "분류", required: true, max: 120, initial: "Web" },
    { name: "description", label: "요약", type: "textarea", required: true, max: 1500 }, { name: "role", label: "담당 역할", max: 300 }, { name: "period", label: "제작 기간", max: 160, hint: "확인된 기간만 입력합니다. 연도 미확인 등 자유 표기도 가능합니다." },
    { name: "teamType", label: "개인·팀 구분", type: "select", options: ["", "personal", "team"] }, { name: "status", label: "진행 상태", type: "select", options: ["", "진행 중", "완료", "예정"] },
    { name: "kind", label: "작업 분류", type: "select", options: ["project", "experiment"], initial: "project" }, visibility, order,
    { name: "thumbnail", label: "썸네일 URL", type: "url", hint: "https:// 주소 또는 /images/ 경로. 실제 실행 화면만 사용하세요." },
    { name: "link", label: "배포 주소", type: "url" }, { name: "githubLink", label: "GitHub 주소", type: "url" },
    { name: "accent", label: "카드 테마", type: "select", options: ["blue", "orange", "green"], initial: "blue" },
    { name: "keywords", label: "검색 키워드", type: "tags" }, { name: "detail.tags", label: "기술 태그", type: "tags" },
    { name: "detail.overview", label: "본문·프로젝트 개요", type: "textarea" }, { name: "detail.features", label: "주요 기능", type: "lines" },
    { name: "detail.process", label: "개발 과정", type: "textarea" }, { name: "detail.technologyNote", label: "기술 선택과 활용", type: "textarea" }, { name: "detail.learnings", label: "배운 점", type: "lines" },
  ],
  skills: [{ name: "name", label: "기술명", required: true, max: 120 }, { name: "group", label: "그룹", required: true, max: 100 }, { name: "description", label: "활용 경험", type: "textarea" }, { name: "projectIds", label: "관련 프로젝트 ID", type: "ids", hint: "숫자 ID를 쉼표로 구분합니다." }, order, visibility],
  journey: [{ name: "title", label: "제목", required: true, max: 160 }, { name: "activityType", label: "활동 유형", max: 100 }, { name: "period", label: "기간 표시", max: 160 }, { name: "startDate", label: "시작일(확인된 경우)", type: "date" }, { name: "endDate", label: "종료일(확인된 경우)", type: "date" }, { name: "description", label: "설명", type: "textarea" }, { name: "links", label: "관련 링크", type: "links", hint: "한 줄에 표시 문구 | https://주소" }, order, visibility],
  notes: [{ name: "title", label: "제목", required: true, max: 160 }, { name: "slug", label: "글 주소(slug)", required: true, max: 120, hint: "소문자 영문·숫자·하이픈. 변경 전 주소도 유지됩니다." }, { name: "description", label: "요약", type: "textarea", max: 1500 }, { name: "body", label: "본문", type: "textarea", required: true, hint: "일반 텍스트입니다. 빈 줄로 문단을 구분합니다." }, { name: "tags", label: "주제 태그", type: "tags" }, { name: "date", label: "작성일", type: "date" }, visibility, order],
  about: [
    { name: "name", label: "이름", required: true, max: 120 }, { name: "homeName", label: "홈 표시 이름", required: true, max: 120 }, { name: "lead", label: "한 줄 소개", max: 300 }, { name: "homeRole", label: "홈 역할 소개", max: 300 },
    { name: "bioTitle", label: "자기소개 제목", max: 160 }, { name: "bio", label: "자기소개", type: "textarea" }, { name: "interestsTitle", label: "관심 분야 제목", max: 160 }, { name: "interests", label: "관심 분야", type: "textarea" }, { name: "workStyleTitle", label: "작업 방식 제목", max: 160 }, { name: "workStyle", label: "작업 방식", type: "textarea" }, { name: "resume", label: "이력서 URL", type: "url" },
  ],
  contact: [{ name: "heading", label: "연락 유도 문구", required: true, max: 200 }, { name: "intro", label: "소개 문구", type: "textarea", max: 1500 }, { name: "email", label: "이메일", type: "email", max: 254 }, { name: "github", label: "GitHub URL", type: "url" }, { name: "githubLabel", label: "GitHub 표시 문구", max: 100 }, { name: "blog", label: "블로그 URL", type: "url" }, { name: "blogLabel", label: "블로그 표시 문구", max: 100 }, { name: "links", label: "추가 연락 링크", type: "links", hint: "한 줄에 표시 문구 | https://주소" }],
  categories: [{ name: "label", label: "표시 이름", required: true, max: 60 }, { name: "intro", label: "소개 문구", type: "textarea", max: 1500 }, { name: "summary", label: "보조 설명", type: "textarea", max: 1500 }, { name: "color", label: "고유 색상", type: "color", required: true }, order, { name: "keywords", label: "검색 키워드", type: "tags" }],
}
export function isCmsKind(value: string): value is CmsKind { return (cmsKinds as readonly string[]).includes(value) }
export function readField(data: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, data)
}
export function toFormValues(kind: CmsKind, data: Record<string, unknown> = {}) {
  return Object.fromEntries(cmsFields[kind].map(field => {
    const value = readField(data, field.name)
    const text = Array.isArray(value) ? field.type === "links" ? value.map(link => `${link.label} | ${link.url}`).join("\n") : value.join(field.type === "tags" || field.type === "ids" ? ", " : "\n") : value === undefined || value === null ? field.initial ?? "" : String(value)
    return [field.name, text]
  }))
}
export function safeContentUrl(value: string, image = false) {
  if (!value) return true
  if (/["'\\\u0000-\u0020]/.test(value)) return false
  if (image && /^\/images\/[\w./-]+$/.test(value) && !value.includes("..")) return true
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password } catch { return false }
}
export function parseCmsValues(kind: CmsKind, input: unknown) {
  const errors: Record<string, string> = {}, data: Record<string, unknown> = {}
  const values = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const allowed = new Set(cmsFields[kind].map(field => field.name))
  if (Object.keys(values).some(key => !allowed.has(key))) errors._form = "지원하지 않는 수정 항목이 포함되어 있습니다."
  for (const field of cmsFields[kind]) {
    const raw = values[field.name] ?? field.initial ?? ""
    if (typeof raw !== "string") { errors[field.name] = "문자열로 입력해 주세요."; continue }
    const value = raw.trim()
    if (field.required && !value) errors[field.name] = "필수 항목입니다."
    if (value.length > (field.max ?? 20000)) errors[field.name] = `${field.max ?? 20000}자 이내로 입력해 주세요.`
    let result: unknown = value
    if (field.type === "url" && !safeContentUrl(value, field.name === "thumbnail")) errors[field.name] = "올바른 http(s) URL을 입력해 주세요."
    if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field.name] = "올바른 이메일 주소를 입력해 주세요."
    if (field.type === "color" && !/^#[\da-f]{6}$/i.test(value)) errors[field.name] = "#RRGGBB 형식의 색상을 입력해 주세요."
    if (field.type === "select" && !field.options?.includes(value)) errors[field.name] = "목록에서 값을 선택해 주세요."
    if (field.type === "date" && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) errors[field.name] = "실제 존재하는 날짜를 YYYY-MM-DD로 입력해 주세요."
    if (field.type === "number") { result = Number(value); if (!value || !Number.isSafeInteger(result) || Number(result) < 0 || Number(result) > 1000000) errors[field.name] = "0~1,000,000 사이 정수를 입력해 주세요." }
    if (field.type === "tags" || field.type === "lines" || field.type === "ids" || field.type === "links") {
      const list = [...new Set(value.split(field.type === "tags" || field.type === "ids" ? /[,，\n]/ : /\r?\n/).map(item => item.trim()).filter(Boolean))]
      if (list.length > 100 || list.some(item => item.length > 2000)) errors[field.name] = "항목은 100개 이하, 각 2,000자 이내로 입력해 주세요."
      result = list
      if (field.type === "ids") { result = list.map(Number); if (list.some(id => !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1)) errors[field.name] = "프로젝트 숫자 ID를 입력해 주세요." }
      if (field.type === "links") { result = list.map(line => { const parts = line.split("|"); const label = parts[0]?.trim(), url = parts[1]?.trim(); if (parts.length !== 2 || !label || !url || !safeContentUrl(url)) errors[field.name] = "표시 문구 | https://주소 형식으로 입력해 주세요."; return { label, url } }) }
    }
    const parts = field.name.split(".")
    if (parts.length === 2) { data[parts[0]] ??= {}; (data[parts[0]] as Record<string, unknown>)[parts[1]] = result } else data[field.name] = result
  }
  if (kind === "notes" && typeof data.slug === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) errors.slug = "소문자 영문·숫자·하이픈만 사용할 수 있습니다."
  if (kind === "journey" && data.startDate && data.endDate && String(data.startDate) > String(data.endDate)) errors.endDate = "종료일은 시작일보다 빠를 수 없습니다."
  return { data, errors, valid: Object.keys(errors).length === 0 }
}
