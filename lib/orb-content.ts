import { assignments, projects, skills, type Project } from "@/lib/portfolio"
import { getProjectDetail } from "@/lib/project-details"
import { notes } from "@/lib/notes"

export type CategoryId = "projects" | "skills" | "journey" | "notes" | "about" | "contact"

export function parseCategory(value?: string | null): CategoryId | null {
  if (value === "learning") return "journey"
  if (value === "experiments") return "projects"
  return categories.some(category => category.id === value) ? value as CategoryId : null
}

export type Category = {
  id: CategoryId
  label: string
  color: string
  keywords: string[]
  intro: string
  summary: string
}

export const categories: Category[] = [
  { id: "projects", label: "Projects", color: "#9a4dff", keywords: ["project", "projects", "portfolio", "work", "프로젝트", "작업", "neocore", "java"], intro: "수업과 개인 학습에서 직접 만든 결과물을 모았습니다.", summary: "아이디어를 화면과 동작으로 옮긴 작업들입니다." },
  { id: "skills", label: "Skills", color: "#5a82ea", keywords: ["skills", "skill", "기술", "역량", "framework", "tool", "도구"], intro: "언어와 프레임워크, 도구를 실제 작업과 연결해 살펴봅니다.", summary: "퍼센트보다 어떻게 활용했는지를 기록합니다." },
  { id: "journey", label: "Journey", color: "#e4ad54", keywords: ["journey", "learning", "learn", "study", "학습", "공부", "교육", "활동", "성장"], intro: "교육과 활동, 새로운 기술을 익히는 과정을 기록합니다.", summary: "웹 개발과 보안을 함께 공부하고 있습니다." },
  { id: "notes", label: "Notes", color: "#7385a1", keywords: ["note", "notes", "blog", "기록", "노트", "블로그"], intro: "개발 과정에서 마주친 생각과 배움을 정리합니다.", summary: "배운 것을 잊지 않도록 남겨 둡니다." },
  { id: "about", label: "About", color: "#f28c58", keywords: ["about", "me", "profile", "소개", "장주민", "jumin", "site", "이력"], intro: "안녕하세요. 만들고 배우며 성장하는 장주민입니다.", summary: "웹 개발과 보안을 함께 탐색하고 있습니다." },
  { id: "contact", label: "Contact", color: "#69b78a", keywords: ["contact", "github", "email", "연락", "문의", "깃허브"], intro: "함께 이야기하고 싶은 주제가 있다면 연락해 주세요.", summary: "프로젝트와 학습에 관한 대화를 기다립니다." },
]

export type SearchKind = "project" | "learning" | "experiment" | "page" | "category" | "note" | "skill"
export type SearchItem = { id: string; label: string; category: CategoryId; kind: SearchKind; tags: string[]; description: string; projectId?: number; noteId?: string }

export const searchKindLabels: Record<SearchKind, string> = { project: "프로젝트", learning: "학습", experiment: "실험", page: "페이지", category: "카테고리", note: "글", skill: "기술" }

export const searchItems: SearchItem[] = [
  ...projectSearchItems(projects),
  ...notes.map((note): SearchItem => ({ id: `note-${note.id}`, label: note.title, category: "notes", kind: "note", tags: [...note.tags], description: note.description, noteId: note.id })),
  ...skills.map((skill): SearchItem => ({ id: `skill-${skill.name}`, label: `${skill.name} 활용 경험`, category: "skills", kind: "skill", tags: [skill.name, skill.category], description: "기술 역량과 관련 작업" })),
  ...skills.map((skill): SearchItem => ({ id: `learn-${skill.name}`, label: `${skill.name} 학습`, category: "journey", kind: "learning", tags: [skill.name, skill.category], description: `${skill.name} 기술을 직접 만들고 탐색하며 익히는 학습 기록` })),
  ...assignments.map((item): SearchItem => ({ id: `experiment-${item.number}`, label: item.title, category: "projects", kind: "experiment", tags: ["과제", "실험", "experiments"], description: item.description })),
  { id: "about-me", label: "About Me", category: "about", kind: "page", tags: ["profile", "소개", "장주민"], description: "웹 개발과 보안을 공부하는 장주민 소개" },
  { id: "about-site", label: "About This Site", category: "about", kind: "page", tags: ["portfolio", "사이트"], description: "배우고 만드는 과정을 기록하는 개인 포트폴리오" },
  { id: "blog", label: "Learning Notes", category: "notes", kind: "page", tags: ["blog", "블로그", "노트"], description: "웹 개발과 리눅스, 보안에 관한 학습 기록" },
  { id: "github", label: "GitHub", category: "contact", kind: "page", tags: ["github", "깃허브", "연락"], description: "프로젝트 코드와 작업 기록" },
  ...categories.map((category): SearchItem => ({ id: category.id, label: category.label, category: category.id, kind: "category", tags: category.keywords, description: category.intro })),
]

export const normalizeSearch = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase()

function projectSearchItems(catalog: Project[]): SearchItem[] {
  return catalog.map(project => ({ id: `project-${project.id}`, label: project.title, category: "projects", kind: "project", tags: [...getProjectDetail(project).tags, ...(project.keywords ?? [])], description: project.description, projectId: project.id }))
}

export function searchPortfolio(query: string, catalog: Project[] = projects): SearchItem[] {
  const needle = normalizeSearch(query)
  if (!needle) return []
  const items = [...projectSearchItems(catalog), ...searchItems.filter(item => item.kind !== "project")]
  const ranked = items.flatMap((item, order) => {
    const title = normalizeSearch(item.label)
    const titleMatch = title === needle ? 0 : title.includes(needle) ? 1 : null
    const tagMatch = item.tags.some((tag) => normalizeSearch(tag).includes(needle))
    const descriptionMatch = normalizeSearch(item.description).includes(needle)
    const tier = titleMatch ?? (item.kind === "category" ? tagMatch || descriptionMatch ? 4 : null : tagMatch ? 2 : descriptionMatch ? 3 : null)
    if (tier === null) return []
    const wordMatch = title.split(/[\s·/.-]+/).includes(needle) ? 0 : 1
    return [{ item, tier, wordMatch, order }]
  })
  const related = new Set(ranked.map(({ item }) => item.category))
  for (const category of categories) {
    if (related.has(category.id) && !ranked.some(({ item }) => item.id === category.id)) {
      const item = searchItems.find((item) => item.id === category.id)!
      ranked.push({ item, tier: 4, wordMatch: 1, order: searchItems.indexOf(item) })
    }
  }
  return ranked.sort((a, b) => a.tier - b.tier || a.wordMatch - b.wordMatch || a.order - b.order).map(({ item }) => item)
}

export function matchesCategory(query: string, category: Category, catalog: Project[] = projects): boolean {
  const exactCategory = categories.find((item) => normalizeSearch(item.label) === normalizeSearch(query))
  if (exactCategory) return exactCategory.id === category.id
  return searchPortfolio(query, catalog).some((item) => item.category === category.id)
}
