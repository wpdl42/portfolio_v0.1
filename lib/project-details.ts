export type ProjectDetail = {
  tags: string[]
  process: string
  learnings: string[]
  overview?: string
  features?: string[]
  technologyNote?: string
  sources?: string[]
}

export function getProjectDetail(project: { id: number; description: string; detail?: ProjectDetail }): ProjectDetail {
  return project.detail ?? projectDetails[project.id] ?? { tags: [], process: project.description, learnings: [] }
}

export const projectDetails: Record<number, ProjectDetail> = {
  1: {
    tags: ["Web", "AI", "Responsive UI", "Team"],
    process: "웹 프로그래밍 수업의 팀 프로젝트로 AI 주제의 반응형 사이트를 제작했습니다. 프론트엔드 화면 구성과 UI 디자인을 담당했습니다.",
    learnings: ["팀 프로젝트에서 화면 구성과 역할을 맞추는 과정", "화면 크기에 따라 달라지는 레이아웃 설계"],
  },
  2: {
    tags: ["Java", "Management System", "Team"],
    process: "학생과 수업 정보를 관리하는 학사관리 시스템을 모방해 만들었습니다. 백엔드 로직 설계에 참여했습니다.",
    learnings: ["정보를 구조화하고 관리하는 로직", "팀 작업에서 기능을 나누고 연결하는 과정"],
  },
  3: {
    tags: ["Next.js", "Web", "Personal"],
    process: "수업 결과물과 학습 과정을 한곳에 기록하기 위해 기획과 디자인, 프론트엔드 구현을 진행하고 있습니다.",
    learnings: ["정보를 탐색하기 쉬운 화면 구조", "반응형 UI와 인터랙션을 직접 조정하는 과정"],
  },
}
