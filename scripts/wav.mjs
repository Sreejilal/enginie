// Reads audio files into mono samples at the analysis rate. Used by the build and evaluation scripts.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resample } from '../public/js/features.js';

const MAX_SECONDS = 15;

// Phone recordings, voice notes and downloads come in many formats. Anything but WAV needs ffmpeg.
export const AUDIO_FILE = /\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm|3gp|amr|wma)$/i;

/**
 * Reads any audio file. WAV is read directly; other formats, and WAVs in unusual encodings, are
 * converted with ffmpeg, found on the PATH or at the path in the FFMPEG environment variable.
 */
export function readAudio(path) {
  if (/\.wav$/i.test(path)) {
    try {
      return readWav(path);
    } catch {
      // Fall through to ffmpeg, which reads compressed and floating-point WAVs too.
    }
  }
  const folder = mkdtempSync(join(tmpdir(), 'enginie-'));
  const wav = join(folder, 'clip.wav');
  try {
    execFileSync(
      process.env.FFMPEG || 'ffmpeg',
      ['-v', 'error', '-i', path, '-t', String(MAX_SECONDS), '-ac', '1', '-c:a', 'pcm_s16le', wav],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    return readWav(wav);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`converting it needs ffmpeg. Install it (on Windows: winget install ffmpeg), or set FFMPEG to its path`);
    }
    throw new Error(String(error.stderr ?? error.message).trim().split('\n')[0]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function readWav(path) {
  const bytes = readFileSync(path);
  if (bytes.toString('latin1', 0, 4) !== 'RIFF') throw new Error(`${path} is not a WAV file`);

  let offset = 12;
  let format = null;
  let dataStart = null;
  let dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('latin1', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      format = {
        code: bytes.readUInt16LE(offset + 8),
        channels: bytes.readUInt16LE(offset + 10),
        rate: bytes.readUInt32LE(offset + 12),
        bits: bytes.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      dataStart = offset + 8;
      dataLength = Math.min(size, bytes.length - dataStart);
    }
    offset += 8 + size + (size % 2);
  }
  if (!format || dataStart === null) throw new Error(`${path} has no audio data`);

  const sampleBytes = format.bits / 8;
  const frames = Math.floor(dataLength / (sampleBytes * format.channels));
  const mono = new Float32Array(Math.min(frames, MAX_SECONDS * format.rate));
  for (let i = 0; i < mono.length; i++) {
    let sum = 0;
    for (let channel = 0; channel < format.channels; channel++) {
      const at = dataStart + (i * format.channels + channel) * sampleBytes;
      if (format.code === 3 && format.bits === 32) sum += bytes.readFloatLE(at);
      else if (format.bits === 16) sum += bytes.readInt16LE(at) / 32768;
      else if (format.bits === 24) sum += bytes.readIntLE(at, 3) / 8388608;
      else if (format.bits === 32) sum += bytes.readInt32LE(at) / 2147483648;
      else if (format.bits === 8) sum += (bytes.readUInt8(at) - 128) / 128;
      else throw new Error(`${path} uses unsupported ${format.bits}-bit audio`);
    }
    mono[i] = sum / format.channels;
  }
  return resample(mono, format.rate);
}
