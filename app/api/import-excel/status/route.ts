import { type NextRequest, NextResponse } from "next/server"
import { importJobs } from "../start/route"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get("jobId")

  if (!jobId) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 })
  }

  const job = importJobs.get(jobId)

  if (!job) {
    return NextResponse.json({ error: "Job not found or expired" }, { status: 404 })
  }

  // Simulate progress updates for demo purposes
  // In a real app, this would be updated by the actual processing function
  if (job.status === "processing" && job.progress < 95) {
    // Increment progress by a random amount between 5-15%
    const increment = Math.floor(Math.random() * 10) + 5
    const newProgress = Math.min(job.progress + increment, 95)

    importJobs.set(jobId, {
      ...job,
      progress: newProgress,
      updatedAt: new Date(),
    })
  }

  return NextResponse.json({
    jobId,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
    error: job.error,
  })
}
