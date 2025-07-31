// Unit tests for media utility functions and stream operations

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MediaStreamInfo,
  MediaStreamTrackInfo,
  AudioAnalyzerData,
  StreamCombinationOptions,
} from "../../types/media";

// Mock MediaStream and related APIs
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

  clone(): MediaStream {
    const cloned = new MockMediaStream(`${this.id}-clone`);
    this.videoTracks.forEach((track) => cloned.addTrack(track.clone()));
    this.audioTracks.forEach((track) => cloned.addTrack(track.clone()));
    return cloned as any;
  }
}

// Utility functions to test
class MediaUtilities {
  /**
   * Analyzes a MediaStream and returns detailed information
   */
  static analyzeStream(stream: MediaStream): MediaStreamInfo {
    const audioTracks = stream.getAudioTracks().map(
      (track): MediaStreamTrackInfo => ({
        id: track.id,
        kind: track.kind as "audio",
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
      })
    );

    const videoTracks = stream.getVideoTracks().map(
      (track): MediaStreamTrackInfo => ({
        id: track.id,
        kind: track.kind as "video",
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
      })
    );

    return {
      id: stream.id,
      active: stream.active,
      audioTracks,
      videoTracks,
    };
  }

  /**
   * Validates that a stream has the required tracks
   */
  static validateStream(
    stream: MediaStream,
    requireAudio = false,
    requireVideo = true
  ): boolean {
    const hasVideo = stream.getVideoTracks().length > 0;
    const hasAudio = stream.getAudioTracks().length > 0;

    if (requireVideo && !hasVideo) return false;
    if (requireAudio && !hasAudio) return false;

    // Check if tracks are in valid state
    const allTracks = [...stream.getVideoTracks(), ...stream.getAudioTracks()];
    return allTracks.every((track) => track.readyState === "live");
  }

  /**
   * Combines multiple streams into one
   */
  static combineStreams(streams: MediaStream[]): MediaStream {
    if (streams.length === 0) {
      throw new Error("At least one stream is required");
    }

    const combined = new MediaStream();

    streams.forEach((stream) => {
      stream.getTracks().forEach((track) => {
        combined.addTrack(track);
      });
    });

    return combined;
  }

  /**
   * Clones a stream with optional track filtering
   */
  static cloneStream(
    stream: MediaStream,
    options: { includeAudio?: boolean; includeVideo?: boolean } = {}
  ): MediaStream {
    const { includeAudio = true, includeVideo = true } = options;
    const cloned = new MediaStream();

    if (includeVideo) {
      stream.getVideoTracks().forEach((track) => {
        cloned.addTrack(track.clone());
      });
    }

    if (includeAudio) {
      stream.getAudioTracks().forEach((track) => {
        cloned.addTrack(track.clone());
      });
    }

    return cloned;
  }

  /**
   * Stops all tracks in a stream
   */
  static stopStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  /**
   * Gets the dominant track type in a stream
   */
  static getDominantTrackType(
    stream: MediaStream
  ): "audio" | "video" | "mixed" | "empty" {
    const audioCount = stream.getAudioTracks().length;
    const videoCount = stream.getVideoTracks().length;

    if (audioCount === 0 && videoCount === 0) return "empty";
    if (audioCount > 0 && videoCount > 0) return "mixed";
    if (audioCount > videoCount) return "audio";
    return "video";
  }

  /**
   * Checks if a stream is effectively active (has live tracks)
   */
  static isStreamActive(stream: MediaStream): boolean {
    const tracks = stream.getTracks();
    return (
      tracks.length > 0 && tracks.some((track) => track.readyState === "live")
    );
  }

  /**
   * Gets stream quality metrics
   */
  static getStreamMetrics(stream: MediaStream): {
    totalTracks: number;
    activeTracks: number;
    audioTracks: number;
    videoTracks: number;
    quality: "high" | "medium" | "low";
  } {
    const audioTracks = stream.getAudioTracks().length;
    const videoTracks = stream.getVideoTracks().length;
    const totalTracks = audioTracks + videoTracks;
    const activeTracks = stream
      .getTracks()
      .filter((track) => track.readyState === "live").length;

    let quality: "high" | "medium" | "low" = "low";
    if (audioTracks > 0 && videoTracks > 0) {
      quality = "high";
    } else if (audioTracks > 0 || videoTracks > 0) {
      quality = "medium";
    }

    return {
      totalTracks,
      activeTracks,
      audioTracks,
      videoTracks,
      quality,
    };
  }

