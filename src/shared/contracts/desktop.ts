export const HEALTH_CHANNEL = 'byteatlas:health';

export interface BackendHealth {
  schemaVersion: number;
  sqliteVersion: string;
  bootCount: number;
  integrity: 'ok';
}

export type HealthResult =
  | { ok: true; data: BackendHealth; revision: 1 }
  | { ok: false; error: { code: 'BAD_REQUEST' | 'UNAVAILABLE'; message: string; retryable: boolean } };

export interface DesktopApi {
  catalog(request: import('./catalog').CatalogRequest): Promise<import('./catalog').CatalogResult>;
  getHealth(): Promise<HealthResult>;
  getRuntimeInfo(): { contextIsolation: boolean; sandbox: boolean };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBackendHealth(value: unknown): value is BackendHealth {
  return isRecord(value) && value.schemaVersion === 2 &&
    typeof value.sqliteVersion === 'string' && value.sqliteVersion.length < 64 &&
    Number.isSafeInteger(value.bootCount) && (value.bootCount as number) > 0 && value.integrity === 'ok';
}

export type BackendRequest = { type: 'shutdown' };
export function isBackendRequest(value: unknown): value is BackendRequest {
  return isRecord(value) && Object.keys(value).length === 1 && value.type === 'shutdown';
}

export function isEmptyRequest(args: unknown[]): boolean {
  return args.length === 0;
}
