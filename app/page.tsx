import { OrbExperience } from "@/components/OrbExperience"
import { getProjects } from "@/lib/projects.server"

type HomePageProps = {
  searchParams: Promise<{ category?: string; view?: string }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { category, view } = await searchParams
  const projects = await getProjects()
  return <OrbExperience projects={projects} initialCategory={category} initialView={view} />
}
