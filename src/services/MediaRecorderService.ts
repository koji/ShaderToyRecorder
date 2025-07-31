// MediaRecorderService for stream management and recording operations

import {
  MediaRecorderService as IMediaRecorderService,
  RecordingOptions,
  RecordingResult,
  MediaRecorderConfig,
  MediaRecorderEventHandlers,
  StreamCombinationOptions,
} from "../types";
import { errorHandlingService } from "./ErrorHandlingService";
import { RecordingError } from "../types/errors";

export class MediaRecorderService implements IMediaRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private startTime: number | null = null;

  /**
   * Combines video and audio streams into a single MediaStream
   */
  combineStreams(
    videoStream: MediaStream,
    audioStream?: MediaStream
  ): MediaStream {
    const combinedStream = new MediaStream();

    // Add video tracks
    videoStream.getVideoTracks().forEach((track) => {
      combinedStream.addTrack(track);
    });

    // Add audio tracks if available
    if (audioStream) {
      audioStream.getAudioTracks().forEach((track) => {
        combinedStream.addTrack(track);
      });
    }

    return combinedStream;
  }

  /**
   * Advanced stream combination with options
   */
  combineStreamsWithOptions(options: StreamCombinationOptions): MediaStream {
    const { videoStream, audioStream, syncAudio = true } = options;

    const combinedStream = this.combineStreams(videoStream, audioStream);

    // Apply audio synchronization if needed
    if (syncAudio && audioStream) {
      this.syncAudioToVideo(combinedStream);
    }

    return combinedStream;
  }

  /**
   * Gets supported MIME types for MediaRecorder
   */
  getSupportedMimeTypes(): string[] {
    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
      "video/mp4;codecs=h264,aac",
      "video/mp4",
    ];

    return mimeTypes.filter((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    );
  }

  /**
   * Detects the best supported MIME type
   */
  detectBestMimeType(): string {
    const supportedTypes = this.getSupportedMimeTypes();

    if (supportedTypes.length === 0) {
      throw new Error("No supported MIME types found for MediaRecorder");
    }

    // Prefer VP9 with Opus for best quality
    const preferredOrder = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/mp4;codecs=h264,aac",
      "video/webm",
      "video/mp4",
    ];

    for (const preferred of preferredOrder) {
      if (supportedTypes.includes(preferred)) {
        return preferred;
      }
    }

    return supportedTypes[0];
  }

  /**
   * Checks if recording is supported in the current browser
   */
  isRecordingSupported(): boolean {
    return (
      typeof MediaRecorder !== "undefined" &&
      (MediaRecorder.isTypeSupported("video/webm") ||
        MediaRecorder.isTypeSupported("video/mp4"))
    );
  }

  /**
   * Starts recording with the provided options
   */
  async startRecording(options: RecordingOptions): Promise<MediaRecorder> {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      throw new Error("Recording is already in progress");
    }

    const { videoStream, audioStream, mimeType, videoBitsPerSecond } = options;

    // Combine streams
    const combinedStream = this.combineStreams(videoStream, audioStream);

    // Determine MIME type
    const finalMimeType = mimeType || this.detectBestMimeType();

    // Create MediaRecorder configuration
    const config: MediaRecorderConfig = {
      mimeType: finalMimeType,
    };

    if (videoBitsPerSecond) {
      config.videoBitsPerSecond = videoBitsPerSecond;
    }

    // Initialize MediaRecorder
    this.mediaRecorder = new MediaRecorder(combinedStream, config);
    this.recordedChunks = [];
    this.startTime = Date.now();

    // Set up event handlers
    this.setupEventHandlers();

    // Start recording
    this.mediaRecorder.start(1000); // Collect data every second

    return this.mediaRecorder;
  }

  /**
   * Stops recording and returns the recorded blob
   */
  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("No active recording to stop"));
        return;
      }

      if (this.mediaRecorder.state === "inactive") {
        reject(new Error("Recording is not active"));
        return;
      }

      // Set up one-time stop handler
      const handleStop = () => {
        const blob = new Blob(this.recordedChunks, {
          type: this.mediaRecorder!.mimeType,
        });

        // Clean up
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.startTime = null;

        resolve(blob);
      };

      this.mediaRecorder.addEventListener("stop", handleStop, { once: true });
      this.mediaRecorder.stop();
    });
  }

  /**
   * Gets the current recording result with metadata
   */
  async getRecordingResult(): Promise<RecordingResult> {
    const blob = await this.stopRecording();
    const duration = this.startTime ? Date.now() - this.startTime : 0;

    // Analyze the blob to determine if it has audio/video
    const hasVideo = blob.type.includes("video");
    const hasAudio = this.recordedChunks.some(
      (chunk) =>
        chunk.type.includes("audio") ||
        blob.type.includes("opus") ||
        blob.type.includes("aac")
    );

    return {
      blob,
      duration,
      hasAudio,
      hasVideo,
    };
  }

  /**
   * Pauses the current recording
   */
  pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause();
    }
  }

  /**
   * Resumes the current recording
   */
  resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume();
    }
  }

  /**
   * Gets the current recording state
   */
  getRecordingState(): MediaRecorderRecordingState | null {
    return this.mediaRecorder?.state || null;
  }

  /**
   * Gets the current recording duration in milliseconds
   */
  getRecordingDuration(): number {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  /**
   * Sets up event handlers for MediaRecorder
   */
  private setupEventHandlers(): void {
    if (!this.mediaRecorder) return;

    this.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    });

    this.mediaRecorder.addEventListener("error", (event) => {
      console.error("MediaRecorder error:", event);
    });
  }

  /**
   * Applies audio synchronization to the combined stream
   */
  private syncAudioToVideo(stream: MediaStream): void {
    // Basic audio sync implementation
    // In a real implementation, you might use Web Audio API for more precise sync
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();

    if (audioTracks.length > 0 && videoTracks.length > 0) {
      // Ensure audio and video tracks are properly synchronized
      // This is a placeholder for more complex sync logic
      audioTracks.forEach((track) => {
        track.enabled = true;
      });
    }
  }

  /**
   * Validates that a stream has the required tracks
   */
  validateStream(stream: MediaStream, requireAudio = false): boolean {
    const hasVideo = stream.getVideoTracks().length > 0;
    const hasAudio = stream.getAudioTracks().length > 0;

    if (!hasVideo) {
      return false;
    }

    if (requireAudio && !hasAudio) {
      return false;
    }

    return true;
  }

  /**
   * Gets information about a MediaStream
   */
  getStreamInfo(stream: MediaStream): {
    id: string;
    active: boolean;
    videoTracks: number;
    audioTracks: number;
  } {
    return {
      id: stream.id,
      active: stream.active,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    };
  }

  /**
   * Attempts to start recording with graceful degradation for audio failures
   */
  async startRecordingWithGracefulDegradation(
    options: RecordingOptions
  ): Promise<{
    success: boolean;
    hasAudio: boolean;
    hasVideo: boolean;
    degradationReason?: string;
  }> {
    const { videoStream, audioStream } = options;
    let finalAudioStream = audioStream;
    let degradationReason: string | undefined;

    // Validate video stream (required)
    if (!this.validateStream(videoStream, false)) {
      throw errorHandlingService.createError(
        RecordingError.STREAM_COMBINATION_FAILED,
        "Video stream is invalid or missing video tracks",
        undefined,
        { streamInfo: this.getStreamInfo(videoStream) }
      );
    }

    // Try to validate audio stream
    if (audioStream) {
      try {
        // Check if audio stream has audio tracks
        const audioTracks = audioStream.getAudioTracks();
        if (audioTracks.length === 0) {
          console.warn(
            "Audio stream has no audio tracks, continuing with video only"
          );
          finalAudioStream = undefined;
          degradationReason = "Audio stream has no audio tracks";
        } else {
          // Test if audio tracks are actually working
          const firstTrack = audioTracks[0];
          if (firstTrack.readyState === "ended" || !firstTrack.enabled) {
            console.warn(
              "Audio track is not ready, continuing with video only"
            );
            finalAudioStream = undefined;
            degradationReason = "Audio track not ready";
          }
        }
      } catch (error) {
        console.warn("Audio stream processing failed:", error);
        finalAudioStream = undefined;
        degradationReason = `Audio processing error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      }
    }

    // Combine streams with graceful degradation
    let combinedStream: MediaStream;
    try {
      combinedStream = this.combineStreams(videoStream, finalAudioStream);
    } catch (error) {
      console.warn("Stream combination failed, trying video only:", error);
      try {
        combinedStream = this.combineStreams(videoStream);
        finalAudioStream = undefined;
        degradationReason = `Stream combination failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
      } catch (videoError) {
        throw errorHandlingService.createError(
          RecordingError.STREAM_COMBINATION_FAILED,
          "Failed to create recording stream",
          videoError as Error,
          { originalError: error, videoError }
        );
      }
    }

    // Start recording with the combined stream
    try {
      await this.startRecording({
        ...options,
        videoStream: combinedStream,
        audioStream: undefined, // Already combined
      });

      return {
        success: true,
        hasAudio: !!finalAudioStream,
        hasVideo: true,
        degradationReason,
      };
    } catch (error) {
      throw errorHandlingService.createError(
        RecordingError.MEDIA_RECORDER_ERROR,
        "Failed to start recording",
        error as Error,
        {
          hasAudio: !!finalAudioStream,
          degradationReason,
          streamInfo: this.getStreamInfo(combinedStream),
        }
      );
    }
  }

  /**
   * Handles audio stream failures with fallback options
   */
  handleAudioStreamFailure(
    error: Error,
    context: { operation: string; tabId?: number }
  ): {
    shouldContinue: boolean;
    fallbackMessage: string;
    errorCode: RecordingError;
  } {
    const errorDetails = errorHandlingService.handleError(error, context);

    switch (errorDetails.code) {
      case RecordingError.AUDIO_PERMISSION_DENIED:
        return {
          shouldContinue: true,
          fallbackMessage:
            "Audio permission denied. Recording will continue with video only. You can enable audio in browser settings.",
          errorCode: RecordingError.AUDIO_PERMISSION_DENIED,
        };

      case RecordingError.TAB_CAPTURE_FAILED:
        return {
          shouldContinue: true,
          fallbackMessage:
            "Audio capture from tab failed. Recording will continue with video only.",
          errorCode: RecordingError.TAB_CAPTURE_FAILED,
        };

      case RecordingError.AUDIO_NOT_AVAILABLE:
        return {
          shouldContinue: true,
          fallbackMessage:
            "Audio device not available. Recording will continue with video only.",
          errorCode: RecordingError.AUDIO_NOT_AVAILABLE,
        };

      case RecordingError.UNSUPPORTED_BROWSER:
        return {
          shouldContinue: false,
          fallbackMessage:
            "Audio recording not supported in this browser. Please update your browser or use Chrome/Firefox.",
          errorCode: RecordingError.UNSUPPORTED_BROWSER,
        };

      default:
        return {
          shouldContinue: true,
          fallbackMessage:
            "Audio recording failed. Recording will continue with video only.",
          errorCode: errorDetails.code,
        };
    }
  }

  /**
   * Creates a notification for graceful degradation
   */
  createDegradationNotification(
    hasAudio: boolean,
    hasVideo: boolean,
    reason?: string
  ): {
    type: "success" | "warning" | "error";
    message: string;
    details?: string;
  } {
    if (hasVideo && hasAudio) {
      return {
        type: "success",
        message: "Recording started successfully with audio and video.",
      };
    }

    if (hasVideo && !hasAudio) {
      return {
        type: "warning",
        message: "Recording started with video only. Audio capture failed.",
        details: reason || "Audio capture was not available.",
      };
    }

    if (!hasVideo) {
      return {
        type: "error",
        message: "Recording failed. Video capture is required.",
        details: reason || "Video stream could not be established.",
      };
    }

    return {
      type: "error",
      message: "Recording failed to start.",
      details: reason || "Unknown error occurred.",
    };
  }
}

// Export singleton instance
export const mediaRecorderService = new MediaRecorderService();
