export function displayMessageBoundary(
  rawBoundary: number,
  sourceCounts: readonly number[],
): number {
  if (rawBoundary <= 0) return 0;
  let sourceCount = 0;
  for (let index = 0; index < sourceCounts.length; index++) {
    sourceCount += sourceCounts[index];
    if (sourceCount >= rawBoundary) return index + 1;
  }
  return sourceCounts.length;
}
