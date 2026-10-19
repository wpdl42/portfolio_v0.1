import type { CSSProperties } from "react"
import type { Project } from "@/lib/portfolio"
import { getProjectArtwork } from "@/lib/projects/catalog"

export function ProjectArtwork({ project }: { project: Project }) {
  const artwork = getProjectArtwork(project)
  return (
    <div
      className="project-artwork"
      data-artwork={artwork.type}
      role="img"
      aria-label={artwork.label}
      style={{ "--project-artwork": `url("${artwork.path}")` } as CSSProperties}
    >
      <span>{artwork.caption}</span>
    </div>
  )
}
