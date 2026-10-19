import type { Project, ProjectDetail } from "./types"

export function getProjectDetail(project: Pick<Project, "id" | "description" | "detail">): ProjectDetail {
  return project.detail ?? {
    tags: [],
    process: project.description,
    learnings: [],
  }
}

export function getProjectArtwork(project: Pick<Project, "id" | "title" | "thumbnail" | "illustration">) {
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
    path: project.illustration ?? "/images/project-placeholder.svg",
    label: `${project.title} 프로젝트 일러스트. 실제 실행 화면이 아닙니다.`,
    caption: "프로젝트 일러스트",
  }
}
