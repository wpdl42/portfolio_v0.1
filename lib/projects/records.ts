import type { Document } from "mongodb"
import type { Project } from "./types"

// Keep the same allowlist and optional-field rules used by the existing reader.
export function toPublicProject(record: Document): Project | null {
  if (
    !Number.isSafeInteger(record.id)
    || typeof record.title !== "string"
    || typeof record.description !== "string"
    || typeof record.category !== "string"
    || typeof record.period !== "string"
    || typeof record.role !== "string"
  ) return null

  return {
    id: record.id,
    title: record.title,
    description: record.description,
    category: record.category,
    role: record.role,
    period: record.period,
    accent: record.accent ?? "blue",
    visibility: "public",
    ...(record.slug ? { slug: record.slug } : {}),
    ...(record.link ? { link: record.link } : {}),
    ...(record.order !== undefined ? { order: record.order } : {}),
    ...(record.thumbnail ? { thumbnail: record.thumbnail } : {}),
    ...(record.keywords ? { keywords: record.keywords } : {}),
    ...(record.detail ? { detail: record.detail } : {}),
    ...(record.status ? { status: record.status } : {}),
  }
}

export function mergeProjectRecords(fallback: Project[], records: Document[]): Project[] {
  const combined = [...fallback]
  for (const record of records) {
    const project = toPublicProject(record)
    if (!project) continue
    const index = combined.findIndex(item => item.id === project.id || (item.slug && item.slug === project.slug))
    if (index >= 0) combined[index] = project
    else combined.push(project)
  }
  return combined.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id))
}
