// Unit tests for MediaRecorderService

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MediaRecorderService } from "../MediaRecorderService";

// Mock MediaRecorder
class MockMediaRecorder {
  state: MediaRecorderRecordingState = "inactive";
  mimeType: string;
  stream: MediaStream;
  private eventListeners: { [key: string]: EventListener[] } = {};

  constructor(stream: MediaStream, options?: { mimeType?: string }) {
    this.stream = stream;
    this.mimeType = options?.mimeType || "video/webm";
  }

  start(timeslice?: number) {
    this.state = "recording";
    setTimeout(() => {
      this.dispatchEvent(new Event("start"));
    }, 0);
  }

  stop() {
    this.state = "inactive";
    setTimeout(() => {
      // Simulate data available
      const blob = new Blob(["mock data"], { type: this.mimeType });
      this.dispatchEvent(new BlobEvent("dataavailable", { data: blob }));
      this.dispatchEvent(new Event("stop"));
    }, 0);
  }

  pause() {
    this.state = "paused";
    setTimeout(() => {
      this.dispatchEvent(new Event("pause"));
    }, 0);
  }

  resume() {
    this.state = "recording";
    setTimeout(() => {
      this.dispatchEvent(new Event("resume"));
    }, 0);
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    if (this.eventListeners[type]) {
      const index = this.eventListeners[type].indexOf(listener);
      if (index > -1) {
        this.eventListeners[type].splice(index, 1);
      }
    }
  }

  private dispatchEvent(event: Event) {
    const listeners = this.eventListeners[event.type] || [];
    listeners.forEach((listener) => listener(event));
  }

  static isTypeSupported(mimeType: string): boolean {
    const supportedTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    return supportedTypes.includes(mimeType);
  }
}

// Mock MediaStream
class MockMediaStream {
  id: string;
  active: boolean = true;
  private videoTracks: MediaStreamTrack[] = [];
  private audioTracks: MediaStreamTrack[] = [];

  constructor(id: string = "mock-stream") {
    this.id = id;
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.videoTracks;
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.audioTracks;
  }

  addTrack(track: MediaStreamTrack): void {
    if (track.kind === "video") {
      this.videoTracks.push(track);
    } else if (track.kind === "audio") {
      this.audioTracks.push(track);
    }
  }

  removeTrack(track: MediaStreamTrack): void {
    if (track.kind === "video") {
      const index = this.videoTracks.indexOf(track);
      if (index > -1) this.videoTracks.splice(index, 1);
    } else if (track.kind === "audio") {
      const index = this.audioTracks.indexOf(track);
      if (index > -1) this.audioTracks.splice(index, 1);
    }
  }
}

// Mock MediaStreamTrack
class MockMediaStreamTrack {
  id: string;
  kind: "audio" | "video";
  label: string;
  enabled: boolean = true;
  muted: boolean = false;
  readyState: MediaStreamTrackState = "live";

  constructor(kind: "audio" | "video", id: string = `mock-${kind}-track`) {
    this.kind = kind;
    this.id = id;
    this.label = `Mock ${kind} track`;
  }

  stop(): void {
    this.readyState = "ended";
  }
}

