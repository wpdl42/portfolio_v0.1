import { notFound } from "next/navigation"
import { ProjectDetailTabs } from "@/components/ProjectDetailTabs"
import { ProjectArtwork } from "@/components/ProjectArtwork"
import { getProjectDetail } from "@/lib/project-details"
import { findProject } from "@/lib/cms/repository.server"
import { readAdminSession } from "@/lib/admin/session.server"
import { ExploreBackLink } from "@/components/ExploreBackLink"
type Props = { params: Promise<{ id: string }> }
export async function generateMetadata({ params }: Props) {
  const project = await findProject((await params).id, !!(await readAdminSession()))
  return { title: project?.title ?? "프로젝트를 찾을 수 없습니다", description: project?.description, ...(project?.visibility === "private" ? { robots: { index: false, follow: false } } : {}) }
}
export default async function ProjectDetailPage({ params }: Props) {
  const project = await findProject((await params).id, !!(await readAdminSession()))
  if (!project) notFound()
  const detail = getProjectDetail(project)
  return <div className={`orb-detail-page ${project.kind === "experiment" ? "orb-detail-experiment" : ""}`}><div className="orb-detail-shell">
    <ExploreBackLink category="projects" />
    {project.visibility === "private" && <p className="cms-private-notice">관리자 전용 비공개 미리보기</p>}
    <header className="orb-detail-heading"><div><p>PROJECT {String(project.id).padStart(2,"0")} / {project.category}{project.teamType ? ` · ${project.teamType === "team" ? "팀" : "개인"}` : ""}</p><h1>{project.title}</h1></div><span>{project.period}</span></header>
    <p className="orb-detail-description">{project.description}</p><div className="orb-detail-tags">{detail.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
    <div className={`orb-detail-hero orb-detail-hero-${project.accent}`}><ProjectArtwork project={project} /></div>
    <ProjectDetailTabs project={project} detail={detail} />
    {project.link && <a href={project.link} className="orb-detail-external" target="_blank" rel="noreferrer">실제 프로젝트 방문하기 ↗</a>}
    {project.githubLink && <a href={project.githubLink} className="orb-detail-external" target="_blank" rel="noreferrer">GitHub 코드 보기 ↗</a>}
  </div></div>
}
