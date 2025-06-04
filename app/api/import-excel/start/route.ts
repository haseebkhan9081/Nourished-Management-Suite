import { type NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"

// In-memory job store (in production, use Redis or a database)
export const importJobs = new Map<
  string,
  {
    status: "queued" | "processing" | "completed" | "failed"
    progress: number
    data: any
    error?: string
    createdAt: Date
    updatedAt: Date
    result?: any
  }
>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.data || !Array.isArray(body.data)) {
      return NextResponse.json({ error: "Invalid request body. Expected 'data' array." }, { status: 400 })
    }

    // Generate a unique job ID
    const jobId = randomUUID()

    // Store the job in our in-memory store
    importJobs.set(jobId, {
      status: "queued",
      progress: 0,
      data: body,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Start processing in the background (don't await)
    processImportJob(jobId)

    // Return immediately with the job ID
    return NextResponse.json({
      success: true,
      message: "Import job started",
      jobId,
    })
  } catch (error) {
    console.error("Error starting import job:", error)
    return NextResponse.json(
      {
        error: "Failed to start import job",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// Background processing function
async function processImportJob(jobId: string) {
  const job = importJobs.get(jobId)
  if (!job) return

  try {
    // Update status to processing
    importJobs.set(jobId, {
      ...job,
      status: "processing",
      progress: 5,
      updatedAt: new Date(),
    })

    // Make the actual import request to our existing endpoint
    const response = await fetch(new URL("/api/import-excel", process.env.VERCEL_URL || "http://localhost:3000"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(job.data),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || "Import failed")
    }

    // Update job with success result
    importJobs.set(jobId, {
      ...job,
      status: "completed",
      progress: 100,
      result,
      updatedAt: new Date(),
    })
  } catch (error) {
    console.error(`Error processing import job ${jobId}:`, error)

    // Update job with error
    importJobs.set(jobId, {
      ...job,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      updatedAt: new Date(),
    })
  }

  // Clean up old jobs after 30 minutes
  setTimeout(
    () => {
      if (importJobs.has(jobId)) {
        importJobs.delete(jobId)
      }
    },
    30 * 60 * 1000,
  )
}
