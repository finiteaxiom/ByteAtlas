import { CATALOG_CHANNEL } from '../shared/contracts/catalog';
import { contextBridge, ipcRenderer } from 'electron';
import { HEALTH_CHANNEL, type DesktopApi } from '../shared/contracts/desktop';

const api: DesktopApi = Object.freeze({
  catalog: (request: import('../shared/contracts/catalog').CatalogRequest) => ipcRenderer.invoke(CATALOG_CHANNEL, request),
  getHealth: (...args: unknown[]) => ipcRenderer.invoke(HEALTH_CHANNEL, ...args),
  getRuntimeInfo: () => ({ contextIsolation: process.contextIsolated, sandbox: process.sandboxed })
});
contextBridge.exposeInMainWorld('byteAtlas', api);
