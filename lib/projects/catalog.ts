import legacyRecords from "@/data/projects.json"
import reownProject from "@/data/reown-project.json"
import type { Project, ProjectDetail } from "./types"

// Author each legacy project's copy and artwork together; keep the existing export shapes.
export const projects: Project[] = [
  ...legacyRecords.map(record => record.project as Project),
  reownProject as Project,
].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id))

export const projectDetails: Record<number, ProjectDetail> = Object.fromEntries(
  legacyRecords.map(record => [record.project.id, record.detail]),
)

const projectIllustrations: Record<number, string> = Object.fromEntries(
  legacyRecords.map(record => [record.project.id, record.illustration]),
)

export function getProjectDetail(project: Pick<Project, "id" | "description" | "detail">): ProjectDetail {
  return project.detail ?? projectDetails[project.id] ?? {
    tags: [],
    process: project.description,
    learnings: [],
  }
}

export function getProjectArtwork(project: Pick<Project, "id" | "title" | "thumbnail">) {
  if (project.thumbnail) {
    return {
      type: "screenshot",
      path: project.thumbnail,
      label: `${project.title} 공개 홈 실행 화면`,
      caption: "공개 홈 실행 화면",
    }
  }
  return {
    type: "illustration",
    path: projectIllustrations[project.id],
    label: `${project.title} 프로젝트 일러스트. 실제 실행 화면이 아닙니다.`,
    caption: "프로젝트 일러스트",
  }
}
