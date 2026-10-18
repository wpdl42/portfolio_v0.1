import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ProjectDetailTabs } from "@/components/ProjectDetailTabs"
import { ProjectArtwork } from "@/components/ProjectArtwork"
import { getProjectDetail } from "@/lib/project-details"
import { getProjects } from "@/lib/projects.server"
import { connection } from "next/server"
import { projects, assignments } from "@/lib/portfolio"
import { ExploreBackLink } from "@/components/ExploreBackLink"

type ProjectDetailProps = { params: Promise<{ id: string }> }

export function generateStaticParams() {
  return [...projects.map((project) => ({ id: String(project.id) })), ...assignments.map(item => ({ id: `experiment-${item.number}` }))]
}

export async function generateMetadata({ params }: ProjectDetailProps): Promise<Metadata> {
  const { id } = await params
  await connection()
  const projects = await getProjects()
  const project = projects.find((item) => String(item.id) === id)
  const experiment = assignments.find(item => `experiment-${item.number}` === id)
  return { title: project?.title ?? experiment?.title ?? "프로젝트를 찾을 수 없습니다", description: project?.description ?? experiment?.description }
}

export default async function ProjectDetailPage({ params }: ProjectDetailProps) {
  const { id } = await params
  await connection()
  const projects = await getProjects()
  const project = projects.find((item) => String(item.id) === id)
  const experiment = assignments.find(item => `experiment-${item.number}` === id)
  if (!project && experiment) return <article className="orb-detail-page orb-detail-experiment"><div className="orb-detail-shell"><ExploreBackLink category="projects" /><header className="orb-detail-heading"><div><p>EXPERIMENT {experiment.number} / 수업 · 실험 작업</p><h1>{experiment.title}</h1></div></header><p className="orb-detail-description">{experiment.description}</p><section><h2>작업 기록</h2><p>기존 과제 목록에 기록된 실험 작업입니다. 추가 기술 설명과 작업 과정은 등록 예정입니다.</p></section></div></article>
  if (!project) notFound()
  const detail = getProjectDetail(project)

  return <div className="orb-detail-page">
    <div className="orb-detail-shell">
      <ExploreBackLink category="projects" />
      <header className="orb-detail-heading">
        <div><p>PROJECT {String(project.id).padStart(2, "0")} / {project.category}</p><h1>{project.title}</h1></div>
        <span>{project.period}</span>
      </header>
      <p className="orb-detail-description">{project.description}</p>
      <div className="orb-detail-tags">{detail.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className={`orb-detail-hero orb-detail-hero-${project.accent}`}><ProjectArtwork project={project} /></div>
      <ProjectDetailTabs project={project} detail={detail} />
      {project.link && <a href={project.link} className="orb-detail-external" target="_blank" rel="noreferrer">실제 프로젝트 방문하기 ↗</a>}
    </div>
  </div>
}
