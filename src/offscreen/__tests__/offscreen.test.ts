import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecordingError } from "../../types/errors";

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    lastError: null,
  },
};

// Mock Web APIs
const mockNavigator = {
  mediaDevices: {
    getUserMedia: vi.fn(),
  },
};

const mockAudioContext = vi.fn(() => ({
  createMediaStreamSource: vi.fn(() => ({})),
  close: vi.fn(),
  state: "running",
}));

const mockWindow = {
  addEventListener: vi.fn(),
  AudioContext: mockAudioContext,
};

// Setup global mocks
Object.defineProperty(global, "chrome", {
  value: mockChrome,
  writable: true,
});

Object.defineProperty(global, "navigator", {
  value: mockNavigator,
  writable: true,
});

Object.defineProperty(global, "window", {
  value: mockWindow,
  writable: true,
});

Object.defineProperty(global, "AudioContext", {
  value: mockAudioContext,
  writable: true,
});

// Mock OffscreenAudioCapture class for testing
class MockOffscreenAudioCapture {
  private activeStreams: Map<string, MediaStream> = new Map();
  private audioContext: AudioContext | null = null;

  async handleMessage(message: any): Promise<any> {
    switch (message.type) {
      case "get-media-stream":
        return this.getMediaStreamFromId(message.streamId);
      case "start-audio-capture":
        return this.startAudioCapture(message.streamId, message.tabId);
      case "stop-audio-capture":
        return this.stopAudioCapture(message.streamId);
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  private async getMediaStreamFromId(streamId: string): Promise<any> {
    try {
      if (!streamId) {
        throw new Error(RecordingError.TAB_CAPTURE_FAILED);
      }

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

      this.activeStreams.set(streamId, stream);

      return { success: true, stream };
    } catch (error) {
      let errorMessage = RecordingError.TAB_CAPTURE_FAILED;
      if (error instanceof Error) {
        if (error.message.includes("Permission denied")) {
          errorMessage = RecordingError.PERMISSION_DENIED;
        } else if (error.message.includes("not supported")) {
          errorMessage = RecordingError.UNSUPPORTED_BROWSER;
        }
      }

      return { success: false, error: errorMessage };
    }
  }

  private async startAudioCapture(
    streamId: string,
    tabId?: number
  ): Promise<any> {
    try {
      const result = await this.getMediaStreamFromId(streamId);

      if (!result.success || !result.stream) {
        return result;
      }

      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      const source = this.audioContext.createMediaStreamSource(result.stream);

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Audio capture failed",
      };
    }
  }

  private async stopAudioCapture(streamId: string): Promise<any> {
    try {
      const stream = this.activeStreams.get(streamId);

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        this.activeStreams.delete(streamId);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to stop audio capture",
      };
    }
  }
}

