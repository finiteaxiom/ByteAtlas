export type StartupFailure = {
  code: 'GPU_PROCESS_EXITED' | 'RENDERER_PROCESS_GONE' | 'RENDERER_LOAD_FAILED';
  detail: string;
  title: string;
  message: string;
};

export function gpuProcessFailure(reason: string, exitCode: number): StartupFailure {
  return {
    code: 'GPU_PROCESS_EXITED',
    detail: `GPU process ${reason}; exit code ${exitCode}`,
    title: '图形进程无法启动',
    message: '硬件图形进程未能启动，城市沙盘无法加载。请检查 Windows 图形驱动和运行库后重试。'
  };
}

export function rendererProcessFailure(reason: string, exitCode: number): StartupFailure {
  return {
    code: 'RENDERER_PROCESS_GONE',
    detail: `Renderer process ${reason}; exit code ${exitCode}`,
    title: '应用界面无法启动',
    message: '应用界面进程意外退出。目录扫描没有开始，源文件没有被修改。请查看诊断信息后重试。'
  };
}

export function rendererLoadFailure(errorCode: number, description: string): StartupFailure {
  return {
    code: 'RENDERER_LOAD_FAILED',
    detail: `Renderer load failed (${errorCode}): ${description}`,
    title: '应用界面加载失败',
    message: '应用界面未能加载。目录扫描没有开始，源文件没有被修改。请查看诊断信息后重试。'
  };
}

export function describeStartupFailure(failures: readonly StartupFailure[]): StartupFailure | undefined {
  return failures.find(failure => failure.code === 'GPU_PROCESS_EXITED') ?? failures.at(-1);
}
