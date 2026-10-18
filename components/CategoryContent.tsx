"use client"

import Link from "next/link"
import { FeaturedProjectsCarousel } from "@/components/FeaturedProjectsCarousel"
import { assignments, history, skills, type Project } from "@/lib/portfolio"
import { notes } from "@/lib/notes"
import type { CategoryId } from "@/lib/orb-content"

const experience: Record<string, { text: string; projects?: number[] }> = {
  HTML5: { text: "HTML · CSS 데모와 다중 페이지 과제에서 화면 구조를 구성했습니다.", projects: [1] },
  CSS3: { text: "HTML · CSS 데모와 반응형 웹사이트의 UI 작업에 활용했습니다.", projects: [1] },
  JavaScript: { text: "웹 프로젝트와 포트폴리오의 사용자 인터랙션을 구현하는 데 활용합니다.", projects: [3] },
  "Next.js": { text: "이 포트폴리오의 페이지와 동적 프로젝트 상세 경로에 활용합니다.", projects: [3] },
  Java: { text: "학생·수업 정보를 관리하는 학사관리 시스템의 로직을 설계했습니다.", projects: [2] },
  Git: { text: "GitHub를 활용한 팀 프로젝트 협업을 준비하고 작업을 관리합니다.", projects: [1] },
}

export function CategoryContent({ category, expanded, projects, targetProjectId, experiments = false }: { category: CategoryId; expanded: boolean; projects: Project[]; targetProjectId: number | null; experiments?: boolean }) {
  if (category === "projects") return experiments
    ? <div className="orb-content-grid">{assignments.map(item => <Link href={`/projects/experiment-${item.number}`} className="orb-info-card" key={item.number}><span className="orb-info-index">EXPERIMENT {item.number}</span><h3>{item.title}</h3><p>{item.description}</p><span aria-hidden="true">상세 보기 ↗</span></Link>)}</div>
    : <FeaturedProjectsCarousel projects={projects} expanded={expanded} initialProjectId={targetProjectId} />
  if (category === "notes") return <div className="orb-notes-list">{notes.map(note => <Link className="orb-note-link" href={`/notes/${note.id}`} key={note.id}><div><span>{note.tags.join(" · ")}</span><h2>{note.title}</h2><p>{note.description}</p></div><div className="orb-note-meta"><time>{note.date ?? "작성일 등록 예정"}</time><span aria-hidden="true">↗</span></div></Link>)}<a className="orb-blog-link" href="https://it-bookmark.tistory.com/" target="_blank" rel="noreferrer">학습 블로그의 원문 읽기 ↗</a></div>
  if (category === "skills") return <div className="orb-skills-groups">{[{label:"언어",names:["HTML5","CSS3","JavaScript","Java","Python"]},{label:"프레임워크",names:["Next.js"]},{label:"도구 · 환경 · 관심 분야",names:["Git","Linux","Security"]}].map(group => <section key={group.label}><h2>{group.label}</h2>{skills.filter(skill => group.names.includes(skill.name)).map(skill => <article className="orb-skill-entry" key={skill.name}><h3>{skill.name}</h3><p>{experience[skill.name]?.text ?? "기존 학습 목록에 등록된 기술입니다. 구체적인 활용 경험은 정리 중입니다."}</p><div>{experience[skill.name]?.projects?.map(id => <Link key={id} href={`/projects/${id}`}>관련 프로젝트 {id} ↗</Link>)}</div></article>)}</section>)}</div>
  if (category === "journey") return <div className="orb-journey"><ol>{history.map(item => <li key={item.year}><span>{item.year}</span><div><h2>{item.text}</h2><p>{item.year === "NEXT" ? "앞으로의 학습 방향" : "기존 이력에 기록된 교육 · 활동"}</p></div></li>)}</ol><section><p className="eyebrow">LEARNING ARCHIVE</p><h2>이어 가는 학습</h2><div className="orb-learning-tags">{skills.map(skill => <span key={skill.name}>{skill.name}</span>)}</div><p>이전 Learning의 기술 학습 목록을 보존했습니다. 실험 과제는 Projects의 Experiments 분류에서 이어집니다.</p></section></div>
  return null
}
