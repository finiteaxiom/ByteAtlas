import { utilityProcess, type UtilityProcess } from 'electron';
import { isBackendHealth, isRecord, type BackendHealth } from '../shared/contracts/desktop';

export class BackendHost {
  private child?: UtilityProcess;
  private health?: BackendHealth;
  private exited?: Promise<number>;

  start(entryPath: string, dataDirectory: string): Promise<BackendHealth> {
    if (this.child) return Promise.reject(new Error('BACKEND_ALREADY_STARTED'));
    const child = utilityProcess.fork(entryPath, [dataDirectory], { serviceName: 'ByteAtlas Index', stdio: 'ignore' });
    this.child = child;
    this.exited = new Promise((resolve) => child.once('exit', (code) => {
      this.child = undefined;
      this.health = undefined;
      resolve(code);
    }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); child.kill(); reject(new Error('BACKEND_START_TIMEOUT')); }, 15000);
      const onExit = (): void => { cleanup(); reject(new Error('BACKEND_START_FAILED')); };
      const onMessage = (message: unknown): void => {
        if (!isRecord(message)) return;
        if (message.type === 'ready' && isBackendHealth(message.health)) {
          this.health = message.health;
          cleanup();
          resolve(message.health);
        } else if (message.type === 'failed') {
          cleanup();
          reject(new Error('INDEX_START_FAILED'));
        }
      };
      const cleanup = (): void => {
        clearTimeout(timeout);
        child.removeListener('message', onMessage);
        child.removeListener('exit', onExit);
      };
      child.on('message', onMessage);
      child.once('exit', onExit);
    });
  }

  getHealth(): BackendHealth | undefined { return this.health; }

  async stop(): Promise<number> {
    if (!this.child) return this.exited ? await this.exited : 0;
    const child = this.child;
    child.postMessage({ type: 'shutdown' });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<number>((resolve) => {
      timer = setTimeout(() => { child.kill(); resolve(-1); }, 5000);
    });
    const code = await Promise.race([this.exited!, timeout]);
    clearTimeout(timer);
    return code;
  }
}
