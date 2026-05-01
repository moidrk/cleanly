import { Suspense } from "react"

import { CleanlyWorkspacePage } from "../page"

export default function WorkspacePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <CleanlyWorkspacePage initialTab="workspace" />
    </Suspense>
  )
}