  /**
   * Creates a mock audio analyzer data
   */
  static createMockAudioData(): AudioAnalyzerData {
    const frequencyData = new Uint8Array(256);
    const timeData = new Uint8Array(256);

    // Fill with mock data
    for (let i = 0; i < 256; i++) {
      frequencyData[i] = Math.floor(Math.random() * 256);
      timeData[i] = Math.floor(Math.random() * 256);
    }

    return {
      frequencyData,
      timeData,
      volume: Math.random(),
      peak: Math.random(),
    };
  }
}

describe("MediaUtilities", () => {
  let mockVideoStream: MockMediaStream;
  let mockAudioStream: MockMediaStream;
  let mockCombinedStream: MockMediaStream;

  beforeEach(() => {
    // Setup global mocks
    global.MediaStream = MockMediaStream as any;

    // Create test streams
    mockVideoStream = new MockMediaStream("video-stream");
    mockVideoStream.addTrack(
      new MockMediaStreamTrack("video", "video-track-1") as any
    );

    mockAudioStream = new MockMediaStream("audio-stream");
    mockAudioStream.addTrack(
      new MockMediaStreamTrack("audio", "audio-track-1") as any
    );

    mockCombinedStream = new MockMediaStream("combined-stream");
    mockCombinedStream.addTrack(
      new MockMediaStreamTrack("video", "video-track-2") as any
    );
    mockCombinedStream.addTrack(
      new MockMediaStreamTrack("audio", "audio-track-2") as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("analyzeStream", () => {
    it("should analyze video-only stream", () => {
      const info = MediaUtilities.analyzeStream(mockVideoStream as any);

      expect(info.id).toBe("video-stream");
      expect(info.active).toBe(true);
      expect(info.videoTracks).toHaveLength(1);
      expect(info.audioTracks).toHaveLength(0);
      expect(info.videoTracks[0].kind).toBe("video");
      expect(info.videoTracks[0].readyState).toBe("live");
    });

    it("should analyze audio-only stream", () => {
      const info = MediaUtilities.analyzeStream(mockAudioStream as any);

      expect(info.id).toBe("audio-stream");
      expect(info.audioTracks).toHaveLength(1);
      expect(info.videoTracks).toHaveLength(0);
      expect(info.audioTracks[0].kind).toBe("audio");
    });

    it("should analyze combined stream", () => {
      const info = MediaUtilities.analyzeStream(mockCombinedStream as any);

      expect(info.videoTracks).toHaveLength(1);
      expect(info.audioTracks).toHaveLength(1);
      expect(info.videoTracks[0].kind).toBe("video");
      expect(info.audioTracks[0].kind).toBe("audio");
    });

    it("should handle empty stream", () => {
      const emptyStream = new MockMediaStream("empty");
      const info = MediaUtilities.analyzeStream(emptyStream as any);

      expect(info.videoTracks).toHaveLength(0);
      expect(info.audioTracks).toHaveLength(0);
    });
  });

  describe("validateStream", () => {
    it("should validate video-only stream with default requirements", () => {
      const isValid = MediaUtilities.validateStream(mockVideoStream as any);
      expect(isValid).toBe(true);
    });

    it("should reject video-only stream when audio is required", () => {
      const isValid = MediaUtilities.validateStream(
        mockVideoStream as any,
        true,
        true
      );
      expect(isValid).toBe(false);
    });

    it("should validate combined stream with all requirements", () => {
      const isValid = MediaUtilities.validateStream(
        mockCombinedStream as any,
        true,
        true
      );
      expect(isValid).toBe(true);
    });

    it("should reject stream with ended tracks", () => {
      const track = mockVideoStream.getVideoTracks()[0];
      track.stop(); // This sets readyState to 'ended'

      const isValid = MediaUtilities.validateStream(mockVideoStream as any);
      expect(isValid).toBe(false);
    });

    it("should validate audio-only stream when video not required", () => {
      const isValid = MediaUtilities.validateStream(
        mockAudioStream as any,
        false,
        false
      );
      expect(isValid).toBe(true);
    });
  });

  describe("combineStreams", () => {
    it("should combine multiple streams", () => {
      const streams = [mockVideoStream as any, mockAudioStream as any];
      const combined = MediaUtilities.combineStreams(streams);

      expect(combined.getVideoTracks()).toHaveLength(1);
      expect(combined.getAudioTracks()).toHaveLength(1);
    });

    it("should handle single stream", () => {
      const combined = MediaUtilities.combineStreams([mockVideoStream as any]);

      expect(combined.getVideoTracks()).toHaveLength(1);
      expect(combined.getAudioTracks()).toHaveLength(0);
    });

    it("should throw error for empty array", () => {
      expect(() => MediaUtilities.combineStreams([])).toThrow(
        "At least one stream is required"
      );
    });

    it("should handle streams with multiple tracks", () => {
      // Add more tracks
      mockVideoStream.addTrack(
        new MockMediaStreamTrack("video", "video-track-3") as any
      );
      mockAudioStream.addTrack(
        new MockMediaStreamTrack("audio", "audio-track-3") as any
      );

      const combined = MediaUtilities.combineStreams([
        mockVideoStream as any,
        mockAudioStream as any,
      ]);

      expect(combined.getVideoTracks()).toHaveLength(2);
      expect(combined.getAudioTracks()).toHaveLength(2);
    });
  });

  describe("cloneStream", () => {
    it("should clone stream with all tracks by default", () => {
      const cloned = MediaUtilities.cloneStream(mockCombinedStream as any);

      expect(cloned.getVideoTracks()).toHaveLength(1);
      expect(cloned.getAudioTracks()).toHaveLength(1);
      expect(cloned.id).not.toBe(mockCombinedStream.id);
    });

    it("should clone only video tracks when specified", () => {
      const cloned = MediaUtilities.cloneStream(mockCombinedStream as any, {
        includeAudio: false,
        includeVideo: true,
      });

      expect(cloned.getVideoTracks()).toHaveLength(1);
      expect(cloned.getAudioTracks()).toHaveLength(0);
    });

    it("should clone only audio tracks when specified", () => {
      const cloned = MediaUtilities.cloneStream(mockCombinedStream as any, {
        includeAudio: true,
        includeVideo: false,
      });

      expect(cloned.getVideoTracks()).toHaveLength(0);
      expect(cloned.getAudioTracks()).toHaveLength(1);
    });

    it("should create empty stream when no tracks included", () => {
      const cloned = MediaUtilities.cloneStream(mockCombinedStream as any, {
        includeAudio: false,
        includeVideo: false,
      });

      expect(cloned.getVideoTracks()).toHaveLength(0);
      expect(cloned.getAudioTracks()).toHaveLength(0);
    });
  });

  describe("stopStream", () => {
    it("should stop all tracks in stream", () => {
      const tracks = mockCombinedStream.getTracks();

      MediaUtilities.stopStream(mockCombinedStream as any);

      tracks.forEach((track) => {
        expect(track.readyState).toBe("ended");
      });
    });

    it("should handle empty stream", () => {
      const emptyStream = new MockMediaStream("empty");

      expect(() => MediaUtilities.stopStream(emptyStream as any)).not.toThrow();
    });
  });

  describe("getDominantTrackType", () => {
    it("should return 'video' for video-only stream", () => {
      const type = MediaUtilities.getDominantTrackType(mockVideoStream as any);
      expect(type).toBe("video");
    });

    it("should return 'audio' for audio-only stream", () => {
      const type = MediaUtilities.getDominantTrackType(mockAudioStream as any);
      expect(type).toBe("audio");
    });

    it("should return 'mixed' for combined stream", () => {
      const type = MediaUtilities.getDominantTrackType(
        mockCombinedStream as any
      );
      expect(type).toBe("mixed");
    });

    it("should return 'empty' for stream with no tracks", () => {
      const emptyStream = new MockMediaStream("empty");
      const type = MediaUtilities.getDominantTrackType(emptyStream as any);
      expect(type).toBe("empty");
    });

    it("should return 'audio' when more audio tracks than video", () => {
      const stream = new MockMediaStream("audio-heavy");
      stream.addTrack(new MockMediaStreamTrack("audio", "audio-1") as any);
      stream.addTrack(new MockMediaStreamTrack("audio", "audio-2") as any);
      stream.addTrack(new MockMediaStreamTrack("video", "video-1") as any);

      const type = MediaUtilities.getDominantTrackType(stream as any);
      expect(type).toBe("mixed"); // Still mixed because both types present
    });
  });

  describe("isStreamActive", () => {
    it("should return true for active stream", () => {
      const isActive = MediaUtilities.isStreamActive(mockVideoStream as any);
      expect(isActive).toBe(true);
    });

    it("should return false for stream with ended tracks", () => {
      mockVideoStream.getTracks().forEach((track) => track.stop());

      const isActive = MediaUtilities.isStreamActive(mockVideoStream as any);
      expect(isActive).toBe(false);
    });

    it("should return false for empty stream", () => {
      const emptyStream = new MockMediaStream("empty");
      const isActive = MediaUtilities.isStreamActive(emptyStream as any);
      expect(isActive).toBe(false);
    });

    it("should return true if at least one track is live", () => {
      const tracks = mockCombinedStream.getTracks();
      tracks[0].stop(); // Stop first track
      // Second track remains live

      const isActive = MediaUtilities.isStreamActive(mockCombinedStream as any);
      expect(isActive).toBe(true);
    });
  });

  describe("getStreamMetrics", () => {
    it("should return correct metrics for combined stream", () => {
      const metrics = MediaUtilities.getStreamMetrics(
        mockCombinedStream as any
      );

      expect(metrics.totalTracks).toBe(2);
      expect(metrics.activeTracks).toBe(2);
      expect(metrics.audioTracks).toBe(1);
      expect(metrics.videoTracks).toBe(1);
      expect(metrics.quality).toBe("high");
    });

    it("should return medium quality for video-only stream", () => {
      const metrics = MediaUtilities.getStreamMetrics(mockVideoStream as any);

      expect(metrics.totalTracks).toBe(1);
      expect(metrics.videoTracks).toBe(1);
      expect(metrics.audioTracks).toBe(0);
      expect(metrics.quality).toBe("medium");
    });

    it("should return low quality for empty stream", () => {
      const emptyStream = new MockMediaStream("empty");
      const metrics = MediaUtilities.getStreamMetrics(emptyStream as any);

      expect(metrics.totalTracks).toBe(0);
      expect(metrics.activeTracks).toBe(0);
      expect(metrics.quality).toBe("low");
    });

    it("should count only active tracks", () => {
      const tracks = mockCombinedStream.getTracks();
      tracks[0].stop(); // Stop one track

      const metrics = MediaUtilities.getStreamMetrics(
        mockCombinedStream as any
      );

      expect(metrics.totalTracks).toBe(2);
      expect(metrics.activeTracks).toBe(1);
    });
  });

  describe("createMockAudioData", () => {
    it("should create valid audio analyzer data", () => {
      const audioData = MediaUtilities.createMockAudioData();

      expect(audioData.frequencyData).toBeInstanceOf(Uint8Array);
      expect(audioData.timeData).toBeInstanceOf(Uint8Array);
      expect(audioData.frequencyData).toHaveLength(256);
      expect(audioData.timeData).toHaveLength(256);
      expect(audioData.volume).toBeTypeOf("number");
      expect(audioData.peak).toBeTypeOf("number");
      expect(audioData.volume).toBeGreaterThanOrEqual(0);
      expect(audioData.volume).toBeLessThanOrEqual(1);
      expect(audioData.peak).toBeGreaterThanOrEqual(0);
      expect(audioData.peak).toBeLessThanOrEqual(1);
    });

    it("should create different data on each call", () => {
      const data1 = MediaUtilities.createMockAudioData();
      const data2 = MediaUtilities.createMockAudioData();

      // Very unlikely to be identical due to random generation
      expect(data1.volume).not.toBe(data2.volume);
      expect(data1.peak).not.toBe(data2.peak);
    });
  });
});
