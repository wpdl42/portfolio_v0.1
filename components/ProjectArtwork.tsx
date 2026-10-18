import type { CSSProperties } from "react"
import type { Project } from "@/lib/portfolio"

const artwork: Record<number, string> = {
  1: "/images/project-neocore.svg",
  2: "/images/project-campus.svg",
  3: "/images/project-portfolio.svg",
}

export function ProjectArtwork({ project }: { project: Project }) {
  if(project.thumbnail) return <div className="project-artwork" data-artwork="screenshot" role="img" aria-label={`${project.title} 공개 홈 실행 화면`} style={{ "--project-artwork": `url("${project.thumbnail}")` } as CSSProperties}><span>공개 홈 실행 화면</span></div>
  return <div className="project-artwork" data-artwork="illustration" role="img" aria-label={`${project.title} 프로젝트 일러스트. 실제 실행 화면이 아닙니다.`} style={{ "--project-artwork": `url("${artwork[project.id]}")` } as CSSProperties}><span>프로젝트 일러스트</span></div>
}
