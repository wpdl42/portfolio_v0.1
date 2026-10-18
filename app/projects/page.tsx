import { redirect } from "next/navigation"

export default function ProjectsPage() {
  redirect("/?category=projects&view=expanded")
}
