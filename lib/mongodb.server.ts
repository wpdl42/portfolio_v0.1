import "server-only"
import { MongoClient } from "mongodb"
import { projectStorage } from "@/lib/projects/storage.mjs"

const globals = globalThis as typeof globalThis & { portfolioMongo?: Promise<MongoClient> }

export function connectPortfolioMongo() {
  if (!process.env.MONGODB_URI) return null
  if (!globals.portfolioMongo) {
    globals.portfolioMongo = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: projectStorage.readTimeoutMS,
      connectTimeoutMS: projectStorage.readTimeoutMS,
      socketTimeoutMS: projectStorage.readTimeoutMS,
    }).connect().catch(error => {
      globals.portfolioMongo = undefined
      throw error
    })
  }
  return globals.portfolioMongo
}
