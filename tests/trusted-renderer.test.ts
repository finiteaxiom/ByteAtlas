import { expect, it } from 'vitest';
import { isTrustedRendererUrl } from '../src/main/trusted-renderer';

it('normalizes the dev root slash and permits only local document fragments', () => {
  expect(isTrustedRendererUrl('http://localhost:5173/#home', 'http://localhost:5173')).toBe(true);
  expect(isTrustedRendererUrl('file:///D:/app/index.html#home', 'file:///D:/app/index.html')).toBe(true);
});

it('rejects other origins, paths, queries and invalid URLs', () => {
  for (const url of ['https://example.com/', 'http://localhost:5174/', 'http://localhost:5173/other', 'http://localhost:5173/?exec=1', 'invalid']) {
    expect(isTrustedRendererUrl(url, 'http://localhost:5173')).toBe(false);
  }
});
