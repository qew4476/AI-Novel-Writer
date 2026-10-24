/** Windows virtual drives can report zero when link counts are unavailable.
 * Keep rejecting known hard links; callers must still check file type and symlinks.
 */
export function hasSupportedProjectLinkCount(count: number | bigint): boolean {
  return count === 1 || count === 1n || process.platform === 'win32' && (count === 0 || count === 0n)
}
