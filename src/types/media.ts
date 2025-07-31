// Utility types for MediaStream and MediaRecorder operations

export interface MediaStreamTrackInfo {
  id: string;
  kind: "audio" | "video";
  label: string;
  enabled: boolean;
  muted: boolean;
  readyState: MediaStreamTrackState;
}

export interface MediaStreamInfo {
  id: string;
  active: boolean;
  audioTracks: MediaStreamTrackInfo[];
  videoTracks: MediaStreamTrackInfo[];
}

export interface MediaRecorderConfig {
  mimeType: string;
  audioBitsPerSecond?: number;
  videoBitsPerSecond?: number;
  bitsPerSecond?: number;
}

export interface MediaRecorderState {
  state: MediaRecorderRecordingState;
  mimeType: string;
  stream: MediaStream | null;
  startTime: number | null;
  pausedTime: number;
}

export type MediaRecorderRecordingState = "inactive" | "recording" | "paused";

export interface AudioAnalyzerData {
  frequencyData: Uint8Array;
  timeData: Uint8Array;
  volume: number;
  peak: number;
}

export interface VideoStreamConstraints {
  width?: number | { min?: number; max?: number; ideal?: number };
  height?: number | { min?: number; max?: number; ideal?: number };
  frameRate?: number | { min?: number; max?: number; ideal?: number };
}

export interface AudioStreamConstraints {
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface StreamCombinationOptions {
  videoStream: MediaStream;
  audioStream?: MediaStream;
  syncAudio?: boolean;
  audioGain?: number;
}

// Utility type for MediaRecorder event handlers
export interface MediaRecorderEventHandlers {
  onStart?: (event: Event) => void;
  onStop?: (event: Event) => void;
  onDataAvailable?: (event: BlobEvent) => void;
  onPause?: (event: Event) => void;
  onResume?: (event: Event) => void;
  onError?: (event: Event) => void;
}

// Type guards for media operations
export type MediaStreamValidator = (stream: MediaStream) => boolean;
export type MimeTypeValidator = (mimeType: string) => boolean;

// Utility types for stream operations
export type StreamProcessor = (stream: MediaStream) => MediaStream;
export type StreamAnalyzer = (stream: MediaStream) => Promise<MediaStreamInfo>;
