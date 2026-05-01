import { Suspense } from "react"

import { CleanlyWorkspacePage } from "../page"

export default function WeeklyPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <CleanlyWorkspacePage initialTab="weekly" />
    </Suspense>
  )
}
