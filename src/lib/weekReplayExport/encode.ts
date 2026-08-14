/**
 * Week Replay Export — MP4 encoder.
 *
 * Walks playback time at a fixed frame rate, paints each frame with the export
 * renderer, and hands it to Mediabunny, which encodes H.264 + AAC via WebCodecs
 * and muxes an MP4. Nothing is screen-recorded: frames are generated
 * deterministically off-screen, so the clip is the same length and quality
 * regardless of how fast the machine renders, and the tab can lose focus
 * mid-export without dropping frames.
 *
 * Audio is optional in two senses. The caller can leave it out, and a browser
 * with no usable AAC encoder still gets a silent video rather than an error —
 * worth it, because a muted clip is still shareable.
 */

import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  getFirstEncodableVideoCodec,
} from "mediabunny";

import { renderExportFrame } from "./renderer";
import type { ExportScene } from "./scene";

/** Frames per second of the exported video. */
export const EXPORT_FPS = 30;
/**
 * Hold after playback ends, for the closing card to land and be read.
 * Also the length the audio track's closing swell is given, so the two
 * tracks end together.
 */
export const OUTRO_MS = 3200;
/** Fade-in of the closing card at the start of the tail. */
const OUTRO_FADE_MS = 420;
/** Keyframe cadence in seconds. Platforms re-encode anyway, so 2s is plenty. */
const KEYFRAME_INTERVAL_S = 2;
/** Frames between yields to the event loop, so progress can paint. */
const YIELD_EVERY = 6;

/**
 * H.264 is the only codec every target platform ingests, so there is no
 * fallback list here: no AVC encoder means no export.
 */
const VIDEO_CODEC = "avc" as const;
const AUDIO_CODEC = "aac" as const;

/**
 * Whether this browser can export at all.
 *
 * Synchronous on purpose — it gates whether the entry point renders, and an
 * async check there would flash a button that then disappears. The real
 * per-codec check happens in {@link encodeReplayVideo}.
 */
export function isVideoExportSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.VideoEncoder === "function" &&
    typeof window.VideoFrame === "function"
  );
}

export interface EncodeReplayParams {
  scene: ExportScene;
  /** Rendered offline by the replay audio engine; omit for a silent video. */
  audio?: AudioBuffer | null;
  fps?: number;
  /** Called with 0–1 as frames are encoded. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface EncodeReplayResult {
  blob: Blob;
  durationMs: number;
  hasAudio: boolean;
  /** Suggested download filename. */
  filename: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
}

/** "week-replay-the-mission-jul-20-26-story.mp4" */
function buildFilename(scene: ExportScene): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return [
    "week-replay",
    slug(scene.scopeLabel),
    slug(scene.dateRange),
    scene.layout.format.id,
  ]
    .filter(Boolean)
    .join("-")
    .concat(".mp4");
}

/**
 * Render and encode the whole replay to an MP4 blob.
 *
 * @throws `AbortError` when `signal` aborts, or a plain `Error` when this
 *   browser has no H.264 encoder for the requested frame size.
 */
export async function encodeReplayVideo(
  params: EncodeReplayParams,
): Promise<EncodeReplayResult> {
  const { scene, audio, onProgress, signal } = params;
  const fps = params.fps ?? EXPORT_FPS;
  const { width, height } = scene.layout;

  if (!isVideoExportSupported()) {
    throw new Error(
      "Video recording needs Chrome, Edge, or Safari 17 and newer.",
    );
  }

  const codec = await getFirstEncodableVideoCodec([VIDEO_CODEC], { width, height });
  if (!codec) {
    throw new Error(`This browser can't encode ${width}×${height} video.`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Couldn't create a drawing surface for the export.");

  const output = new Output({
    // Fast Start matters here: social apps and in-page <video> both want the
    // metadata up front, and these clips are small enough to hold in memory.
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(canvas, {
    codec,
    quality: new Quality("high"),
    keyFrameInterval: KEYFRAME_INTERVAL_S,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: AudioBufferSource | null = null;
  if (audio) {
    const canEncode = await canEncodeAudio(AUDIO_CODEC, {
      numberOfChannels: audio.numberOfChannels,
      sampleRate: audio.sampleRate,
    });
    if (canEncode) {
      audioSource = new AudioBufferSource({
        codec: AUDIO_CODEC,
        quality: new Quality("high"),
      });
      output.addAudioTrack(audioSource);
    }
  }

  const playbackMs = scene.timeline.durationMs;
  const totalMs = playbackMs + OUTRO_MS;
  const frameCount = Math.max(1, Math.round((totalMs / 1000) * fps));

  try {
    await output.start();

    if (audioSource && audio) {
      await audioSource.add(audio);
      audioSource.close();
    }

    for (let i = 0; i < frameCount; i++) {
      throwIfAborted(signal);

      const t = (i / fps) * 1000;
      const playMs = Math.min(t, playbackMs);
      const outro = t > playbackMs ? Math.min(1, (t - playbackMs) / OUTRO_FADE_MS) : 0;
      renderExportFrame(ctx, scene, playMs, { outro });

      // Awaiting the add applies the encoder's own backpressure, so the queue
      // never grows past what the hardware can keep up with.
      await videoSource.add(i / fps, 1 / fps);

      if (i % YIELD_EVERY === 0) {
        onProgress?.(i / frameCount);
        await sleep(0);
      }
    }
    videoSource.close();

    await output.finalize();
  } catch (err) {
    if (output.state === "started" || output.state === "pending") {
      await output.cancel().catch(() => undefined);
    }
    throw err;
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("The export finished without producing a file.");

  onProgress?.(1);
  return {
    blob: new Blob([buffer], { type: "video/mp4" }),
    durationMs: totalMs,
    hasAudio: audioSource !== null,
    filename: buildFilename(scene),
  };
}
