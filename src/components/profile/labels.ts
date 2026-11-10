export const KIND_LABELS = {
  experience: "Experience",
  project: "Projects",
  skill: "Skills",
  education: "Education",
  certification: "Certifications",
  language: "Languages",
  achievement: "Achievements",
  other: "Other",
} as const

export const KIND_SINGULAR: Record<string, string> = {
  experience: "Experience",
  project: "Project",
  skill: "Skill cluster",
  education: "Education",
  certification: "Certification",
  language: "Languages",
  achievement: "Achievement",
  other: "Other",
}

export const STATUS_LABELS: Record<string, string> = {
  verified: "Verified",
  needs_review: "Needs review",
  archived: "Archived",
}

/** Keys of the `profileLabels.kind*` messages; the English maps above stay for code that isn't UI. */
export type Kind = keyof typeof KIND_LABELS
