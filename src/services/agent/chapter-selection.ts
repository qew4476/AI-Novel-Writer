/** Explicit numeric chapter selectors. Keep expansion bounded without silently dropping chapters. */
export function parseChapterSelection(selection: string): number[] | null {
  const normalized = selection.replace(/第|章|\s/g, '').replace(/到|至|[~～—]/g, '-')
    .replace(/[，、]|和|及/g, ',')
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(normalized)) return null
  const chapters = new Set<number>()
  for (const part of normalized.split(',')) {
    const [start, last] = part.split('-').map(Number)
    const end = last ?? start
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start >= 1000) return null
    for (let chapter = start; chapter <= end; chapter++) {
      chapters.add(chapter)
      if (chapters.size > 1000) return null
    }
  }
  return [...chapters].sort((a, b) => a - b)
}
