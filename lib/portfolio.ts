import reownProject from "@/data/reown-project.json"
import type { ProjectDetail } from "@/lib/project-details"

export type Project = {
  id: number
  title: string
  category: string
  description: string
  role: string
  period: string
  status?: "진행 중" | "완료" | "예정"
  accent: string
  link?: string
  slug?: string
  canonicalUrl?: string
  visibility?: "public" | "private"
  order?: number
  thumbnail?: string
  keywords?: string[]
  detail?: ProjectDetail
}

export type Skill = {
  name: string
  category: "frontend" | "backend" | "tools"
  level: number
}

export const projects: Project[] = [
  {
    id: 1,
    title: "NeoCore Team Project",
    category: "Web · Team",
    description:
      "웹 프로그래밍 수업에서 진행한 AI 주제의 반응형 웹사이트 팀 프로젝트입니다.",
    role: "프론트엔드 개발 및 UI 디자인",
    period: "2026.04 — 2026.06",
    status: "완료",
    accent: "blue",
    link: "https://neo-core-ai.vercel.app/",
  },
  {
    id: 2,
    title: "Java 학사관리 시스템",
    category: "Java · Team",
    description:
      "학생과 수업 정보를 관리하는 교내 학사관리 시스템 모방 프로젝트입니다.",
    role: "백엔드 로직 설계",
    period: "2026.05",
    status: "완료",
    accent: "orange",
  },
  {
    id: 3,
    title: "Personal Portfolio",
    category: "Next.js · Personal",
    description:
      "수업 결과물과 학습 과정을 한곳에 기록하기 위해 제작하는 개인 포트폴리오입니다.",
    role: "기획, 디자인, 프론트엔드",
    period: "2026.10 —",
    status: "진행 중",
    accent: "green",
  },
  reownProject as Project,
]

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
  { year: "2024", text: "컴퓨터활용능력 2급 취득" },
  { year: "2026", text: "복학 및 웹 개발 학습 진행" },
  { year: "NEXT", text: "리눅스와 보안 역량 확장" },
]
