"use server"

import { runJobEvals } from "@/server/evals/jobs"

export async function runJobEvalsAction() {
  return runJobEvals()
}
