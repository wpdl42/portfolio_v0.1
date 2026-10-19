import type { Project } from "@/lib/projects/types"
import type { PortfolioContent } from "@/lib/cms/types"
import { getProjectDetail } from "@/lib/project-details"
export type CategoryId = "projects" | "skills" | "journey" | "notes" | "about" | "contact"
export type Category = { id: CategoryId; label: string; color: string; keywords: string[]; intro: string; summary: string }
// Structural navigation defaults only. Published copy, ordering and colors come from MongoDB.
export const categories: Category[] = [
  { id: "projects", label: "Projects", color: "#9a4dff", keywords: ["projects", "프로젝트"], intro: "", summary: "" },
  { id: "journey", label: "Journey", color: "#e4ad54", keywords: ["journey", "learning"], intro: "", summary: "" },
  { id: "skills", label: "Skills", color: "#5a82ea", keywords: ["skills", "기술"], intro: "", summary: "" },
  { id: "notes", label: "Notes", color: "#7385a1", keywords: ["notes", "기록"], intro: "", summary: "" },
  { id: "about", label: "About", color: "#f28c58", keywords: ["about", "소개"], intro: "", summary: "" },
  { id: "contact", label: "Contact", color: "#69b78a", keywords: ["contact", "연락"], intro: "", summary: "" },
]
export function parseCategory(value?: string | null): CategoryId | null {
  if (value === "learning") return "journey"
  if (value === "experiments") return "projects"
  return categories.some(category => category.id === value) ? value as CategoryId : null
}
export type SearchKind = "project" | "learning" | "experiment" | "page" | "category" | "note" | "skill"
export type SearchItem = { id: string; label: string; category: CategoryId; kind: SearchKind; tags: string[]; description: string; projectId?: number; noteId?: string }
export const searchKindLabels: Record<SearchKind, string> = { project: "프로젝트", learning: "학습", experiment: "실험", page: "페이지", category: "카테고리", note: "글", skill: "기술" }
export const normalizeSearch = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase()
type SearchContent = Pick<PortfolioContent, "categories" | "skills" | "journey" | "notes" | "about" | "contact">
export function searchPortfolio(query: string, catalog: Project[] = [], content?: SearchContent): SearchItem[] {
  const needle = normalizeSearch(query)
  if (!needle) return []
  const navigation = content?.categories ?? categories
  const items: SearchItem[] = [
    ...catalog.map((project): SearchItem => ({ id: `project-${project.id}`, label: project.title, category: "projects", kind: project.kind === "experiment" ? "experiment" : "project", tags: [...getProjectDetail(project).tags, ...(project.keywords ?? [])], description: project.description, projectId: project.id })),
    ...(content?.notes ?? []).map((note): SearchItem => ({ id: `note-${note.id}`, label: note.title, category: "notes", kind: "note", tags: note.tags, description: note.description, noteId: note.slug })),
    ...(content?.skills ?? []).map((skill): SearchItem => ({ id: `skill-${skill.id}`, label: `${skill.name} 활용 경험`, category: "skills", kind: "skill", tags: [skill.name, skill.group], description: skill.description })),
    ...(content?.journey ?? []).map((item): SearchItem => ({ id: `journey-${item.id}`, label: item.title, category: "journey", kind: "learning", tags: [item.activityType, item.period], description: item.description })),
    ...(content?.about?.name ? [{ id: "about-me", label: content.about.name, category: "about" as const, kind: "page" as const, tags: ["소개", "profile"], description: `${content.about.lead} ${content.about.bio}` }] : []),
    ...navigation.map((category): SearchItem => ({ id: category.id, label: category.label, category: category.id, kind: "category", tags: [category.id, ...category.keywords], description: category.intro })),
  ]
  const ranked = items.flatMap((item, order) => {
    const title = normalizeSearch(item.label)
    const titleMatch = title === needle ? 0 : title.includes(needle) ? 1 : null
    const tagMatch = item.tags.some(tag => normalizeSearch(tag).includes(needle))
    const descriptionMatch = normalizeSearch(item.description).includes(needle)
    const tier = titleMatch ?? (item.kind === "category" ? tagMatch || descriptionMatch ? 4 : null : tagMatch ? 2 : descriptionMatch ? 3 : null)
    return tier === null ? [] : [{ item, tier, wordMatch: title.split(/[\s·/.-]+/).includes(needle) ? 0 : 1, order }]
  })
  for (const category of navigation) if (ranked.some(({ item }) => item.category === category.id) && !ranked.some(({ item }) => item.id === category.id)) {
    const item = items.find(item => item.id === category.id)!
    ranked.push({ item, tier: 4, wordMatch: 1, order: items.indexOf(item) })
  }
  return ranked.sort((a,b) => a.tier-b.tier || a.wordMatch-b.wordMatch || a.order-b.order).map(({ item }) => item)
}
export function matchesCategory(query: string, category: Category, catalog: Project[] = [], content?: SearchContent): boolean {
  const exact = (content?.categories ?? categories).find(item => normalizeSearch(item.label) === normalizeSearch(query))
  return exact ? exact.id === category.id : searchPortfolio(query, catalog, content).some(item => item.category === category.id)
}
