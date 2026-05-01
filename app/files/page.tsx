import { Suspense } from "react"

import { CleanlyWorkspacePage } from "../page"

export default function FilesPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <CleanlyWorkspacePage initialTab="files" />
    </Suspense>
  )
}
