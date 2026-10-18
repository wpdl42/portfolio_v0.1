import "server-only"
import { MongoClient } from "mongodb"
import { cache } from "react"
import { projects as fallback, type Project } from "@/lib/portfolio"

const globals = globalThis as typeof globalThis & { portfolioMongo?: Promise<MongoClient> }
function connect() {
  if (!process.env.MONGODB_URI) return null
  if (!globals.portfolioMongo) {
    globals.portfolioMongo = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 5000 }).connect().catch(error => { globals.portfolioMongo = undefined; throw error })
  }
  return globals.portfolioMongo
}

// Only explicitly public records are exposed; credentials and MongoDB metadata stay server-side.
export const getProjects = cache(async (): Promise<Project[]> => {
  try {
    const connection = connect()
    if (!connection) return fallback
    const client = await connection
    const records = await client.db(process.env.MONGODB_DB ?? "portfolio").collection("projects").find({ visibility: "public" }, { projection: { _id: 0, createdAt: 0, updatedAt: 0 }, maxTimeMS: 5000 }).limit(500).toArray()
    const combined = [...fallback]
    for (const record of records) {
      if (!Number.isSafeInteger(record.id) || typeof record.title !== "string" || typeof record.description !== "string" || typeof record.category !== "string" || typeof record.period !== "string" || typeof record.role !== "string") continue
      const project: Project = { id: record.id, title: record.title, description: record.description, category: record.category, role: record.role, period: record.period, accent: record.accent ?? "blue", visibility: "public", ...(record.slug ? { slug: record.slug } : {}), ...(record.link ? { link: record.link } : {}), ...(record.order !== undefined ? { order: record.order } : {}), ...(record.thumbnail ? { thumbnail: record.thumbnail } : {}), ...(record.keywords ? { keywords: record.keywords } : {}), ...(record.detail ? { detail: record.detail } : {}), ...(record.status ? { status: record.status } : {}) }
      const index = combined.findIndex(item => item.id === project.id || (item.slug && item.slug === project.slug))
      if (index >= 0) combined[index] = project
      else combined.push(project)
    }
    return combined.sort((a,b) => (a.order ?? a.id) - (b.order ?? b.id))
  } catch {
    console.warn("Projects: MongoDB is unavailable; using the local project catalog.")
    return fallback
  }
})
