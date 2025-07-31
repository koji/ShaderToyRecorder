import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { RecordingError } from "../../types/errors";

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
    lastError: null as any,
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
    get: vi.fn(),
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

describe("Content Script and Popup Integration", () => {
  let canvasDetector: any;
  let messageHandler: any;

  beforeEach(async () => {
    // Clear DOM
    document.body.innerHTML = "";

    // Reset mocks
    mockCaptureStream.mockReset();
    mockGetContext.mockReset();
    mockChrome.tabs.sendMessage.mockReset();

    // Default mock implementations
    mockGetContext.mockReturnValue({}); // Mock WebGL context
    mockCaptureStream.mockReturnValue(createMockMediaStream());

    // Import content script
    await import("../content");
    canvasDetector = (window as any).__shaderToyCanvasDetector;

    // Get the message handler
    const calls = mockChrome.runtime.onMessage.addListener.mock.calls;
    if (calls.length > 0) {
      messageHandler = calls[0][0];
    }
  });

  afterEach(() => {
    if (canvasDetector) {
      canvasDetector.cleanup();
    }
  });

  describe("Message Communication", () => {
    test("should handle start-canvas-capture message from popup", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockSendResponse = vi.fn();
      const message = {
        type: "start-canvas-capture",
        options: { frameRate: 60 },
      };

      // Simulate message from popup
      messageHandler(message, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          stream: expect.any(Object),
          canvasInfo: {
            width: 800,
            height: 600,
            found: true,
          },
        })
      );
    });

    test("should handle stop-canvas-capture message from popup", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockSendResponse = vi.fn();

      // Start capture first
      messageHandler(
        { type: "start-canvas-capture", options: { frameRate: 60 } },
        {},
        vi.fn()
      );

      // Then stop capture
      messageHandler({ type: "stop-canvas-capture" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining("stopped successfully"),
        })
      );
    });

    test("should handle get-canvas-status message from popup", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockSendResponse = vi.fn();

      messageHandler({ type: "get-canvas-status" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          canvasInfo: {
            width: 800,
            height: 600,
            found: true,
          },
        })
      );
    });

    test("should return error when canvas not found", async () => {
      // No canvas in DOM
      const mockSendResponse = vi.fn();

      messageHandler({ type: "start-canvas-capture" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: RecordingError.CANVAS_NOT_FOUND,
          message: expect.stringContaining("canvas element found"),
        })
      );
    });

    test("should handle canvas capture errors gracefully", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      // Mock captureStream to throw error
      mockCaptureStream.mockImplementation(() => {
        throw new Error("Canvas capture failed");
      });

      const mockSendResponse = vi.fn();

      messageHandler({ type: "start-canvas-capture" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: RecordingError.RECORDING_FAILED,
          message: expect.stringContaining("Canvas capture failed"),
        })
      );
    });
  });

  describe("Stream Management", () => {
    test("should provide valid MediaStream when canvas capture succeeds", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockStream = createMockMediaStream();
      mockCaptureStream.mockReturnValue(mockStream);

      const mockSendResponse = vi.fn();

      messageHandler(
        { type: "start-canvas-capture", options: { frameRate: 30 } },
        {},
        mockSendResponse
      );

      expect(mockCaptureStream).toHaveBeenCalledWith(30);
      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          stream: mockStream,
        })
      );
    });

    test("should stop all tracks when stopping capture", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockStream = createMockMediaStream();
      mockCaptureStream.mockReturnValue(mockStream);

      // Start capture
      messageHandler({ type: "start-canvas-capture" }, {}, vi.fn());

      // Stop capture
      messageHandler({ type: "stop-canvas-capture" }, {}, vi.fn());

      // Verify tracks were stopped
      const tracks = mockStream.getTracks();
      tracks.forEach((track) => {
        expect(track.stop).toHaveBeenCalled();
      });
    });

    test("should handle multiple start requests correctly", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockSendResponse1 = vi.fn();
      const mockSendResponse2 = vi.fn();

      // First start request
      messageHandler({ type: "start-canvas-capture" }, {}, mockSendResponse1);

      // Second start request (should fail)
      messageHandler({ type: "start-canvas-capture" }, {}, mockSendResponse2);

      expect(mockSendResponse1).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );

      expect(mockSendResponse2).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: RecordingError.RECORDING_FAILED,
          message: expect.stringContaining("already active"),
        })
      );
    });
  });

  describe("Error Handling", () => {
    test("should handle invalid canvas dimensions", async () => {
      const tinyCanvas = createMockCanvas(50, 50, "demogl");
      document.body.appendChild(tinyCanvas);

      const mockSendResponse = vi.fn();

      messageHandler({ type: "start-canvas-capture" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: RecordingError.CANVAS_NOT_FOUND,
        })
      );
    });

    test("should handle hidden canvas elements", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      canvas.style.display = "none";
      document.body.appendChild(canvas);

      const mockSendResponse = vi.fn();

      messageHandler({ type: "start-canvas-capture" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: RecordingError.CANVAS_NOT_FOUND,
        })
      );
    });

    test("should handle message handler exceptions", async () => {
      const mockSendResponse = vi.fn();

      // Mock canvasDetector to throw error
      const originalMethod = canvasDetector.startCanvasCapture;
      canvasDetector.startCanvasCapture = () => {
        throw new Error("Unexpected error");
      };

      messageHandler({ type: "start-canvas-capture" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: RecordingError.RECORDING_FAILED,
          message: "Unexpected error",
        })
      );

      // Restore original method
      canvasDetector.startCanvasCapture = originalMethod;
    });
  });

  describe("Canvas Detection Strategies", () => {
    test("should detect canvas by primary ID", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockSendResponse = vi.fn();

      messageHandler({ type: "get-canvas-status" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          canvasInfo: {
            width: 800,
            height: 600,
            found: true,
          },
        })
      );
    });

    test("should detect canvas by fallback selectors", async () => {
      const canvas = createMockCanvas(800, 600, "shader-canvas");
      canvas.className = "demogl";
      document.body.appendChild(canvas);

      const mockSendResponse = vi.fn();

      messageHandler({ type: "get-canvas-status" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          canvasInfo: {
            width: 800,
            height: 600,
            found: true,
          },
        })
      );
    });

    test("should find largest canvas when multiple exist", async () => {
      const smallCanvas = createMockCanvas(400, 300, "small");
      const largeCanvas = createMockCanvas(1200, 800, "large");

      document.body.appendChild(smallCanvas);
      document.body.appendChild(largeCanvas);

      const mockSendResponse = vi.fn();

      messageHandler({ type: "get-canvas-status" }, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          canvasInfo: {
            width: 1200,
            height: 800,
            found: true,
          },
        })
      );
    });
  });

  describe("Frame Rate Configuration", () => {
    test("should use specified frame rate for capture", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockSendResponse = vi.fn();

      messageHandler(
        {
          type: "start-canvas-capture",
          options: { frameRate: 30 },
        },
        {},
        mockSendResponse
      );

      expect(mockCaptureStream).toHaveBeenCalledWith(30);
    });

    test("should use default frame rate when not specified", async () => {
      const canvas = createMockCanvas(800, 600, "demogl");
      document.body.appendChild(canvas);

      const mockSendResponse = vi.fn();

      messageHandler({ type: "start-canvas-capture" }, {}, mockSendResponse);

      expect(mockCaptureStream).toHaveBeenCalledWith(60);
    });
  });
});
