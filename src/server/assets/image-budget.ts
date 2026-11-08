export const IMAGE_PIXEL_LIMIT = 16_000_000
export const IMAGE_EDGE_LIMIT = 8192
export const LOGO_ANALYSIS_EDGE = 512
export function assertImageBudget(size: { width?: number; height?: number } | null) {
  if (!size?.width || !size.height || size.width > IMAGE_EDGE_LIMIT || size.height > IMAGE_EDGE_LIMIT || size.width * size.height > IMAGE_PIXEL_LIMIT) throw new Error("Image dimensions exceed the supported limit (16 megapixels, 8192px per edge).")
}
