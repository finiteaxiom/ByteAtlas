// Activity is metadata inference, never evidence of opening or reading a file.
export function activityScore(timestamp: string, path: string, now = Date.now()): number {
  const time=Date.parse(timestamp);
  if(!Number.isFinite(time)||time>now)return 0;
  const age=now-time;
  const weight=/(^|[\\/])(node_modules|dist|out|build|\.git)([\\/]|$)/i.test(path)?.2:1;
  return Math.ceil(Math.max(0,1-age/86400000)*60)/60*weight;
}
