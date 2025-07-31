/**
 * Offscreen document for handling audio capture in Chrome 116+
 * This is required because getUserMedia can only be called in a document context
 */

import { RecordingError } from "../types/errors";

interface OffscreenMessage {
  type: "start-audio-capture" | "stop-audio-capture" | "get-media-stream";
  streamId?: string;
  tabId?: number;
}

interface OffscreenResponse {
  success: boolean;
  stream?: MediaStream;
  error?: string;
}

class OffscreenAudioCapture {
  private activeStreams: Map<string, MediaStream> = new Map();
  private audioContext: AudioContext | null = null;

  constructor() {
    this.setupMessageListener();
    console.log("Offscreen document initialized for audio capture");
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: OffscreenMessage, sender, sendResponse) => {
        this.handleMessage(message)
          .then(sendResponse)
          .catch((error) => {
            console.error("Offscreen message handling error:", error);
            sendResponse({
              success: false,
              error: error.message || "Unknown error in offscreen document",
            });
          });

        // Return true to indicate we will send a response asynchronously
        return true;
      }
    );
  }

  private async handleMessage(
    message: OffscreenMessage
  ): Promise<OffscreenResponse> {
    switch (message.type) {
      case "get-media-stream":
        return this.getMediaStreamFromId(message.streamId!);

      case "start-audio-capture":
        return this.startAudioCapture(message.streamId!, message.tabId);

      case "stop-audio-capture":
        return this.stopAudioCapture(message.streamId!);

      default:
        throw new Error(`Unknown message type: ${(message as any).type}`);
    }
  }

  /**
   * Get MediaStream from stream ID using getUserMedia
   * This is the core functionality for Chrome 116+ audio capture
   */
  private async getMediaStreamFromId(
    streamId: string
  ): Promise<OffscreenResponse> {
    try {
      if (!streamId) {
        throw new Error(RecordingError.TAB_CAPTURE_FAILED);
      }

      // Use getUserMedia with the stream ID from tabCapture
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        } as any,
        video: false,
      });

      if (!stream || stream.getAudioTracks().length === 0) {
        throw new Error(RecordingError.AUDIO_NOT_AVAILABLE);
      }

      // Store the stream for later cleanup
      this.activeStreams.set(streamId, stream);

      console.log(
        `Audio stream captured successfully for stream ID: ${streamId}`
      );

      return {
        success: true,
        stream,
      };
    } catch (error) {
      console.error("Failed to get media stream from ID:", error);

      let errorMessage = RecordingError.TAB_CAPTURE_FAILED;
      if (error instanceof Error) {
        if (error.message.includes("Permission denied")) {
          errorMessage = RecordingError.PERMISSION_DENIED;
        } else if (error.message.includes("not supported")) {
          errorMessage = RecordingError.UNSUPPORTED_BROWSER;
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Start audio capture with additional processing
   * This method can be extended for audio analysis or processing
   */
  private async startAudioCapture(
    streamId: string,
    tabId?: number
  ): Promise<OffscreenResponse> {
    try {
      const result = await this.getMediaStreamFromId(streamId);

      if (!result.success || !result.stream) {
        return result;
      }

      // Initialize audio context for potential audio processing
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Create audio source for potential visualization or processing
      const source = this.audioContext.createMediaStreamSource(result.stream);

      // For now, we just pass through the stream
      // Future enhancements could add audio processing here

      console.log(`Audio capture started for tab ${tabId}, stream ${streamId}`);

      return result;
    } catch (error) {
      console.error("Failed to start audio capture:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Audio capture failed",
      };
    }
  }

  /**
   * Stop audio capture and cleanup resources
   */
  private async stopAudioCapture(streamId: string): Promise<OffscreenResponse> {
    try {
      const stream = this.activeStreams.get(streamId);

      if (stream) {
        // Stop all tracks
        stream.getTracks().forEach((track) => {
          track.stop();
        });

        // Remove from active streams
        this.activeStreams.delete(streamId);

        console.log(`Audio capture stopped for stream ${streamId}`);
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error("Failed to stop audio capture:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to stop audio capture",
      };
    }
  }

  /**
   * Cleanup all resources when offscreen document is closed
   */
  cleanup(): void {
    // Stop all active streams
    this.activeStreams.forEach((stream, streamId) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    this.activeStreams.clear();

    // Close audio context
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close();
    }

    console.log("Offscreen document cleanup completed");
  }
}

// Initialize the offscreen audio capture handler
const offscreenCapture = new OffscreenAudioCapture();

// Cleanup when the document is about to be closed
window.addEventListener("beforeunload", () => {
  offscreenCapture.cleanup();
});
