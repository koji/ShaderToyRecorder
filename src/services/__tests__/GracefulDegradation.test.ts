import { describe, it, expect, beforeEach, vi } from "vitest";
import { mediaRecorderService } from "../MediaRecorderService";
import { RecordingError } from "../../types/errors";

// Mock MediaRecorder
const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  state: "inactive" as RecordingState,
  mimeType: "video/webm",
  videoBitsPerSecond: 0,
  audioBitsPerSecond: 0,
  stream: null as MediaStream | null,
};

// Mock MediaStream
const createMockStream = (hasVideo = true, hasAudio = true) => {
  const videoTracks = hasVideo
    ? [
        {
          id: "video-track",
          kind: "video",
          enabled: true,
          readyState: "live" as MediaStreamTrackState,
        },
      ]
    : [];
  const audioTracks = hasAudio
    ? [
        {
          id: "audio-track",
          kind: "audio",
          enabled: true,
          readyState: "live" as MediaStreamTrackState,
        },
      ]
    : [];

  return {
    id: "mock-stream",
    active: true,
    getVideoTracks: vi.fn(() => videoTracks),
    getAudioTracks: vi.fn(() => audioTracks),
    getTracks: vi.fn(() => [...videoTracks, ...audioTracks]),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaStream;
};

describe("Graceful Degradation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock MediaRecorder constructor
    global.MediaRecorder = vi.fn(() => mockMediaRecorder) as any;
    global.MediaRecorder.isTypeSupported = vi.fn(() => true);
  });

  describe("startRecordingWithGracefulDegradation", () => {
    it("starts recording successfully with both audio and video", async () => {
      const videoStream = createMockStream(true, false);
      const audioStream = createMockStream(false, true);

      const result =
        await mediaRecorderService.startRecordingWithGracefulDegradation({
          videoStream,
          audioStream,
          videoBitsPerSecond: 2500000,
        });

      expect(result.success).toBe(true);
      expect(result.hasVideo).toBe(true);
      expect(result.hasAudio).toBe(true);
      expect(result.degradationReason).toBeUndefined();
    });

    it("degrades gracefully when audio stream is invalid", async () => {
      const videoStream = createMockStream(true, false);
      const audioStream = createMockStream(false, false); // No audio tracks

      const result =
        await mediaRecorderService.startRecordingWithGracefulDegradation({
          videoStream,
          audioStream,
          videoBitsPerSecond: 2500000,
        });

      expect(result.success).toBe(true);
      expect(result.hasVideo).toBe(true);
      expect(result.hasAudio).toBe(false);
      expect(result.degradationReason).toBe("Audio stream has no audio tracks");
    });

    it("degrades gracefully when audio track is ended", async () => {
      const videoStream = createMockStream(true, false);
      const audioTracks = [
        {
          id: "audio-track",
          kind: "audio",
          enabled: true,
          readyState: "ended" as MediaStreamTrackState,
        },
      ];

      const audioStream = {
        ...createMockStream(false, false),
        getAudioTracks: vi.fn(() => audioTracks),
      } as unknown as MediaStream;

      const result =
        await mediaRecorderService.startRecordingWithGracefulDegradation({
          videoStream,
          audioStream,
          videoBitsPerSecond: 2500000,
        });

      expect(result.success).toBe(true);
      expect(result.hasVideo).toBe(true);
      expect(result.hasAudio).toBe(false);
      expect(result.degradationReason).toBe("Audio track not ready");
    });

    it("fails when video stream is invalid", async () => {
      const videoStream = createMockStream(false, false); // No video tracks
      const audioStream = createMockStream(false, true);

      await expect(
        mediaRecorderService.startRecordingWithGracefulDegradation({
          videoStream,
          audioStream,
          videoBitsPerSecond: 2500000,
        })
      ).rejects.toThrow();
    });

    it("continues with video only when stream combination fails", async () => {
      const videoStream = createMockStream(true, false);
      const audioStream = createMockStream(false, true);

      // Mock combineStreams to fail on first call, succeed on second
      const originalCombineStreams = mediaRecorderService.combineStreams;
      let callCount = 0;

      vi.spyOn(mediaRecorderService, "combineStreams").mockImplementation(
        (video, audio) => {
          callCount++;
          if (callCount === 1 && audio) {
            throw new Error("Stream combination failed");
          }
          // Return a mock stream for video-only
          return createMockStream(true, false);
        }
      );

      const result =
        await mediaRecorderService.startRecordingWithGracefulDegradation({
          videoStream,
          audioStream,
          videoBitsPerSecond: 2500000,
        });

      expect(result.success).toBe(true);
      expect(result.hasVideo).toBe(true);
      expect(result.hasAudio).toBe(false);
      expect(result.degradationReason).toContain("Stream combination failed");
    });
  });

  describe("handleAudioStreamFailure", () => {
    it("handles audio permission denied with graceful degradation", () => {
      const error = new Error("Audio permission denied");
      const result = mediaRecorderService.handleAudioStreamFailure(error, {
        operation: "audio_capture",
        tabId: 123,
      });

      expect(result.shouldContinue).toBe(true);
      expect(result.errorCode).toBe(RecordingError.AUDIO_PERMISSION_DENIED);
      expect(result.fallbackMessage).toContain("permission denied");
    });

    it("handles tab capture failure with graceful degradation", () => {
      const error = new Error("Tab capture failed");
      const result = mediaRecorderService.handleAudioStreamFailure(error, {
        operation: "audio_capture",
        tabId: 123,
      });

      expect(result.shouldContinue).toBe(true);
      expect(result.errorCode).toBe(RecordingError.TAB_CAPTURE_FAILED);
      expect(result.fallbackMessage).toContain("tab failed");
    });

    it("handles audio not available with graceful degradation", () => {
      const error = new Error("Audio device not available");
      const result = mediaRecorderService.handleAudioStreamFailure(error, {
        operation: "audio_capture",
        tabId: 123,
      });

      expect(result.shouldContinue).toBe(true);
      expect(result.errorCode).toBe(RecordingError.AUDIO_NOT_AVAILABLE);
      expect(result.fallbackMessage).toContain("not available");
    });

    it("does not continue for unsupported browser", () => {
      const error = new Error("Feature not supported");
      const result = mediaRecorderService.handleAudioStreamFailure(error, {
        operation: "audio_capture",
        tabId: 123,
      });

      expect(result.shouldContinue).toBe(false);
      expect(result.errorCode).toBe(RecordingError.UNSUPPORTED_BROWSER);
      expect(result.fallbackMessage).toContain("not supported");
    });

    it("handles unknown errors with graceful degradation", () => {
      const error = new Error("Some random error");
      const result = mediaRecorderService.handleAudioStreamFailure(error, {
        operation: "audio_capture",
        tabId: 123,
      });

      expect(result.shouldContinue).toBe(true);
      expect(result.errorCode).toBe(RecordingError.RECORDING_FAILED);
      expect(result.fallbackMessage).toContain("failed");
    });
  });

  describe("createDegradationNotification", () => {
    it("creates success notification for full recording", () => {
      const notification = mediaRecorderService.createDegradationNotification(
        true,
        true
      );

      expect(notification.type).toBe("success");
      expect(notification.message).toContain("successfully");
    });

    it("creates warning notification for video-only recording", () => {
      const notification = mediaRecorderService.createDegradationNotification(
        false,
        true,
        "Audio capture failed"
      );

      expect(notification.type).toBe("warning");
      expect(notification.message).toContain("video only");
      expect(notification.details).toBe("Audio capture failed");
    });

    it("creates error notification for no video", () => {
      const notification = mediaRecorderService.createDegradationNotification(
        true,
        false,
        "Video capture failed"
      );

      expect(notification.type).toBe("error");
      expect(notification.message).toContain("failed");
      expect(notification.details).toBe("Video capture failed");
    });

    it("creates error notification for complete failure", () => {
      const notification = mediaRecorderService.createDegradationNotification(
        false,
        false,
        "Complete failure"
      );

      expect(notification.type).toBe("error");
      expect(notification.message).toContain("failed");
      expect(notification.details).toBe("Complete failure");
    });
  });

  describe("validateStream", () => {
    it("validates stream with video tracks", () => {
      const stream = createMockStream(true, false);
      const isValid = mediaRecorderService.validateStream(stream, false);
      expect(isValid).toBe(true);
    });

    it("validates stream with video and audio tracks", () => {
      const stream = createMockStream(true, true);
      const isValid = mediaRecorderService.validateStream(stream, true);
      expect(isValid).toBe(true);
    });

    it("fails validation when video is missing", () => {
      const stream = createMockStream(false, true);
      const isValid = mediaRecorderService.validateStream(stream, false);
      expect(isValid).toBe(false);
    });

    it("fails validation when audio is required but missing", () => {
      const stream = createMockStream(true, false);
      const isValid = mediaRecorderService.validateStream(stream, true);
      expect(isValid).toBe(false);
    });
  });

  describe("getStreamInfo", () => {
    it("returns correct stream information", () => {
      const stream = createMockStream(true, true);
      const info = mediaRecorderService.getStreamInfo(stream);

      expect(info.id).toBe("mock-stream");
      expect(info.active).toBe(true);
      expect(info.videoTracks).toBe(1);
      expect(info.audioTracks).toBe(1);
    });

    it("returns correct info for video-only stream", () => {
      const stream = createMockStream(true, false);
      const info = mediaRecorderService.getStreamInfo(stream);

      expect(info.videoTracks).toBe(1);
      expect(info.audioTracks).toBe(0);
    });

    it("returns correct info for audio-only stream", () => {
      const stream = createMockStream(false, true);
      const info = mediaRecorderService.getStreamInfo(stream);

      expect(info.videoTracks).toBe(0);
      expect(info.audioTracks).toBe(1);
    });
  });
});
