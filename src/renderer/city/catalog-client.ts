import type { CatalogRequest, CatalogData } from '../../shared/contracts/catalog';
type WithoutId<T> = T extends unknown ? Omit<T, 'requestId'> : never;
export type Request = WithoutId<CatalogRequest>;
let sequence = 0;
export async function catalog<T = CatalogData>(request: Request): Promise<T> {
    const requestId = `ui-${++sequence}`;
    const result = await window.byteAtlas.catalog({ ...request, requestId } as CatalogRequest);
    if (result.requestId !== requestId)
        throw Error('响应已过期，请重试。');
    if (!result.ok)
        throw Error(result.error.message);
    return result.data as T;
}
