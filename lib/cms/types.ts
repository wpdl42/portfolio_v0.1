import type { Category, CategoryId } from "@/lib/orb-content"
import type { Project } from "@/lib/projects/types"
export type CmsItem = { key: string; version: number; createdAt: string | null; updatedAt: string | null; data: Record<string, unknown> }
export type SkillEntry = { id: string; name: string; group: string; description: string; projectIds: number[]; order: number }
export type JourneyEntry = { id: string; title: string; activityType: string; period: string; startDate: string; endDate: string; description: string; links: { label: string; url: string }[]; order: number }
export type NoteEntry = { id: string; slug: string; title: string; description: string; body: string; tags: string[]; date: string; visibility: "public" | "private" }
export type AboutContent = { name: string; homeName: string; homeRole: string; lead: string; bioTitle: string; bio: string; interestsTitle: string; interests: string; workStyleTitle: string; workStyle: string; resume: string }
export type ContactContent = { heading: string; intro: string; email: string; github: string; githubLabel: string; blog: string; blogLabel: string; links: { label: string; url: string }[] }
export type PortfolioContent = { categories: (Category & { order: number })[]; projects: Project[]; skills: SkillEntry[]; journey: JourneyEntry[]; notes: NoteEntry[]; about: AboutContent; contact: ContactContent; status: "ready" | "empty" | "unavailable" }
export const categoryIds: CategoryId[] = ["projects", "skills", "journey", "notes", "about", "contact"]
