// Spawns ffmpeg as a child process to transcode video files to H.264 MP4
// at 720p resolution. Used by the transcode BullMQ worker.
//
// D-06: Output is H.264 MP4 capped at 720p (scale=-2:720 preserves aspect ratio).
// D-09 / MEDIA-04: 5-minute timeout kills runaway ffmpeg processes via SIGKILL.
// T-06-09: Arguments passed as array to spawn(), never string interpolation.

import { spawn } from 'node:child_process';

const TRANSCODE_TIMEOUT_MS = 300_000;

export function transcodeVideo(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ];

    const proc = spawn('ffmpeg', args);

    let isSettled = false;
    const timeout = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      proc.kill('SIGKILL');
      reject(new Error('Transcoding timeout exceeded (5 minutes)'));
    }, TRANSCODE_TIMEOUT_MS);

    const MAX_STDERR_BYTES = 8192;
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > MAX_STDERR_BYTES) {
        stderr = stderr.slice(-MAX_STDERR_BYTES);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (isSettled) return;
      isSettled = true;
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `ffmpeg exited with code ${code}: ${stderr.slice(-500)}`,
          ),
        );
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      if (isSettled) return;
      isSettled = true;
      reject(err);
    });
  });
}
