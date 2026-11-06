/**
 * CSV for spreadsheets. UTF-8 with a byte-order mark so Excel reads accents,
 * CRLF line ends, and formula injection neutralised: a cell from a posting or
 * email that starts with = + - @ is prefixed with ' so it stays text.
 */
export type Cell = string | number | boolean | Date | null | undefined

export function cell(value: Cell): string {
  if (value === null || value === undefined) return ""
  let text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
}
