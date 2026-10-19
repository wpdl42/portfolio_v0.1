import { getProjectDetail } from "./catalog"
import type { Project } from "./types"

const technologyFilters = ["React", "Next.js", "MongoDB"]
export const projectFilters = ["All", "Web", "Java", ...technologyFilters, "Experiments"]

export function matchesProjectFilter(project: Project, filter: string) {
  if (filter === "Experiments") return project.kind === "experiment"
  if (project.kind === "experiment") return false
  return filter === "All"
    || (filter === "Web" && /Web|Next/i.test(project.category))
    || (filter === "Java" && /Java/i.test(project.category))
    || (technologyFilters.includes(filter) && getProjectDetail(project).tags.includes(filter))
}
