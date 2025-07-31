// Recording state and configuration interfaces

export type MediaStreamStatus = "inactive" | "active" | "error";

export interface RecordingState {
  isRecording: boolean;
  startTime: number | null;
  duration: number;
  videoStatus: MediaStreamStatus;
  audioStatus: MediaStreamStatus;
  error: string | null;
}

export interface RecordingConfig {
  frameRate: number;
  videoBitsPerSecond: number;
  audioEnabled: boolean;
  mimeType: string;
  maxDuration?: number;
}

export interface RecordingOptions {
  videoStream: MediaStream;
  audioStream?: MediaStream;
  mimeType?: string;
  videoBitsPerSecond?: number;
}

export interface RecordingResult {
  blob: Blob;
  duration: number;
  hasAudio: boolean;
  hasVideo: boolean;
}
