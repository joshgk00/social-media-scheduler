import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

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

// Mock @sms/db so transcode-worker can resolve it in tests
vi.mock('@sms/db', () => ({
  postMedia: { id: 'mock_id_col' },
}));

// Mock @sms/shared/storage so transcode-worker can resolve it
vi.mock('@sms/shared/storage', () => ({
  createStorageBackend: vi.fn(),
}));

// Mock bullmq Worker to avoid needing a real Redis connection
vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    name: string;
    processor: unknown;
    opts: unknown;
    constructor(name: string, processor: unknown, opts: unknown) {
      this.name = name;
      this.processor = processor;
      this.opts = opts;
    }
    on() { return this; }
    close() { return Promise.resolve(); }
  },
  Queue: class MockQueue {
    constructor() {}
    add() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  },
}));

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Mock fs modules used by transcode-worker
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  createReadStream: vi.fn().mockReturnValue('mock-stream'),
}));
vi.mock('node:fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 12345 }),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

interface MockChildProcess extends EventEmitter {
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function createMockProcess(): MockChildProcess {
  const proc = new EventEmitter() as MockChildProcess;
  const stderrEmitter = new EventEmitter();
  Object.defineProperty(proc, 'stderr', { value: stderrEmitter, writable: false });
  proc.kill = vi.fn();
  return proc;
}

describe('transcodeVideo', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mockSpawn.mockReset();
  });

  afterEach(() => {
    // Clear pending timers without running them to avoid unhandled rejections
    // from the 5-minute timeout left behind by tests that resolve via 'close' event.
    vi.clearAllTimers();
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

    // Attach a no-op catch so the rejection is "handled" before advanceTimers
    // fires the setTimeout callback. Without this, vitest reports an unhandled
    // rejection because the promise rejects inside the fake timer tick before
    // the await below can consume it.
    const caught = promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(300_000);

    await expect(promise).rejects.toThrow(/timeout/i);
    expect((proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill)
      .toHaveBeenCalledWith('SIGKILL');
    await caught;
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

  it('creates a worker with concurrency 1 and lockDuration 360000', async () => {
    const { createTranscodeWorker } = await import('../transcode-worker.js');
    const mockRedis = {} as never;
    const mockDb = {} as never;
    const mockStorage = {} as never;

    const worker = createTranscodeWorker({
      redis: mockRedis,
      db: mockDb,
      storage: mockStorage,
    });

    expect((worker as unknown as { opts: { concurrency: number } }).opts).toEqual(
      expect.objectContaining({ concurrency: 1 }),
    );
    expect((worker as unknown as { opts: { lockDuration: number } }).opts).toEqual(
      expect.objectContaining({ lockDuration: 360_000 }),
    );
  });

  it('creates a worker consuming the transcode queue', async () => {
    const { createTranscodeWorker } = await import('../transcode-worker.js');
    const worker = createTranscodeWorker({
      redis: {} as never,
      db: {} as never,
      storage: {} as never,
    });

    expect((worker as unknown as { name: string }).name).toBe('transcode');
  });
});
