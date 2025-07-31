import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { RecordingError } from "../../types/errors";

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
  },
};

// Mock global chrome object
(global as any).chrome = mockChrome;

// Mock HTMLCanvasElement methods
const mockCaptureStream = vi.fn();
const mockGetContext = vi.fn();

// Mock canvas element
const createMockCanvas = (width = 800, height = 600, id = "demogl") => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.id = id;

  // Mock methods
  canvas.captureStream = mockCaptureStream;
  canvas.getContext = mockGetContext;

  return canvas;
};

// Mock MediaStream
const createMockMediaStream = (hasVideoTracks = true) => {
  const mockTrack = {
    stop: vi.fn(),
    kind: "video" as const,
    id: "test-track",
    label: "test-track",
    enabled: true,
    muted: false,
    readyState: "live" as MediaStreamTrackState,
  };

  return {
    getTracks: vi.fn(() => (hasVideoTracks ? [mockTrack] : [])),
    getVideoTracks: vi.fn(() => (hasVideoTracks ? [mockTrack] : [])),
    getAudioTracks: vi.fn(() => []),
    id: "test-stream",
    active: true,
  } as unknown as MediaStream;
};

describe("ShaderToy Canvas Detection and Capture", () => {
  let canvasDetector: any;

  beforeEach(async () => {
    // Clear DOM
    document.body.innerHTML = "";

    // Reset canvas-specific mocks
    mockCaptureStream.mockReset();
    mockGetContext.mockReset();

    // Default mock implementations
    mockGetContext.mockReturnValue({}); // Mock WebGL context
    mockCaptureStream.mockReturnValue(createMockMediaStream());

    // Import and initialize
    await import("../content");
    canvasDetector = (window as any).__shaderToyCanvasDetector;
  });

  afterEach(() => {
    // Cleanup
    if (canvasDetector) {
      canvasDetector.cleanup();
    }
  });

  describe("Canvas Detection", () => {
    test("should detect canvas by primary ID", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const result = canvasDetector.detectCanvas();

      expect(result.canvas).toBe(canvas);
      expect(result.error).toBeUndefined();
    });

    test("should detect canvas by fallback selectors", () => {
      const canvas = createMockCanvas(800, 600, "demo-canvas");
      canvas.className = "demogl";
      document.body.appendChild(canvas);

      const result = canvasDetector.detectCanvas();

      expect(result.canvas).toBe(canvas);
      expect(result.error).toBeUndefined();
    });

    test("should find largest canvas when multiple exist", () => {
      const smallCanvas = createMockCanvas(400, 300, "small");
      const largeCanvas = createMockCanvas(1200, 800, "large");

      document.body.appendChild(smallCanvas);
      document.body.appendChild(largeCanvas);

      const result = canvasDetector.detectCanvas();

      expect(result.canvas).toBe(largeCanvas);
    });

    test("should return error when no canvas found", () => {
      const result = canvasDetector.detectCanvas();

      expect(result.canvas).toBeNull();
      expect(result.error).toBe(RecordingError.CANVAS_NOT_FOUND);
      expect(result.message).toContain("canvas element found");
    });

    test("should reject canvas with invalid dimensions", () => {
      const tinyCanvas = createMockCanvas(50, 50, "demogl");
      document.body.appendChild(tinyCanvas);

      const result = canvasDetector.detectCanvas();

      expect(result.canvas).toBeNull();
      expect(result.error).toBe(RecordingError.CANVAS_NOT_FOUND);
    });

    test("should reject hidden canvas", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      canvas.style.display = "none";
      document.body.appendChild(canvas);

      const result = canvasDetector.detectCanvas();

      expect(result.canvas).toBeNull();
      expect(result.error).toBe(RecordingError.CANVAS_NOT_FOUND);
    });

    test("should handle canvas detection errors gracefully", () => {
      // Mock getElementById to throw an error
      const originalGetElementById = document.getElementById;
      document.getElementById = vi.fn(() => {
        throw new Error("DOM access error");
      });

      const result = canvasDetector.detectCanvas();

      expect(result.canvas).toBeNull();
      expect(result.error).toBe(RecordingError.CANVAS_NOT_FOUND);
      expect(result.message).toContain("Canvas detection failed");

      // Restore original method
      document.getElementById = originalGetElementById;
    });
  });

  describe("Canvas Stream Capture", () => {
    test("should start canvas capture successfully", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const result = canvasDetector.startCanvasCapture({ frameRate: 60 });

      expect(result.success).toBe(true);
      expect(result.stream).toBeDefined();
      expect(result.canvasInfo).toEqual({
        width: 800,
        height: 600,
        found: true,
      });
      expect(mockCaptureStream).toHaveBeenCalledWith(60);
    });

    test("should fail when canvas not found", () => {
      const result = canvasDetector.startCanvasCapture({ frameRate: 60 });

      expect(result.success).toBe(false);
      expect(result.error).toBe(RecordingError.CANVAS_NOT_FOUND);
      expect(result.message).toContain("canvas element found");
    });

    test("should fail when already capturing", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      // Start first capture
      canvasDetector.startCanvasCapture({ frameRate: 60 });

      // Try to start second capture
      const result = canvasDetector.startCanvasCapture({ frameRate: 30 });

      expect(result.success).toBe(false);
      expect(result.error).toBe(RecordingError.RECORDING_FAILED);
      expect(result.message).toContain("already active");
    });

    test("should fail when captureStream returns invalid stream", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      // Mock captureStream to return stream without video tracks
      mockCaptureStream.mockReturnValue(createMockMediaStream(false));

      const result = canvasDetector.startCanvasCapture({ frameRate: 60 });

      expect(result.success).toBe(false);
      expect(result.error).toBe(RecordingError.RECORDING_FAILED);
    });

    test("should handle captureStream errors", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      // Mock captureStream to throw error
      mockCaptureStream.mockImplementation(() => {
        throw new Error("Capture failed");
      });

      const result = canvasDetector.startCanvasCapture({ frameRate: 60 });

      expect(result.success).toBe(false);
      expect(result.error).toBe(RecordingError.RECORDING_FAILED);
      expect(result.message).toContain("Capture failed");
    });
  });

  describe("Canvas Capture Stop", () => {
    test("should stop canvas capture successfully", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      // Start capture first
      canvasDetector.startCanvasCapture({ frameRate: 60 });

      // Stop capture
      const result = canvasDetector.stopCanvasCapture();

      expect(result.success).toBe(true);
      expect(result.message).toContain("stopped successfully");
    });

    test("should fail when no active capture", () => {
      const result = canvasDetector.stopCanvasCapture();

      expect(result.success).toBe(false);
      expect(result.error).toBe(RecordingError.RECORDING_FAILED);
      expect(result.message).toContain("No active canvas capture");
    });

    test("should stop all tracks when stopping capture", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockStream = createMockMediaStream();
      mockCaptureStream.mockReturnValue(mockStream);

      // Start capture
      canvasDetector.startCanvasCapture({ frameRate: 60 });

      // Stop capture
      canvasDetector.stopCanvasCapture();

      // Verify tracks were stopped
      const tracks = mockStream.getTracks();
      tracks.forEach((track) => {
        expect(track.stop).toHaveBeenCalled();
      });
    });
  });

  describe("Canvas Status", () => {
    test("should return status when canvas found", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const result = canvasDetector.getCanvasStatus();

      expect(result.success).toBe(true);
      expect(result.canvasInfo).toEqual({
        width: 800,
        height: 600,
        found: true,
      });
      expect(result.message).toContain("inactive");
    });

    test("should return status when canvas not found", () => {
      const result = canvasDetector.getCanvasStatus();

      expect(result.success).toBe(true);
      expect(result.canvasInfo).toEqual({
        width: 0,
        height: 0,
        found: false,
      });
    });

    test("should indicate active status when capturing", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      // Start capture
      canvasDetector.startCanvasCapture({ frameRate: 60 });

      const result = canvasDetector.getCanvasStatus();

      expect(result.success).toBe(true);
      expect(result.message).toContain("active");
    });
  });

  describe("Initialization", () => {
    test("should initialize and register message listener", () => {
      // Verify that the Chrome message listener was registered
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    test("should expose canvas detector on window for testing", () => {
      expect((window as any).__shaderToyCanvasDetector).toBeDefined();
      expect(canvasDetector).toBeDefined();
    });
  });

  describe("Cleanup", () => {
    test("should cleanup resources on page unload", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      // Start capture
      canvasDetector.startCanvasCapture({ frameRate: 60 });

      // Simulate page unload
      window.dispatchEvent(new Event("beforeunload"));

      // Verify cleanup was called (stream should be stopped)
      const statusResult = canvasDetector.getCanvasStatus();
      expect(statusResult.message).toContain("inactive");
    });

    test("should stop active streams during cleanup", () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockStream = createMockMediaStream();
      mockCaptureStream.mockReturnValue(mockStream);

      // Start capture
      canvasDetector.startCanvasCapture({ frameRate: 60 });

      // Call cleanup directly
      canvasDetector.cleanup();

      // Verify tracks were stopped
      const tracks = mockStream.getTracks();
      tracks.forEach((track) => {
        expect(track.stop).toHaveBeenCalled();
      });
    });
  });
});
