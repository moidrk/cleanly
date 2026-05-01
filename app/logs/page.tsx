import { Suspense } from "react"

import { CleanlyWorkspacePage } from "../page"

export default function LogsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <CleanlyWorkspacePage initialTab="logs" />
    </Suspense>
  )
}
