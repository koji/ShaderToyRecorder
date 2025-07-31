// Error handling types and enums for different failure scenarios

export enum RecordingError {
  CANVAS_NOT_FOUND = "CANVAS_NOT_FOUND",
  AUDIO_PERMISSION_DENIED = "AUDIO_PERMISSION_DENIED",
  RECORDING_FAILED = "RECORDING_FAILED",
  TAB_CAPTURE_FAILED = "TAB_CAPTURE_FAILED",
  UNSUPPORTED_BROWSER = "UNSUPPORTED_BROWSER",
  STREAM_COMBINATION_FAILED = "STREAM_COMBINATION_FAILED",
  MEDIA_RECORDER_ERROR = "MEDIA_RECORDER_ERROR",
  FILE_GENERATION_FAILED = "FILE_GENERATION_FAILED",
  TAB_NOT_FOUND = "TAB_NOT_FOUND",
  INVALID_TAB = "INVALID_TAB",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  AUDIO_NOT_AVAILABLE = "AUDIO_NOT_AVAILABLE",
}

export interface RecordingErrorDetails {
  code: RecordingError;
  message: string;
  originalError?: Error;
  timestamp: number;
  context?: Record<string, unknown>;
}

export class RecordingException extends Error {
  public readonly code: RecordingError;
  public readonly timestamp: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: RecordingError,
    message: string,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "RecordingException";
    this.code = code;
    this.timestamp = Date.now();
    this.context = context;

    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

export type ErrorHandler = (error: RecordingErrorDetails) => void;