describe("Offscreen Audio Capture", () => {
  let service: MockOffscreenAudioCapture;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
    service = new MockOffscreenAudioCapture();
  });

  describe("Message Handling", () => {
    it("should handle get-media-stream message successfully", async () => {
      const mockStream = {
        getAudioTracks: vi.fn(() => [{ kind: "audio" }]),
        getTracks: vi.fn(() => [{ stop: vi.fn() }]),
      };

      mockNavigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      const result = await service.handleMessage({
        type: "get-media-stream",
        streamId: "test-stream-id",
      });

      expect(mockNavigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: "test-stream-id",
          },
        },
        video: false,
      });
      expect(result).toEqual({ success: true, stream: mockStream });
    });

    it("should handle start-audio-capture message", async () => {
      const mockStream = {
        getAudioTracks: vi.fn(() => [{ kind: "audio" }]),
        getTracks: vi.fn(() => [{ stop: vi.fn() }]),
      };

      mockNavigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      const result = await service.handleMessage({
        type: "start-audio-capture",
        streamId: "test-stream-id",
        tabId: 123,
      });

      expect(result).toEqual({ success: true, stream: mockStream });
      expect(mockAudioContext).toHaveBeenCalled();
    });

    it("should handle stop-audio-capture message", async () => {
      // First start a capture to have something to stop
      const mockStream = {
        getAudioTracks: vi.fn(() => [{ kind: "audio" }]),
        getTracks: vi.fn(() => [{ stop: vi.fn() }]),
      };

      mockNavigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      // Start capture
      await service.handleMessage({
        type: "start-audio-capture",
        streamId: "test-stream-id",
        tabId: 123,
      });

      // Stop capture
      const result = await service.handleMessage({
        type: "stop-audio-capture",
        streamId: "test-stream-id",
      });

      expect(result).toEqual({ success: true });
    });

    it("should handle unknown message type", async () => {
      await expect(
        service.handleMessage({ type: "unknown-message" })
      ).rejects.toThrow("Unknown message type");
    });
  });

  describe("Error Handling", () => {
    it("should handle missing stream ID", async () => {
      const result = await service.handleMessage({
        type: "get-media-stream",
        streamId: "",
      });

      expect(result).toEqual({
        success: false,
        error: RecordingError.TAB_CAPTURE_FAILED,
      });
    });

    it("should handle getUserMedia permission denied", async () => {
      mockNavigator.mediaDevices.getUserMedia.mockRejectedValue(
        new Error("Permission denied")
      );

      const result = await service.handleMessage({
        type: "get-media-stream",
        streamId: "test-stream-id",
      });

      expect(result).toEqual({
        success: false,
        error: RecordingError.PERMISSION_DENIED,
      });
    });

    it("should handle unsupported browser", async () => {
      mockNavigator.mediaDevices.getUserMedia.mockRejectedValue(
        new Error("not supported")
      );

      const result = await service.handleMessage({
        type: "get-media-stream",
        streamId: "test-stream-id",
      });

      expect(result).toEqual({
        success: false,
        error: RecordingError.UNSUPPORTED_BROWSER,
      });
    });

    it("should handle stream with no audio tracks", async () => {
      const mockStream = {
        getAudioTracks: vi.fn(() => []), // No audio tracks
        getTracks: vi.fn(() => []),
      };

      mockNavigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      const result = await service.handleMessage({
        type: "get-media-stream",
        streamId: "test-stream-id",
      });

      expect(result).toEqual({
        success: false,
        error: RecordingError.TAB_CAPTURE_FAILED,
      });
    });

    it("should handle null stream from getUserMedia", async () => {
      mockNavigator.mediaDevices.getUserMedia.mockResolvedValue(null);

      const result = await service.handleMessage({
        type: "get-media-stream",
        streamId: "test-stream-id",
      });

      expect(result).toEqual({
        success: false,
        error: RecordingError.TAB_CAPTURE_FAILED,
      });
    });
  });

  describe("Resource Management", () => {
    it("should create audio context for processing", async () => {
      const mockStream = {
        getAudioTracks: vi.fn(() => [{ kind: "audio" }]),
        getTracks: vi.fn(() => [{ stop: vi.fn() }]),
      };

      mockNavigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      await service.handleMessage({
        type: "start-audio-capture",
        streamId: "test-stream-id",
        tabId: 123,
      });

      expect(mockAudioContext).toHaveBeenCalled();
    });

    it("should stop tracks when stopping capture", async () => {
      const mockTrack = { stop: vi.fn() };
      const mockStream = {
        getAudioTracks: vi.fn(() => [{ kind: "audio" }]),
        getTracks: vi.fn(() => [mockTrack]),
      };

      mockNavigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      // Start capture
      await service.handleMessage({
        type: "start-audio-capture",
        streamId: "test-stream-id",
        tabId: 123,
      });

      // Stop capture
      await service.handleMessage({
        type: "stop-audio-capture",
        streamId: "test-stream-id",
      });

      expect(mockTrack.stop).toHaveBeenCalled();
    });
  });
});
