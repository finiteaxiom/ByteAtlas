import type { Entry, PlacedObject, Visit } from '../world/model';
import { isRecord } from './desktop';
export const CATALOG_CHANNEL = 'byteatlas:catalog';
export type ScanState = 'idle' | 'running' | 'paused' | 'cancelled' | 'complete' | 'unavailable' | 'interrupted';
export type Completeness = 'unknown' | 'partial' | 'complete' | 'unavailable';
export interface CatalogEntry extends Entry {
    worldId: string;
    relativePath: string;
    link: boolean;
    state: Completeness;
    fileCount: number;
    directoryCount: number;
    slot: number;
    groupKey: string;
}
export interface World {
    excludedPaths: string[];
    id: string;
    rootId: string;
    rootPath: string;
    name: string;
    state: ScanState;
    revision: number;
    discovered: number;
    errors: number;
    verifiedAt: string | null;
    view: SavedView | null;
}
export interface SavedView extends Visit {
    page: number;
    mode: 'capacity' | 'type';
    theme: 'warm' | 'dusk';
}
export interface ScenePage {
    world: World;
    directory: CatalogEntry;
    ancestors: CatalogEntry[];
    objects: PlacedObject[];
    page: number;
    pages: number;
    selected: CatalogEntry | null;
}
export interface EntryPage {
    entries: CatalogEntry[];
    next: string | null;
    complete: boolean;
}
export type CatalogRequest = {
    action: 'choose';
    requestId: string;
} | {
    action: 'create';
    requestId: string;
    token: string;
} | {
    action: 'worlds';
    requestId: string;
} | {
    action: 'scan';
    requestId: string;
    worldId: string;
    command: 'start' | 'pause' | 'resume' | 'cancel';
} | {
    action: 'remove';
    requestId: string;
    worldId: string;
} | {
    action: 'scene';
    requestId: string;
    worldId: string;
    directoryId: string;
    page: number;
    selectedId: string | null;
} | {
    action: 'search';
    requestId: string;
    worldId: string;
    query: string;
    cursor: string | null;
} | {
    action: 'members';
    requestId: string;
    worldId: string;
    directoryId: string;
    groupKey: string;
    query: string;
    cursor: string | null;
} | {
    action: 'resolve';
    requestId: string;
    worldId: string;
    entryId: string;
} | {
    action: 'saveView';
    requestId: string;
    worldId: string;
    view: SavedView;
} | {
    action: 'system';
    requestId: string;
    worldId: string;
    entryId: string;
    operation: 'open' | 'reveal' | 'copy';
};
export type CatalogData = World[] | World | ScenePage | EntryPage | {
    token: string;
    path: string;
} | {
    directoryId: string;
    page: number;
    entryId: string;
} | null;
export type CatalogResult = {
    ok: true;
    requestId: string;
    revision: number;
    data: CatalogData;
} | {
    ok: false;
    requestId: string;
    error: {
        code: string;
        message: string;
        retryable: boolean;
    };
};
const string = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !v.includes('\0');
const nullableId = (v: unknown): boolean => v === null || string(v);
const page = (v: unknown): boolean => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 1000000;
export function isSavedView(v: unknown): v is SavedView {
    if (!isRecord(v) || Object.keys(v).some(k => !['directoryId', 'selectedId', 'camera', 'page', 'mode', 'theme'].includes(k)) || !string(v.directoryId) || !nullableId(v.selectedId) || !page(v.page) || !['capacity', 'type'].includes(String(v.mode)) || !['warm', 'dusk'].includes(String(v.theme)))
        return false;
    const c = v.camera;
    return c === undefined || (isRecord(c) && Object.keys(c).length === 3 && ['position', 'target'].every(k => Array.isArray(c[k]) && c[k].length === 3 && c[k].every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000)) && typeof c.zoom === 'number' && c.zoom >= .45 && c.zoom <= 3.8);
}
export function isCatalogRequest(v: unknown): v is CatalogRequest {
    if (!isRecord(v) || !string(v.requestId, 100) || typeof v.action !== 'string')
        return false;
    const fields: Record<string, string[]> = { choose: [], create: ['token'], worlds: [], scan: ['worldId', 'command'], remove: ['worldId'], scene: ['worldId', 'directoryId', 'page', 'selectedId'], search: ['worldId', 'query', 'cursor'], members: ['worldId', 'directoryId', 'groupKey', 'query', 'cursor'], resolve: ['worldId', 'entryId'], saveView: ['worldId', 'view'], system: ['worldId', 'entryId', 'operation'] };
    const keys = fields[v.action];
    if (!keys || Object.keys(v).length !== keys.length + 2 || !keys.every(k => k in v))
        return false;
    for (const k of ['worldId', 'directoryId', 'entryId', 'token', 'groupKey'])
        if (k in v && !string(v[k]))
            return false;
    if ('query' in v && (typeof v.query !== 'string' || v.query.length > 256 || v.query.includes('\0')))
        return false;
    if ('cursor' in v && !nullableId(v.cursor))
        return false;
    if ('selectedId' in v && !nullableId(v.selectedId))
        return false;
    if ('page' in v && !page(v.page))
        return false;
    if ('command' in v && !['start', 'pause', 'resume', 'cancel'].includes(String(v.command)))
        return false;
    if ('operation' in v && !['open', 'reveal', 'copy'].includes(String(v.operation)))
        return false;
    return !('view' in v) || isSavedView(v.view);
}
export function catalogError(requestId: string, code = 'UNAVAILABLE'): CatalogResult {
    const messages: Record<string, string> = { BAD_REQUEST: '请求无效。', UNAVAILABLE: '后台暂不可用，请重试或重启应用。', NOT_FOUND: '条目已不存在，请重新扫描。', ROOT_UNAVAILABLE: '根目录不可用，已保留本地索引。', OUTSIDE_ROOT: '路径或链接不符合扫描范围，已拒绝操作。', BUSY: '当前任务繁忙，请稍后重试。', ACCESS_DENIED: '无法访问该条目，请检查权限后重新扫描。' };
    return { ok: false, requestId, error: { code, message: messages[code] ?? messages.UNAVAILABLE!, retryable: !['BAD_REQUEST', 'OUTSIDE_ROOT'].includes(code) } };
}
