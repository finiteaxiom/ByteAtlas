import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCatalog } from '../src/main/catalog-ipc';
import type { BackendHost } from '../src/main/backend-host';
import type { BrowserWindow } from 'electron';
const mocks = vi.hoisted(() => ({ handler: undefined as undefined | ((event: unknown, ...args: unknown[]) => Promise<any>), choose: vi.fn(), open: vi.fn(), reveal: vi.fn(), copy: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: (_name: string, handler: typeof mocks.handler) => { mocks.handler = handler; } }, dialog: { showOpenDialog: mocks.choose }, shell: { openPath: mocks.open, showItemInFolder: mocks.reveal }, clipboard: { writeText: mocks.copy } }));
const url = 'file:///C:/app/index.html';
function setup() { const sender = { mainFrame: { url } }, event = { sender, senderFrame: sender.mainFrame }, call = vi.fn().mockResolvedValue({ id: 'world', revision: 1 }); registerCatalog({ call } as unknown as BackendHost, () => ({ webContents: sender }) as BrowserWindow, url); return { event, call, invoke: (request: unknown) => mocks.handler!(event, request) }; }
beforeEach(() => { vi.clearAllMocks(); });
describe('native selection authorization and IPC origin', () => {
    it('does not create a world when the native picker is cancelled', async () => { const { invoke, call } = setup(); mocks.choose.mockResolvedValue({ canceled: true, filePaths: [] }); expect((await invoke({ action: 'choose', requestId: '1' })).data).toBeNull(); expect(call).not.toHaveBeenCalled(); });
    it('accepts only a single use token from the native picker', async () => { const { invoke, call } = setup(); mocks.choose.mockResolvedValue({ canceled: false, filePaths: ['C:\\fixture'] }); const result = await invoke({ action: 'choose', requestId: '1' }); expect(result.data.token).toBeTruthy(); expect((await invoke({ action: 'create', requestId: '2', token: 'invented' })).ok).toBe(false); expect((await invoke({ action: 'create', requestId: '3', token: result.data.token })).ok).toBe(true); expect(call).toHaveBeenCalledWith({ action: 'createTrusted', path: 'C:\\fixture' }); expect((await invoke({ action: 'create', requestId: '4', token: result.data.token })).ok).toBe(false); });
    it('rejects foreign frames and arbitrary path or action payloads', async () => { const { event, call, invoke } = setup(); expect((await mocks.handler!({ ...event, senderFrame: { url: 'https://example.com' } }, { action: 'worlds', requestId: '1' })).ok).toBe(false); for (const request of [{ action: 'system', worldId: 'w', entryId: 'e', operation: 'exec', requestId: '2' }, { action: 'system', worldId: 'w', entryId: 'e', operation: 'open', path: 'C:\\other', requestId: '3' }])
        expect((await invoke(request)).ok).toBe(false); expect(call).not.toHaveBeenCalled(); });
});
