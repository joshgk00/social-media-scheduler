import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

// Mock logger before any imports that use it
vi.mock('@sms/shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

function createMockProcess(): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess;
  const stderrEmitter = new EventEmitter();
  Object.defineProperty(proc, 'stderr', { value: stderrEmitter, writable: false });
  (proc as Record<string, unknown>).kill = vi.fn();
  return proc;
}

describe('transcodeVideo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSpawn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spawns ffmpeg with correct H.264 720p arguments', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const { transcodeVideo } = await import('../transcode.service.js');
    const promise = transcodeVideo('/tmp/input.mov', '/tmp/output.mp4');

    expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', [
      '-i', '/tmp/input.mov',
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      '/tmp/output.mp4',
    ]);

    proc.emit('close', 0);
    await promise;
  });

  it('resolves when ffmpeg exits with code 0', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const { transcodeVideo } = await import('../transcode.service.js');
    const promise = transcodeVideo('/tmp/input.mov', '/tmp/output.mp4');

    proc.emit('close', 0);
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects with error including last 500 chars of stderr when ffmpeg exits non-zero', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const { transcodeVideo } = await import('../transcode.service.js');
    const promise = transcodeVideo('/tmp/input.mov', '/tmp/output.mp4');

    const longStderr = 'E'.repeat(600);
    (proc.stderr as EventEmitter).emit('data', Buffer.from(longStderr));
    proc.emit('close', 1);

    await expect(promise).rejects.toThrow(/ffmpeg exited with code 1/);
    // Should contain exactly 500 chars of stderr (tail of 600)
    try {
      await promise;
    } catch (err) {
      expect((err as Error).message).toContain('E'.repeat(500));
      expect((err as Error).message.length).toBeLessThan(600 + 50);
    }
  });

  it('kills the process and rejects with timeout error after TRANSCODE_TIMEOUT_MS (5 min)', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const { transcodeVideo } = await import('../transcode.service.js');
    const promise = transcodeVideo('/tmp/input.mov', '/tmp/output.mp4');

    await vi.advanceTimersByTimeAsync(300_000);

    await expect(promise).rejects.toThrow(/timeout/i);
    expect((proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill)
      .toHaveBeenCalledWith('SIGKILL');
  });

  it('rejects when spawn emits an error event', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);

    const { transcodeVideo } = await import('../transcode.service.js');
    const promise = transcodeVideo('/tmp/input.mov', '/tmp/output.mp4');

    proc.emit('error', new Error('ENOENT: ffmpeg not found'));

    await expect(promise).rejects.toThrow(/ffmpeg not found/);
  });
});

describe('createTranscodeWorker', () => {
  it('exports a factory function', async () => {
    const { createTranscodeWorker } = await import('../transcode-worker.js');
    expect(typeof createTranscodeWorker).toBe('function');
  });
});