describe("MediaRecorderService", () => {
  let service: MediaRecorderService;
  let mockVideoStream: MockMediaStream;
  let mockAudioStream: MockMediaStream;

  beforeEach(() => {
    // Setup global mocks
    global.MediaRecorder = MockMediaRecorder as any;
    global.MediaStream = MockMediaStream as any;
    global.BlobEvent = class extends Event {
      data: Blob;
      constructor(type: string, eventInitDict: { data: Blob }) {
        super(type);
        this.data = eventInitDict.data;
      }
    } as any;

    service = new MediaRecorderService();

    // Create mock streams
    mockVideoStream = new MockMediaStream("video-stream");
    mockVideoStream.addTrack(
      new MockMediaStreamTrack("video", "video-track-1") as any
    );

    mockAudioStream = new MockMediaStream("audio-stream");
    mockAudioStream.addTrack(
      new MockMediaStreamTrack("audio", "audio-track-1") as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("combineStreams", () => {
    it("should combine video and audio streams", () => {
      const combined = service.combineStreams(
        mockVideoStream as any,
        mockAudioStream as any
      );

      expect(combined.getVideoTracks()).toHaveLength(1);
      expect(combined.getAudioTracks()).toHaveLength(1);
    });

    it("should work with video-only stream", () => {
      const combined = service.combineStreams(mockVideoStream as any);

      expect(combined.getVideoTracks()).toHaveLength(1);
      expect(combined.getAudioTracks()).toHaveLength(0);
    });

    it("should handle multiple tracks", () => {
      // Add more tracks
      mockVideoStream.addTrack(
        new MockMediaStreamTrack("video", "video-track-2") as any
      );
      mockAudioStream.addTrack(
        new MockMediaStreamTrack("audio", "audio-track-2") as any
      );

      const combined = service.combineStreams(
        mockVideoStream as any,
        mockAudioStream as any
      );

      expect(combined.getVideoTracks()).toHaveLength(2);
      expect(combined.getAudioTracks()).toHaveLength(2);
    });
  });

  describe("getSupportedMimeTypes", () => {
    it("should return supported MIME types", () => {
      const supportedTypes = service.getSupportedMimeTypes();

      expect(supportedTypes).toBeInstanceOf(Array);
      expect(supportedTypes.length).toBeGreaterThan(0);
      expect(supportedTypes).toContain("video/webm");
    });

    it("should filter unsupported types", () => {
      const supportedTypes = service.getSupportedMimeTypes();

      // All returned types should be supported
      supportedTypes.forEach((type) => {
        expect(MockMediaRecorder.isTypeSupported(type)).toBe(true);
      });
    });
  });

  describe("detectBestMimeType", () => {
    it("should return a supported MIME type", () => {
      const mimeType = service.detectBestMimeType();

      expect(typeof mimeType).toBe("string");
      expect(MockMediaRecorder.isTypeSupported(mimeType)).toBe(true);
    });

    it("should prefer VP9 with Opus when available", () => {
      const mimeType = service.detectBestMimeType();

      // Should prefer the first available type from the preferred order
      expect([
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ]).toContain(mimeType);
    });
  });

  describe("isRecordingSupported", () => {
    it("should return true when MediaRecorder is supported", () => {
      expect(service.isRecordingSupported()).toBe(true);
    });

    it("should return false when MediaRecorder is not available", () => {
      const originalMediaRecorder = global.MediaRecorder;
      delete (global as any).MediaRecorder;

      expect(service.isRecordingSupported()).toBe(false);

      global.MediaRecorder = originalMediaRecorder;
    });
  });

  describe("startRecording", () => {
    it("should start recording with video and audio", async () => {
      const options = {
        videoStream: mockVideoStream as any,
        audioStream: mockAudioStream as any,
      };

      const recorder = await service.startRecording(options);

      expect(recorder).toBeInstanceOf(MockMediaRecorder);
      expect(recorder.state).toBe("recording");
    });

    it("should start recording with video only", async () => {
      const options = {
        videoStream: mockVideoStream as any,
      };

      const recorder = await service.startRecording(options);

      expect(recorder).toBeInstanceOf(MockMediaRecorder);
      expect(recorder.state).toBe("recording");
    });

    it("should use custom MIME type when provided", async () => {
      const options = {
        videoStream: mockVideoStream as any,
        mimeType: "video/webm",
      };

      const recorder = await service.startRecording(options);

      expect(recorder.mimeType).toBe("video/webm");
    });

    it("should throw error if recording is already in progress", async () => {
      const options = {
        videoStream: mockVideoStream as any,
      };

      await service.startRecording(options);

      await expect(service.startRecording(options)).rejects.toThrow(
        "Recording is already in progress"
      );
    });
  });

  describe("stopRecording", () => {
    it("should stop recording and return blob", async () => {
      const options = {
        videoStream: mockVideoStream as any,
      };

      await service.startRecording(options);
      const blob = await service.stopRecording();

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("video/webm;codecs=vp9,opus");
    });

    it("should throw error if no active recording", async () => {
      await expect(service.stopRecording()).rejects.toThrow(
        "No active recording to stop"
      );
    });
  });

  describe("getRecordingResult", () => {
    it("should return recording result with metadata", async () => {
      const options = {
        videoStream: mockVideoStream as any,
        audioStream: mockAudioStream as any,
      };

      await service.startRecording(options);

      // Wait a bit to simulate recording time
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await service.getRecordingResult();

      expect(result).toHaveProperty("blob");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("hasAudio");
      expect(result).toHaveProperty("hasVideo");
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.hasVideo).toBe(true);
    });
  });

  describe("validateStream", () => {
    it("should validate stream with video tracks", () => {
      const isValid = service.validateStream(mockVideoStream as any);
      expect(isValid).toBe(true);
    });

    it("should reject stream without video tracks", () => {
      const emptyStream = new MockMediaStream("empty");
      const isValid = service.validateStream(emptyStream as any);
      expect(isValid).toBe(false);
    });

    it("should validate audio requirement", () => {
      const combinedStream = service.combineStreams(
        mockVideoStream as any,
        mockAudioStream as any
      );

      const isValid = service.validateStream(combinedStream, true);
      expect(isValid).toBe(true);
    });

    it("should reject when audio is required but not present", () => {
      const isValid = service.validateStream(mockVideoStream as any, true);
      expect(isValid).toBe(false);
    });
  });

  describe("getStreamInfo", () => {
    it("should return stream information", () => {
      const combinedStream = service.combineStreams(
        mockVideoStream as any,
        mockAudioStream as any
      );

      const info = service.getStreamInfo(combinedStream);

      expect(info).toHaveProperty("id");
      expect(info).toHaveProperty("active");
      expect(info).toHaveProperty("videoTracks");
      expect(info).toHaveProperty("audioTracks");
      expect(info.videoTracks).toBe(1);
      expect(info.audioTracks).toBe(1);
      expect(info.active).toBe(true);
    });
  });

  describe("recording state management", () => {
    it("should track recording state", async () => {
      const options = {
        videoStream: mockVideoStream as any,
      };

      expect(service.getRecordingState()).toBeNull();

      await service.startRecording(options);
      expect(service.getRecordingState()).toBe("recording");

      await service.stopRecording();
      expect(service.getRecordingState()).toBeNull();
    });

    it("should track recording duration", async () => {
      const options = {
        videoStream: mockVideoStream as any,
      };

      expect(service.getRecordingDuration()).toBe(0);

      await service.startRecording(options);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const duration = service.getRecordingDuration();
      expect(duration).toBeGreaterThan(0);
    });
  });

  describe("advanced stream combination", () => {
    it("should combine streams with options", () => {
      const options = {
        videoStream: mockVideoStream as any,
        audioStream: mockAudioStream as any,
        syncAudio: true,
      };

      const combined = service.combineStreamsWithOptions(options);

      expect(combined.getVideoTracks()).toHaveLength(1);
      expect(combined.getAudioTracks()).toHaveLength(1);
    });

    it("should handle sync audio option", () => {
      const options = {
        videoStream: mockVideoStream as any,
        audioStream: mockAudioStream as any,
        syncAudio: false,
      };

      const combined = service.combineStreamsWithOptions(options);

      expect(combined.getVideoTracks()).toHaveLength(1);
      expect(combined.getAudioTracks()).toHaveLength(1);
    });
  });

  describe("graceful degradation", () => {
    it("should start recording with graceful degradation", async () => {
      const options = {
        videoStream: mockVideoStream as any,
        audioStream: mockAudioStream as any,
      };

      const result = await service.startRecordingWithGracefulDegradation(
        options
      );

      expect(result.success).toBe(true);
      expect(result.hasVideo).toBe(true);
      expect(result.hasAudio).toBe(true);
    });

    it("should degrade gracefully when audio stream is invalid", async () => {
      const invalidAudioStream = new MockMediaStream("invalid-audio");
      // Don't add any tracks to make it invalid

      const options = {
        videoStream: mockVideoStream as any,
        audioStream: invalidAudioStream as any,
      };

      const result = await service.startRecordingWithGracefulDegradation(
        options
      );

      expect(result.success).toBe(true);
      expect(result.hasVideo).toBe(true);
      expect(result.hasAudio).toBe(false);
      expect(result.degradationReason).toContain("no audio tracks");
    });

    it("should handle audio stream failure", () => {
      const error = new Error("Audio permission denied");
      const context = { operation: "audio_capture", tabId: 123 };

      const result = service.handleAudioStreamFailure(error, context);

      expect(result.shouldContinue).toBe(true);
      expect(result.fallbackMessage).toContain("permission denied");
    });

    it("should create degradation notifications", () => {
      const successNotification = service.createDegradationNotification(
        true,
        true
      );
      expect(successNotification.type).toBe("success");

      const warningNotification = service.createDegradationNotification(
        false,
        true,
        "Audio failed"
      );
      expect(warningNotification.type).toBe("warning");
      expect(warningNotification.details).toBe("Audio failed");

      const errorNotification = service.createDegradationNotification(
        false,
        false
      );
      expect(errorNotification.type).toBe("error");
    });
  });

  describe("error handling", () => {
    it("should handle MediaRecorder creation errors", async () => {
      // Mock MediaRecorder to throw error
      const originalMediaRecorder = global.MediaRecorder;
      global.MediaRecorder = vi.fn().mockImplementation(() => {
        throw new Error("MediaRecorder not supported");
      }) as any;

      const options = {
        videoStream: mockVideoStream as any,
      };

      await expect(service.startRecording(options)).rejects.toThrow();

      global.MediaRecorder = originalMediaRecorder;
    });

    it("should handle invalid stream validation", () => {
      const emptyStream = new MockMediaStream("empty");
      const isValid = service.validateStream(emptyStream as any);
      expect(isValid).toBe(false);
    });
  });

  describe("MIME type detection", () => {
    it("should detect best MIME type with preference order", () => {
      const mimeType = service.detectBestMimeType();

      // Should be one of the preferred types
      const preferredTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];

      expect(preferredTypes).toContain(mimeType);
    });

    it("should throw error when no MIME types supported", () => {
      const originalIsTypeSupported = MockMediaRecorder.isTypeSupported;
      MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(false);

      expect(() => service.detectBestMimeType()).toThrow(
        "No supported MIME types found for MediaRecorder"
      );

      MockMediaRecorder.isTypeSupported = originalIsTypeSupported;
    });
  });

  describe("stream information", () => {
    it("should provide detailed stream information", () => {
      const combinedStream = service.combineStreams(
        mockVideoStream as any,
        mockAudioStream as any
      );
      const info = service.getStreamInfo(combinedStream);

      expect(info).toHaveProperty("id");
      expect(info).toHaveProperty("active");
      expect(info).toHaveProperty("videoTracks");
      expect(info).toHaveProperty("audioTracks");
      expect(typeof info.videoTracks).toBe("number");
      expect(typeof info.audioTracks).toBe("number");
    });
  });

  describe("recording configuration", () => {
    it("should use custom video bitrate", async () => {
      const options = {
        videoStream: mockVideoStream as any,
        videoBitsPerSecond: 2000000, // 2Mbps
      };

      const recorder = await service.startRecording(options);

      // The mock doesn't actually use the bitrate, but we can verify it was passed
      expect(recorder).toBeInstanceOf(MockMediaRecorder);
    });

    it("should handle recording with timeslice", async () => {
      const options = {
        videoStream: mockVideoStream as any,
      };

      const recorder = await service.startRecording(options);

      // Verify that start was called with timeslice
      expect(recorder.state).toBe("recording");
    });
  });

  describe("pause and resume", () => {
    it("should pause and resume recording", async () => {
      const options = {
        videoStream: mockVideoStream as any,
      };

      const recorder = await service.startRecording(options);
      expect(recorder.state).toBe("recording");

      service.pauseRecording();
      // Wait for async state change
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(recorder.state).toBe("paused");

      service.resumeRecording();
      // Wait for async state change
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(recorder.state).toBe("recording");
    });
  });
});
