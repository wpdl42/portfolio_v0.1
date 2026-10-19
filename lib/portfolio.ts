export type { Project } from "@/lib/projects/types"
export { projects } from "@/lib/projects/catalog"

export type Skill = {
  name: string
  category: "frontend" | "backend" | "tools"
  level: number
}

export const assignments = [
  {
    number: "01",
    title: "개인 블로그 개설",
    description: "학습한 IT 기술과 수업 내용을 기록하는 블로그를 운영합니다.",
  },
  {
    number: "02",
    title: "HTML · CSS 데모",
    description:
      "HTML과 CSS의 기본 문법을 활용해 간단한 웹사이트를 제작했습니다.",
  },
  {
    number: "03",
    title: "다중 페이지 제작",
    description: "Home, About, Contact 화면을 구성하고 페이지를 연결했습니다.",
  },
  {
    number: "04",
    title: "팀 프로젝트 구성",
    description:
      "역할을 나누고 GitHub를 이용하는 협업 프로젝트를 준비했습니다.",
  },
]

export const skills: Skill[] = [
  { name: "HTML5", category: "frontend", level: 45 },
  { name: "CSS3", category: "frontend", level: 42 },
  { name: "JavaScript", category: "frontend", level: 35 },
  { name: "Next.js", category: "frontend", level: 25 },
  { name: "Java", category: "backend", level: 30 },
  { name: "Python", category: "backend", level: 20 },
  { name: "Linux", category: "backend", level: 32 },
  { name: "Security", category: "backend", level: 40 },
  { name: "Git", category: "tools", level: 55 },
]

export const history = [
  { year: "2023", text: "중부대학교 정보보호학과 입학" },
  { year: "2024", text: "자격증 취득" },
  { year: "2026", text: "복학 및 웹 개발 학습 진행" },
  { year: "NEXT", text: "리눅스와 보안 역량 확장" },
]
