import { dialog, ipcMain, shell, clipboard, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { CATALOG_CHANNEL, isCatalogRequest, catalogError, type CatalogResult, type CatalogData } from '../shared/contracts/catalog';
import { checkedPath } from '../backend/path-safety';
import { isTrustedRendererUrl } from './trusted-renderer';
import type { BackendHost } from './backend-host';
export function registerCatalog(backend: BackendHost, getWindow: () => BrowserWindow | undefined, url: string): void {
    let chosen: {
        token: string;
        path: string;
        at: number;
    } | undefined;
    let choosing = false;
    ipcMain.handle(CATALOG_CHANNEL, async (event, ...args: unknown[]): Promise<CatalogResult> => {
        const window = getWindow(), source = event.senderFrame, request = args[0];
        if (!window || event.sender !== window.webContents || !source || source !== event.sender.mainFrame || !isTrustedRendererUrl(source.url, url) || args.length !== 1 || !isCatalogRequest(request))
            return catalogError('', 'BAD_REQUEST');
        try {
            let data: unknown;
            if (request.action === 'choose') {
                if (choosing)
                    throw Error('BUSY');
                choosing = true;
                try {
                    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: '选择文件夹，生成城市' });
                    if (result.canceled || !result.filePaths[0]) {
                        chosen = undefined;
                        data = null;
                    }
                    else {
                        chosen = { token: randomUUID(), path: result.filePaths[0], at: Date.now() };
                        data = { token: chosen.token, path: chosen.path };
                    }
                }
                finally {
                    choosing = false;
                }
            }
            else if (request.action === 'create') {
                if (!chosen || chosen.token !== request.token || Date.now() - chosen.at > 600000)
                    throw Error('BAD_REQUEST');
                const path = chosen.path;
                chosen = undefined;
                data = await backend.call({ action: 'createTrusted', path });
            }
            else if (request.action === 'system') {
                const trusted = await backend.call(request) as {
                    root: string;
                    relativePath: string;
                    link: boolean;
                };
                const current = await checkedPath(trusted.root, trusted.relativePath, true);
                if (request.operation === 'open') {
                    if (current.link)
                        throw Error('OUTSIDE_ROOT');
                    const error = await shell.openPath(current.path);
                    if (error)
                        throw Error('ACCESS_DENIED');
                }
                else if (request.operation === 'reveal')
                    shell.showItemInFolder(current.path);
                else
                    await clipboard.writeText(current.path);
                data = null;
            }
            else
                data = await backend.call(request);
            const revision = data && typeof data === 'object' && 'world' in data ? (data as {
                world: {
                    revision: number;
                };
            }).world.revision : data && typeof data === 'object' && 'revision' in data ? Number(data.revision) : 0;
            return { ok: true, requestId: request.requestId, revision, data: data as CatalogData };
        }
        catch (error) {
            const code = error instanceof Error ? error.message : 'UNAVAILABLE';
            return catalogError(request.requestId, ['BAD_REQUEST', 'BUSY', 'ROOT_UNAVAILABLE', 'OUTSIDE_ROOT', 'NOT_FOUND'].includes(code) ? code : code === 'ENOENT' ? 'NOT_FOUND' : code === 'EACCES' ? 'ACCESS_DENIED' : 'UNAVAILABLE');
        }
    });
}
