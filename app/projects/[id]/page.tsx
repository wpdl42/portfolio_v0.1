import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { projects } from "@/lib/portfolio"

type ProjectDetailProps = {
  params: Promise<{ id: string }>
}

export function generateStaticParams() {
  return projects.map((project) => ({ id: String(project.id) }))
}

export async function generateMetadata({ params }: ProjectDetailProps): Promise<Metadata> {
  const { id } = await params
  const project = projects.find((item) => String(item.id) === id)

  return {
    title: project?.title ?? "프로젝트를 찾을 수 없습니다",
    description: project?.description,
  }
}

export default async function ProjectDetailPage({ params }: ProjectDetailProps) {
  const { id } = await params
  const project = projects.find((item) => String(item.id) === id)

  if (!project) notFound()

  return (
    <div className="section-shell inner-page project-detail">
      <Link href="/projects" className="text-link project-detail-back">
        ← 프로젝트 목록
      </Link>

      <header className="project-detail-heading">
        <p className="eyebrow">PROJECT {String(project.id).padStart(2, "0")}</p>
        <div className="project-detail-title">
          <h1>{project.title}</h1>
          <span className="status-badge">{project.status}</span>
        </div>
        <p className="project-category">{project.category}</p>
      </header>

      <div className={`project-detail-visual accent-${project.accent}`} aria-hidden="true">
        <div className="project-preview">
          <span>{String(project.id).padStart(2, "0")}</span>
          <div className="preview-window">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>

      <div className="project-detail-content">
        <section>
          <p className="eyebrow">OVERVIEW</p>
          <h2>프로젝트 소개</h2>
          <p>{project.description}</p>
          {project.link && (
            <a href={project.link} target="_blank" rel="noreferrer" className="text-link">
              프로젝트 방문하기 ↗
            </a>
          )}
        </section>

        <dl className="project-detail-facts">
          <div>
            <dt>기간</dt>
            <dd>{project.period}</dd>
          </div>
          <div>
            <dt>역할</dt>
            <dd>{project.role}</dd>
          </div>
          <div>
            <dt>진행 상태</dt>
            <dd>{project.status}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
