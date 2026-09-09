import { contextBridge, ipcRenderer } from 'electron';
import { HEALTH_CHANNEL, type DesktopApi } from '../shared/contracts/desktop';

const api: DesktopApi = Object.freeze({
  getHealth: (...args: unknown[]) => ipcRenderer.invoke(HEALTH_CHANNEL, ...args),
  getRuntimeInfo: () => ({ contextIsolation: process.contextIsolated, sandbox: process.sandboxed })
});
contextBridge.exposeInMainWorld('byteAtlas', api);
