import "server-only"
import { cache } from "react"
import { projects as fallback, type Project } from "@/lib/portfolio"
import { connectPortfolioMongo } from "@/lib/mongodb.server"
import { mergeProjectRecords } from "@/lib/projects/records"
import { getProjectDatabaseName, projectStorage } from "@/lib/projects/storage.mjs"

// Only explicitly public records are exposed; credentials and MongoDB metadata stay server-side.
export const getProjects = cache(async (): Promise<Project[]> => {
  try {
    const connection = connectPortfolioMongo()
    if (!connection) return fallback
    const client = await connection
    const records = await client.db(getProjectDatabaseName()).collection(projectStorage.collection)
      .find({ visibility: "public" }, {
        projection: { _id: 0, createdAt: 0, updatedAt: 0 },
        maxTimeMS: projectStorage.readTimeoutMS,
      }).limit(projectStorage.readLimit).toArray()
    return mergeProjectRecords(fallback, records)
  } catch {
    console.warn("Projects: MongoDB is unavailable; using the local project catalog.")
    return fallback
  }
})
