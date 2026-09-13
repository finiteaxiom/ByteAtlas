import { watch, type FSWatcher } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { checkedPath } from './path-safety';
import type { IndexStore } from './index-store';
import type { Scanner } from './scanner';

// Events are hints only. Non-recursive handles never subscribe through a directory link.
export class ChangeMonitor {
  private worldId?: string;
  private handles = new Map<string, FSWatcher>();
  private dirty = new Set<string>();
  private full = false;
  private stopped = false;
  private nextFull = Date.now() + 60000;
  private loop?: Promise<void>;
  constructor(private store: IndexStore, private scanner: Scanner, private interval = 500, private fullInterval = 60000) {}
  enable(worldId: string): void {
    if(this.worldId!==worldId) { if(this.worldId)this.store.monitorState(this.worldId,'stopped'); this.clear(); this.worldId=worldId; this.nextFull=Date.now()+this.fullInterval; }
    if(!this.loop) this.loop=this.run();
  }
  disable(worldId: string): void { if(this.worldId===worldId) { this.clear(); this.worldId=undefined; this.store.monitorState(worldId,'stopped'); } }
  // Internal diagnostics for bounded-listener verification. It intentionally
  // exposes counts only, never watched filesystem paths.
  status(): Readonly<{ worldId?: string; handles: number; dirtyDirectories: number; fullReconcile: boolean; stopped: boolean }> {
    return {worldId:this.worldId,handles:this.handles.size,dirtyDirectories:this.dirty.size,fullReconcile:this.full,stopped:this.stopped};
  }
  private clear(): void { for(const handle of this.handles.values())handle.close();this.handles.clear();this.dirty.clear();this.full=false; }
  invalidate(directoryId?: string): void {
    if(!directoryId || this.dirty.size>=128) {this.full=true;this.dirty.clear();}
    else if(!this.full)this.dirty.add(directoryId);
  }
  private async run(): Promise<void> {
    while(!this.stopped) {
      const id=this.worldId;
      if(id) try {
        const world=this.store.world(id);
        const directories=this.store.watchDirectories(id);
        const live=new Set(directories.map(d=>d.id));
        for(const [key,handle] of this.handles) if(!live.has(key)){handle.close();this.handles.delete(key);}
        let failed=false;
        for(const directory of directories) {
          if(this.stopped||this.worldId!==id)break;
          if(this.handles.has(directory.id))continue;
          try {
            const checked=await checkedPath(world.rootPath,directory.relativePath);
            if(this.stopped||this.worldId!==id)break;
            const handle=watch(checked.path,{recursive:false},()=>this.invalidate(directory.id));
            handle.on('error',()=>{handle.close();this.handles.delete(directory.id);this.invalidate();});
            this.handles.set(directory.id,handle);
          } catch {failed=true;}
        }
        if(this.worldId!==id)continue;
        this.store.monitorState(id,failed||directories.length>=256?'fallback':'watching');
        if(Date.now()>=this.nextFull) {this.full=true;this.nextFull=Date.now()+this.fullInterval;}
        if(!this.scanner.busy && !['paused','cancelled','idle'].includes(world.state) && (this.full||this.dirty.size)) {
          const ids=this.full?undefined:[...this.dirty];this.full=false;this.dirty.clear();
          await this.scanner.reconcile(id,ids);
          if(!ids) {for(const h of this.handles.values())h.close();this.handles.clear();this.nextFull=Date.now()+this.fullInterval;}
        }
      } catch { /* Keep cached data; periodic reconciliation will retry unavailable roots. */ }
      await delay(this.interval);
    }
  }
  async stop(): Promise<void> {this.stopped=true;this.clear();await this.scanner.stop();await this.loop;}
}
