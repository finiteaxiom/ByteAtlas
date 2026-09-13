import { describe, expect, it } from 'vitest';
import { describeStartupFailure, gpuProcessFailure, rendererLoadFailure, rendererProcessFailure } from '../src/main/startup-diagnostics';

describe('desktop startup diagnostics', () => {
  it('prioritizes a GPU process crash over the following renderer failure', () => {
    const gpu = gpuProcessFailure('crashed', -1073741515);
    const renderer = rendererProcessFailure('launch-failed', -1);
    expect(describeStartupFailure([gpu, renderer])).toMatchObject({
      code: 'GPU_PROCESS_EXITED',
      detail: 'GPU process crashed; exit code -1073741515'
    });
  });

  it('retains bounded renderer load diagnostics without a filesystem path', () => {
    const failure = rendererLoadFailure(-2, 'ERR_FAILED');
    expect(failure).toMatchObject({ code: 'RENDERER_LOAD_FAILED', detail: 'Renderer load failed (-2): ERR_FAILED' });
    expect(failure.detail).not.toMatch(/[A-Z]:\\/i);
  });
});
