// Service interfaces for Chrome API and media operations

import { RecordingOptions } from "./recording";

export interface ChromeAPIService {
  captureTabAudio(tabId: number): Promise<MediaStream>;
  injectContentScript(tabId: number): Promise<void>;
  getCurrentTab(): Promise<chrome.tabs.Tab>;
  checkPermissions(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
}

export interface MediaRecorderService {
  startRecording(options: RecordingOptions): Promise<MediaRecorder>;
  stopRecording(): Promise<Blob>;
  combineStreams(
    videoStream: MediaStream,
    audioStream?: MediaStream
  ): MediaStream;
  getSupportedMimeTypes(): string[];
  isRecordingSupported(): boolean;
}

export interface CanvasService {
  findShaderToyCanvas(): HTMLCanvasElement | null;
  captureCanvasStream(
    canvas: HTMLCanvasElement,
    frameRate?: number
  ): MediaStream;
  validateCanvas(canvas: HTMLCanvasElement): boolean;
}

export interface FileService {
  generateFileName(extension: string): string;
  downloadBlob(blob: Blob, filename: string): void;
  validateFileSize(blob: Blob, maxSizeMB?: number): boolean;
}
