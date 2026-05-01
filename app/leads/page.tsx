import { Suspense } from "react"

import { CleanlyWorkspacePage } from "../page"

export default function LeadsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <CleanlyWorkspacePage initialTab="leads" />
    </Suspense>
  )
}
