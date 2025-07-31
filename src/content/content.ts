// Content script for ShaderToy canvas detection and capture
import { RecordingError, RecordingException } from "../types/errors";
import { MediaStreamInfo, VideoStreamConstraints } from "../types/media";

interface CanvasDetectionResult {
  canvas: HTMLCanvasElement | null;
  error?: RecordingError;
  message?: string;
}

interface CanvasStreamOptions {
  frameRate: number;
  videoBitsPerSecond?: number;
}

interface ContentScriptMessage {
  type:
    | "START_CANVAS_CAPTURE"
    | "STOP_CANVAS_CAPTURE"
    | "GET_CANVAS_STATUS"
    | "start-canvas-capture"
    | "stop-canvas-capture"
    | "get-canvas-status";
  options?: CanvasStreamOptions;
}

interface ContentScriptResponse {
  success: boolean;
  stream?: MediaStream;
  error?: RecordingError;
  message?: string;
  canvasInfo?: {
    width: number;
    height: number;
    found: boolean;
  };
}

class ShaderToyCanvasDetector {
  private canvas: HTMLCanvasElement | null = null;
  private currentStream: MediaStream | null = null;
  private isCapturing = false;

  constructor() {
    this.setupMessageListener();
    console.log("ShaderToy Audio-Video Recorder content script loaded");
  }

  /**
   * Detect ShaderToy canvas element with multiple fallback strategies
   */
  public detectCanvas(): CanvasDetectionResult {
    try {
      // Primary detection: ShaderToy's main canvas ID
      let canvas = document.getElementById("demogl") as HTMLCanvasElement;

      if (canvas && this.validateCanvas(canvas)) {
        this.canvas = canvas;
        return { canvas };
      }

      // Fallback 1: Look for canvas with specific classes
      const canvasSelectors = [
        "canvas#demogl",
        "canvas.demogl",
        "canvas[id*='demo']",
        "canvas[id*='gl']",
        "#player canvas",
        ".player canvas",
      ];

      for (const selector of canvasSelectors) {
        canvas = document.querySelector(selector) as HTMLCanvasElement;
        if (canvas && this.validateCanvas(canvas)) {
          this.canvas = canvas;
          return { canvas };
        }
      }

      // Fallback 2: Find the largest canvas element (likely the main render target)
      const allCanvases = Array.from(document.querySelectorAll("canvas"));
      if (allCanvases.length > 0) {
        const largestCanvas = allCanvases.reduce((largest, current) => {
          const currentArea = current.width * current.height;
          const largestArea = largest.width * largest.height;
          return currentArea > largestArea ? current : largest;
        });

        if (this.validateCanvas(largestCanvas)) {
          this.canvas = largestCanvas;
          return { canvas: largestCanvas };
        }
      }

      // No valid canvas found
      return {
        canvas: null,
        error: RecordingError.CANVAS_NOT_FOUND,
        message: "No valid ShaderToy canvas element found on this page",
      };
    } catch (error) {
      console.error("Error detecting canvas:", error);
      return {
        canvas: null,
        error: RecordingError.CANVAS_NOT_FOUND,
        message: `Canvas detection failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Validate that a canvas element is suitable for recording
   */
  private validateCanvas(canvas: HTMLCanvasElement): boolean {
    if (!canvas) return false;

    // Check if canvas has reasonable dimensions
    if (canvas.width < 100 || canvas.height < 100) {
      return false;
    }

    // Check if canvas is visible
    const style = window.getComputedStyle(canvas);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    // Check if canvas has a WebGL context (typical for ShaderToy)
    try {
      const context = canvas.getContext("webgl") || canvas.getContext("webgl2");
      return context !== null;
    } catch {
      // If WebGL check fails, still allow the canvas if it meets other criteria
      return true;
    }
  }

  /**
   * Start capturing canvas stream with specified options
   */
  public startCanvasCapture(
    options: CanvasStreamOptions
  ): ContentScriptResponse {
    try {
      if (this.isCapturing) {
        return {
          success: false,
          error: RecordingError.RECORDING_FAILED,
          message: "Canvas capture is already active",
        };
      }

      const detection = this.detectCanvas();
      if (!detection.canvas) {
        return {
          success: false,
          error: detection.error || RecordingError.CANVAS_NOT_FOUND,
          message: detection.message || "Canvas not found",
        };
      }

      // Create stream from canvas
      const stream = detection.canvas.captureStream(options.frameRate);

      if (!stream || stream.getVideoTracks().length === 0) {
        throw new RecordingException(
          RecordingError.RECORDING_FAILED,
          "Failed to create video stream from canvas"
        );
      }

      this.currentStream = stream;
      this.isCapturing = true;

      return {
        success: true,
        stream,
        canvasInfo: {
          width: detection.canvas.width,
          height: detection.canvas.height,
          found: true,
        },
      };
    } catch (error) {
      console.error("Error starting canvas capture:", error);
      return {
        success: false,
        error: RecordingError.RECORDING_FAILED,
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Stop canvas capture and cleanup resources
   */
  public stopCanvasCapture(): ContentScriptResponse {
    try {
      if (!this.isCapturing || !this.currentStream) {
        return {
          success: false,
          error: RecordingError.RECORDING_FAILED,
          message: "No active canvas capture to stop",
        };
      }

      // Stop all tracks in the stream
      this.currentStream.getTracks().forEach((track) => {
        track.stop();
      });

      this.currentStream = null;
      this.isCapturing = false;

      return {
        success: true,
        message: "Canvas capture stopped successfully",
      };
    } catch (error) {
      console.error("Error stopping canvas capture:", error);
      return {
        success: false,
        error: RecordingError.RECORDING_FAILED,
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Get current canvas status and information
   */
  public getCanvasStatus(): ContentScriptResponse {
    const detection = this.detectCanvas();

    return {
      success: true,
      canvasInfo: {
        width: detection.canvas?.width || 0,
        height: detection.canvas?.height || 0,
        found: detection.canvas !== null,
      },
      message: this.isCapturing
        ? "Canvas capture active"
        : "Canvas capture inactive",
    };
  }

  /**
   * Setup message listener for communication with popup/background
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: ContentScriptMessage, sender, sendResponse) => {
        try {
          switch (message.type) {
            case "START_CANVAS_CAPTURE":
            case "start-canvas-capture":
              const startResult = this.startCanvasCapture(
                message.options || { frameRate: 60 }
              );
              sendResponse(startResult);
              break;

            case "STOP_CANVAS_CAPTURE":
            case "stop-canvas-capture":
              const stopResult = this.stopCanvasCapture();
              sendResponse(stopResult);
              break;

            case "GET_CANVAS_STATUS":
            case "get-canvas-status":
              const statusResult = this.getCanvasStatus();
              sendResponse(statusResult);
              break;

            default:
              sendResponse({
                success: false,
                error: RecordingError.RECORDING_FAILED,
                message: `Unknown message type: ${message.type}`,
              });
          }
        } catch (error) {
          console.error("Error handling message:", error);
          sendResponse({
            success: false,
            error: RecordingError.RECORDING_FAILED,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }

        return true; // Keep message channel open for async response
      }
    );
  }

  /**
   * Cleanup resources when content script is unloaded
   */
  public cleanup(): void {
    if (this.currentStream) {
      this.stopCanvasCapture();
    }
  }
}

// Initialize the canvas detector
const canvasDetector = new ShaderToyCanvasDetector();

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  canvasDetector.cleanup();
});

// Export for testing
if (typeof window !== "undefined") {
  (window as any).__shaderToyCanvasDetector = canvasDetector;
}
