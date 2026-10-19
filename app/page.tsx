import { OrbExperience } from "@/components/OrbExperience"
import { getPortfolioContent } from "@/lib/cms/repository.server"
import { readAdminSession } from "@/lib/admin/session.server"

type HomePageProps = {
  searchParams: Promise<{ category?: string; view?: string }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { category, view } = await searchParams
  const [content, session] = await Promise.all([getPortfolioContent(), readAdminSession()])
  return <OrbExperience projects={content.projects} content={content} isAdmin={!!session} initialCategory={category} initialView={view} />
}
