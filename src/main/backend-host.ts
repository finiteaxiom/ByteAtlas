import { utilityProcess, type UtilityProcess } from 'electron';
import { isBackendHealth, isRecord, type BackendHealth } from '../shared/contracts/desktop';

export class BackendHost {
  private child?: UtilityProcess;
  private health?: BackendHealth;
  private exited?: Promise<number>;
  private sequence = 0;
  private location?: [string,string];
  private restarting?: Promise<BackendHealth>;
  private stopped = false;
  private retryAt = 0;
  private resumeWorld?: string;
  private recoveringRequests = 0;
  private pending = new Map<number, {resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  call(request: unknown): Promise<unknown> {
    if(this.stopped)return Promise.reject(Error('UNAVAILABLE'));
    if((!this.child || (this.restarting && !this.health)) && this.location && !this.stopped) {
      if(this.recoveringRequests>=32)return Promise.reject(Error('BUSY'));
      if(!this.restarting && Date.now()>=this.retryAt) {
        this.retryAt=Date.now()+10000;
        this.restarting=this.start(...this.location).then(async health=>{
          if(this.resumeWorld)await this.call({action:'scan',worldId:this.resumeWorld,command:'start',requestId:'backend-recovery'});
          return health;
        }).finally(()=>{this.restarting=undefined;});
      }
      if(!this.restarting)return Promise.reject(Error('UNAVAILABLE'));
      this.recoveringRequests++;
      return this.restarting.then(()=>this.call(request)).finally(()=>{this.recoveringRequests--;});
    }
    if(!this.child || !this.health)return Promise.reject(Error('UNAVAILABLE'));
    if(isRecord(request)&&request.action==='scan'&&typeof request.worldId==='string') {
      if(request.command==='start'||request.command==='resume')this.resumeWorld=request.worldId;
      else if(this.resumeWorld===request.worldId)this.resumeWorld=undefined;
    }
    if(isRecord(request)&&request.action==='remove'&&request.worldId===this.resumeWorld)this.resumeWorld=undefined;
    if(this.pending.size>=32)return Promise.reject(Error('BUSY'));
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('UNAVAILABLE'));},15000);
      this.pending.set(id,{resolve,reject,timer});this.child!.postMessage({type:'catalog',id,request});
    });
  }

  start(entryPath: string, dataDirectory: string): Promise<BackendHealth> {
    this.location=[entryPath,dataDirectory];
    if (this.child) return Promise.reject(new Error('BACKEND_ALREADY_STARTED'));
    const child = utilityProcess.fork(entryPath, [dataDirectory], { serviceName: 'ByteAtlas Index', stdio: 'ignore' });
    this.child = child;
    child.on('message',(message:unknown)=>{
      if(!isRecord(message)||message.type!=='reply'||typeof message.id!=='number')return;
      const pending=this.pending.get(message.id);if(!pending)return;
      clearTimeout(pending.timer);this.pending.delete(message.id);
      if(typeof message.error==='string')pending.reject(Error(message.error));else pending.resolve(message.data);
    });
    this.exited = new Promise((resolve) => child.once('exit', (code) => {
      this.child = undefined;
      this.health = undefined;
      for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(Error('UNAVAILABLE'));}this.pending.clear();
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
  getProcessId(): number | undefined { return this.child?.pid; }

  async stop(): Promise<number> {
    this.stopped=true;
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
