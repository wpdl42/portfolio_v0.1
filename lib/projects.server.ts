import "server-only"
import { getPortfolioContent } from "@/lib/cms/repository.server"
export async function getProjects() { return (await getPortfolioContent()).projects }
