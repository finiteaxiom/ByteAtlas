export function isTrustedRendererUrl(actual: string, expected: string): boolean {
  try {
    const source = new URL(actual);
    const target = new URL(expected);
    source.hash = '';
    target.hash = '';
    return source.href === target.href;
  } catch { return false; }
}
