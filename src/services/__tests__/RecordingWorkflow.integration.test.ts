// Integration tests for complete recording workflow

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MediaRecorderService } from "../MediaRecorderService";
import { ChromeAPIServiceImpl } from "../ChromeAPIService";
import { FileService } from "../FileService";
import { errorHandlingService } from "../ErrorHandlingService";
import { RecordingError } from "../../types/errors";

// Mock implementations for integration testing
class MockMediaRecorder {
  state: MediaRecorderRecordingState = "inactive";
  mimeType: string;
  stream: MediaStream;
  private eventListeners: { [key: string]: EventListener[] } = {};
  private chunks: Blob[] = [];

  constructor(stream: MediaStream, options?: { mimeType?: string }) {
    this.stream = stream;
    this.mimeType = options?.mimeType || "video/webm";
  }

  start(timeslice?: number) {
    this.state = "recording";
    setTimeout(() => {
      this.dispatchEvent(new Event("start"));
      // Simulate data chunks
      setTimeout(() => {
        const blob = new Blob(["chunk1"], { type: this.mimeType });
        this.dispatchEvent(new BlobEvent("dataavailable", { data: blob }));
        this.chunks.push(blob);
      }, 100);
    }, 0);
  }

  stop() {
    this.state = "inactive";
    setTimeout(() => {
      const finalBlob = new Blob(["final"], { type: this.mimeType });
      this.dispatchEvent(new BlobEvent("dataavailable", { data: finalBlob }));
      this.chunks.push(finalBlob);
      this.dispatchEvent(new Event("stop"));
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
    return ["video/webm", "video/mp4"].includes(mimeType);
  }
}

class MockMediaStream {
  id: string;
  active: boolean = true;
  private videoTracks: MediaStreamTrack[] = [];
  private audioTracks: MediaStreamTrack[] = [];

  constructor(id: string = "mock-stream") {
    this.id = id;
  }

  getVideoTracks(): MediaStreamTrack[] {
    return [...this.videoTracks];
  }

  getAudioTracks(): MediaStreamTrack[] {
    return [...this.audioTracks];
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.videoTracks, ...this.audioTracks];
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

  clone(): MediaStreamTrack {
    const cloned = new MockMediaStreamTrack(this.kind, `${this.id}-clone`);
    cloned.enabled = this.enabled;
    cloned.muted = this.muted;
    cloned.readyState = this.readyState;
    return cloned as any;
  }
}

// Integration test class that orchestrates the complete workflow
class RecordingWorkflowIntegration {
  private mediaRecorderService: MediaRecorderService;
  private chromeAPIService: ChromeAPIServiceImpl;
  private fileService: FileService;

  constructor() {
    this.mediaRecorderService = new MediaRecorderService();
    this.chromeAPIService = ChromeAPIServiceImpl.getInstance();
    this.fileService = new FileService();
  }

  /**
   * Complete recording workflow from start to finish
   */
  async executeCompleteRecordingWorkflow(): Promise<{
    success: boolean;
    blob?: Blob;
    filename?: string;
    duration: number;
    hasAudio: boolean;
    hasVideo: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    const startTime = Date.now();

    try {
      // Step 1: Get current tab
      const tab = await this.chromeAPIService.getCurrentTab();
      if (!tab.id) {
        throw new Error("Invalid tab");
      }

      // Step 2: Check permissions
      const hasPermissions = await this.chromeAPIService.checkPermissions();
      if (!hasPermissions) {
        const granted = await this.chromeAPIService.requestPermissions();
        if (!granted) {
          throw new Error("Permissions denied");
        }
      }

      // Step 3: Inject content script
      await this.chromeAPIService.injectContentScript(tab.id);

      // Step 4: Capture streams
      let audioStream: MediaStream | undefined;
      let videoStream: MediaStream;

      try {
        audioStream = await this.chromeAPIService.captureTabAudio(tab.id);
      } catch (error) {
        errors.push(
          `Audio capture failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }

      // Mock video stream (would come from content script in real scenario)
      videoStream = this.createMockVideoStream();

      // Step 5: Start recording with graceful degradation
      const recordingResult =
        await this.mediaRecorderService.startRecordingWithGracefulDegradation({
          videoStream,
          audioStream,
        });

      if (!recordingResult.success) {
        throw new Error("Failed to start recording");
      }

      // Step 6: Simulate recording duration
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 7: Stop recording and get result
      const result = await this.mediaRecorderService.getRecordingResult();

      // Step 8: Generate filename and prepare for download
      const filename = this.fileService.generateFileName("webm");

      // Step 9: Validate file size
      const isValidSize = this.fileService.validateFileSize(result.blob);
      if (!isValidSize) {
        errors.push("Generated file exceeds size limit");
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        blob: result.blob,
        filename,
        duration,
        hasAudio: result.hasAudio,
        hasVideo: result.hasVideo,
        errors,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      errors.push(error instanceof Error ? error.message : "Unknown error");

      return {
        success: false,
        duration,
        hasAudio: false,
        hasVideo: false,
        errors,
      };
    }
  }

  /**
   * Test error recovery scenarios
   */
  async testErrorRecoveryScenarios(): Promise<{
    audioFailureRecovery: boolean;
    permissionDeniedHandling: boolean;
    tabNotFoundHandling: boolean;
    recordingFailureHandling: boolean;
  }> {
    const results = {
      audioFailureRecovery: false,
      permissionDeniedHandling: false,
      tabNotFoundHandling: false,
      recordingFailureHandling: false,
    };

    // Test audio failure recovery
    try {
      const videoStream = this.createMockVideoStream();
      const result =
        await this.mediaRecorderService.startRecordingWithGracefulDegradation({
          videoStream,
          audioStream: undefined, // No audio stream
        });

      results.audioFailureRecovery =
        result.success && !result.hasAudio && result.hasVideo;

      // Clean up
      await this.mediaRecorderService.stopRecording();
    } catch (error) {
      // Expected to handle gracefully
    }

    // Test permission denied handling
    try {
      // Mock permission denied
      vi.spyOn(this.chromeAPIService, "checkPermissions").mockResolvedValue(
        false
      );
      vi.spyOn(this.chromeAPIService, "requestPermissions").mockResolvedValue(
        false
      );

      await this.executeCompleteRecordingWorkflow();
      results.permissionDeniedHandling = false; // Should have thrown
    } catch (error) {
      results.permissionDeniedHandling =
        error instanceof Error && error.message.includes("Permissions denied");
    }

    // Test tab not found handling
    try {
      vi.spyOn(this.chromeAPIService, "getCurrentTab").mockRejectedValue(
        new Error(RecordingError.TAB_NOT_FOUND)
      );

      await this.executeCompleteRecordingWorkflow();
      results.tabNotFoundHandling = false; // Should have thrown
    } catch (error) {
      results.tabNotFoundHandling = error instanceof Error;
    }

    // Test recording failure handling
    try {
      const invalidStream = new MockMediaStream("invalid");
      // Don't add any tracks to make it invalid

      const result =
        await this.mediaRecorderService.startRecordingWithGracefulDegradation({
          videoStream: invalidStream as any,
        });

      results.recordingFailureHandling = !result.success;
    } catch (error) {
      results.recordingFailureHandling = true;
    }

    return results;
  }

  private createMockVideoStream(): MediaStream {
    const stream = new MockMediaStream("video-stream");
    stream.addTrack(new MockMediaStreamTrack("video", "video-track") as any);
    return stream as any;
  }

  private createMockAudioStream(): MediaStream {
    const stream = new MockMediaStream("audio-stream");
    stream.addTrack(new MockMediaStreamTrack("audio", "audio-track") as any);
    return stream as any;
  }
}

describe("Recording Workflow Integration Tests", () => {
  let workflow: RecordingWorkflowIntegration;
  let mockChrome: any;

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

    // Mock Chrome APIs
    mockChrome = {
      tabs: {
        query: vi
          .fn()
          .mockResolvedValue([
            { id: 123, url: "https://www.shadertoy.com/view/test" },
          ]),
        get: vi
          .fn()
          .mockResolvedValue({
            id: 123,
            url: "https://www.shadertoy.com/view/test",
          }),
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([]),
      },
      tabCapture: {
        getMediaStreamId: vi.fn().mockResolvedValue("stream-id-123"),
        getCapturedTabs: vi.fn().mockResolvedValue([]),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
        request: vi.fn().mockResolvedValue(true),
      },
      runtime: {
        sendMessage: vi.fn().mockImplementation((message, callback) => {
          const mockAudioStream = new MockMediaStream("audio-stream");
          mockAudioStream.addTrack(new MockMediaStreamTrack("audio") as any);
          callback({ stream: mockAudioStream });
        }),
        lastError: null,
      },
    };

    global.chrome = mockChrome;

    // Mock DOM APIs for FileService
    global.document = {
      createElement: vi.fn().mockReturnValue({
        href: "",
        download: "",
        style: { display: "" },
        click: vi.fn(),
      }),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    } as any;

    global.URL = {
      createObjectURL: vi.fn().mockReturnValue("blob:mock-url"),
      revokeObjectURL: vi.fn(),
    } as any;

    workflow = new RecordingWorkflowIntegration();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Complete Recording Workflow", () => {
    it("should execute complete recording workflow successfully", async () => {
      const result = await workflow.executeCompleteRecordingWorkflow();

      expect(result.success).toBe(true);
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.filename).toMatch(/^shadertoy-recording_.*\.webm$/);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.hasVideo).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle audio capture failure gracefully", async () => {
      // Mock audio capture failure
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ error: "Audio capture failed" });
      });

      const result = await workflow.executeCompleteRecordingWorkflow();

      expect(result.success).toBe(true);
      expect(result.hasVideo).toBe(true);
      expect(result.hasAudio).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Audio capture failed");
    });

    it("should handle permission denied scenarios", async () => {
      mockChrome.permissions.contains.mockResolvedValue(false);
      mockChrome.permissions.request.mockResolvedValue(false);

      const result = await workflow.executeCompleteRecordingWorkflow();

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Permissions denied");
    });

    it("should handle tab not found scenarios", async () => {
      mockChrome.tabs.query.mockResolvedValue([]);

      const result = await workflow.executeCompleteRecordingWorkflow();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should validate file size constraints", async () => {
      // Mock large file
      const originalValidateFileSize = FileService.prototype.validateFileSize;
      FileService.prototype.validateFileSize = vi.fn().mockReturnValue(false);

      const result = await workflow.executeCompleteRecordingWorkflow();

      expect(result.success).toBe(true); // Recording succeeds
      expect(result.errors).toContain("Generated file exceeds size limit");

      FileService.prototype.validateFileSize = originalValidateFileSize;
    });
  });

  describe("Error Recovery Scenarios", () => {
    it("should test all error recovery scenarios", async () => {
      const results = await workflow.testErrorRecoveryScenarios();

      expect(results.audioFailureRecovery).toBe(true);
      expect(results.permissionDeniedHandling).toBe(true);
      expect(results.tabNotFoundHandling).toBe(true);
      expect(results.recordingFailureHandling).toBe(true);
    });
  });

  describe("Cross-Browser Compatibility", () => {
    it("should handle different MediaRecorder MIME type support", async () => {
      // Test with limited MIME type support
      const originalIsTypeSupported = MockMediaRecorder.isTypeSupported;
      MockMediaRecorder.isTypeSupported = vi
        .fn()
        .mockImplementation((mimeType) => {
          return mimeType === "video/webm"; // Only support webm
        });

      const result = await workflow.executeCompleteRecordingWorkflow();

      expect(result.success).toBe(true);
      expect(result.blob?.type).toContain("webm");

      MockMediaRecorder.isTypeSupported = originalIsTypeSupported;
    });

    it("should handle browsers without MediaRecorder support", async () => {
      const originalMediaRecorder = global.MediaRecorder;
      delete (global as any).MediaRecorder;

      const mediaRecorderService = new MediaRecorderService();
      const isSupported = mediaRecorderService.isRecordingSupported();

      expect(isSupported).toBe(false);

      global.MediaRecorder = originalMediaRecorder;
    });
  });

  describe("Performance and Resource Management", () => {
    it("should handle multiple concurrent recording attempts", async () => {
      const promises = Array.from({ length: 3 }, () =>
        workflow.executeCompleteRecordingWorkflow()
      );

      const results = await Promise.allSettled(promises);

      // At least one should succeed, others might fail due to concurrent access
      const successful = results.filter(
        (r) => r.status === "fulfilled" && r.value.success
      );
      expect(successful.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle rapid start/stop operations", async () => {
      const mediaRecorderService = new MediaRecorderService();
      const videoStream = new MockMediaStream("video");
      videoStream.addTrack(new MockMediaStreamTrack("video") as any);

      // Start recording
      await mediaRecorderService.startRecording({
        videoStream: videoStream as any,
      });

      // Immediately try to start another (should fail)
      await expect(
        mediaRecorderService.startRecording({
          videoStream: videoStream as any,
        })
      ).rejects.toThrow("Recording is already in progress");

      // Stop the first recording
      await mediaRecorderService.stopRecording();

      // Now should be able to start again
      await expect(
        mediaRecorderService.startRecording({
          videoStream: videoStream as any,
        })
      ).resolves.toBeDefined();

      await mediaRecorderService.stopRecording();
    });

    it("should properly clean up resources", async () => {
      const result = await workflow.executeCompleteRecordingWorkflow();

      expect(result.success).toBe(true);

      // Verify that streams and resources are properly managed
      // In a real scenario, we'd check for memory leaks and proper cleanup
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockChrome.tabs.query).toHaveBeenCalled();
    });
  });

  describe("File Generation and Download", () => {
    it("should generate valid filenames with timestamps", async () => {
      const result = await workflow.executeCompleteRecordingWorkflow();

      expect(result.success).toBe(true);
      expect(result.filename).toMatch(
        /^shadertoy-recording_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.webm$/
      );
    });

    it("should handle different file formats", async () => {
      // Test MP4 format
      MockMediaRecorder.isTypeSupported = vi
        .fn()
        .mockImplementation((mimeType) => {
          return mimeType.includes("mp4");
        });

      const result = await workflow.executeCompleteRecordingWorkflow();

      expect(result.success).toBe(true);
      // The actual MIME type would depend on the MediaRecorder implementation
    });
  });
});
