// Everything that touches the browser's audio system: microphone, file decoding and playback.

import { resample, SAMPLE_RATE } from './features.js';

export const MAX_FILE_SECONDS = 15;

// The capture code is built into the page rather than fetched when recording starts, so the
// microphone keeps working even if the connection or the server has gone away.
const CAPTURE_WORKLET = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('capture', CaptureProcessor);
`;

const named = (name, message) => Object.assign(new Error(message), { name });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Asks for the microphone with the browser's voice clean-up turned off, because that would
 * filter out the very noises we want to hear. Falls back rather than failing outright.
 */
async function openMicrophone(deviceId) {
  const raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  const attempts = [
    ...(deviceId ? [{ ...raw, deviceId: { exact: deviceId } }] : []),
    raw,
    true,
  ];
  let lastError;
  for (const audio of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio });
    } catch (error) {
      lastError = error;
      // Refusal won't change by asking differently. Only retry when the request itself was the issue.
      if (!['OverconstrainedError', 'NotFoundError', 'NotReadableError', 'AbortError'].includes(error.name)) throw error;
    }
  }
  throw lastError;
}

/** Sends raw samples to `onChunk`, using the best method this browser supports. */
async function connectCapture(context, source, onChunk) {
  const mute = context.createGain();
  mute.gain.value = 0;
  mute.connect(context.destination);

  try {
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(context, 'capture');
    node.port.onmessage = (event) => onChunk(event.data);
    source.connect(node).connect(mute);
    return () => { node.port.onmessage = null; };
  } catch {
    // Older browsers, or pages that block workers, can still record this older way.
    const node = context.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (event) => onChunk(event.inputBuffer.getChannelData(0).slice(0));
    source.connect(node).connect(mute);
    return () => { node.onaudioprocess = null; };
  }
}

/**
 * Starts recording. Call this from a click handler, because some browsers only let audio start
 * from a direct action. Returns the live analyser, level() and stop(), which resolves to samples.
 */
export async function startRecording({ deviceId = null, onTrackEnded = () => {} } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw named('InsecureContext', 'Microphone access is unavailable on this page');
  }

  const context = new AudioContext();
  const resumed = context.resume();
  let stream;
  try {
    stream = await openMicrophone(deviceId);
    // Some browsers can hang here, so don't wait forever for audio to start.
    await Promise.race([resumed, wait(1500)]);
    if (context.state !== 'running') {
      await Promise.race([context.resume(), wait(1500)]);
    }
    if (context.state !== 'running') throw named('AudioBlocked', 'The browser did not start audio');

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);

    const chunks = [];
    const disconnect = await connectCapture(context, source, (chunk) => chunks.push(chunk));
    const [track] = stream.getAudioTracks();
    track.addEventListener('ended', onTrackEnded);

    const scratch = new Float32Array(analyser.fftSize);
    return {
      analyser,
      sampleRate: context.sampleRate,
      deviceLabel: track.label,
      deviceId: track.getSettings?.().deviceId ?? null,
      /** Loudness right now in decibels, from about -100 (silence) to 0 (maximum). */
      level() {
        analyser.getFloatTimeDomainData(scratch);
        let sum = 0;
        for (let i = 0; i < scratch.length; i++) sum += scratch[i] * scratch[i];
        return 10 * Math.log10(sum / scratch.length + 1e-10);
      },
      async stop() {
        track.removeEventListener('ended', onTrackEnded);
        stream.getTracks().forEach((item) => item.stop());
        disconnect();
        const rate = context.sampleRate;
        await context.close();
        return resample(joinChunks(chunks), rate);
      },
    };
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    context.close();
    throw error;
  }
}

/** Lists microphones. Their names only appear once the person has allowed access. */
export async function listMicrophones() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'audioinput' && device.deviceId && device.label)
    .map((device) => ({ id: device.deviceId, label: device.label }));
}

function joinChunks(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

/** Reads an uploaded audio file, using up to the first MAX_FILE_SECONDS. */
export async function decodeFile(file) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const length = Math.min(decoded.length, Math.floor(MAX_FILE_SECONDS * decoded.sampleRate));
    const mono = new Float32Array(length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
    return { samples: resample(mono, decoded.sampleRate), trimmed: decoded.length > length };
  } finally {
    context.close();
  }
}

let playbackContext = null;
let currentSource = null;

/** Plays samples, replacing anything already playing. onEnded fires only if it plays to the end. */
export async function play(samples, onEnded) {
  stopPlayback();
  playbackContext ??= new AudioContext();
  await playbackContext.resume();

  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));

  const buffer = playbackContext.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.copyToChannel(samples, 0);
  const source = playbackContext.createBufferSource();
  source.buffer = buffer;

  // Even out the volume, and hold it down so that a squeal isn't painful through headphones.
  const gain = playbackContext.createGain();
  gain.gain.value = peak > 0 ? Math.min(0.6 / peak, 30) : 1;
  source.connect(gain).connect(playbackContext.destination);
  source.onended = () => {
    if (currentSource === source) currentSource = null;
    onEnded?.();
  };
  source.start();
  currentSource = source;
}

export function stopPlayback() {
  if (!currentSource) return;
  currentSource.onended = null;
  try {
    currentSource.stop();
  } catch {
    // It had already finished.
  }
  currentSource = null;
}
