import { changeDeletion } from "@/lib/cms/trash-route.server"
export const runtime = "nodejs"
export async function POST(request: Request, context: { params: Promise<{ kind: string }> }) {
  return changeDeletion(request, context.params, false)
}
