import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecordingError, RecordingException } from "../../types/errors";

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onSuspend: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    lastError: null,
  },
  tabs: {
    onRemoved: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
    get: vi.fn(),
  },
  windows: {
    onRemoved: { addListener: vi.fn() },
  },
  tabCapture: {
    getMediaStreamId: vi.fn(),
    getCapturedTabs: vi.fn(),
  },
  offscreen: {
    createDocument: vi.fn(),
    closeDocument: vi.fn(),
    hasDocument: vi.fn(),
  },
  storage: {
    local: {
      set: vi.fn(),
      get: vi.fn(),
    },
  },
};

Object.defineProperty(global, "chrome", {
  value: mockChrome,
  writable: true,
});

Object.defineProperty(global, "self", {
  value: { addEventListener: vi.fn() },
  writable: true,
});

// Mock BackgroundService class for testing
class MockBackgroundService {
  private offscreenDocumentUrl = "src/offscreen/offscreen.html";
  private isOffscreenDocumentCreated = false;
  private recordingSessions = new Map<number, any>();
  private extensionEnabled = true;

  async handleMessage(message: any): Promise<any> {
    if (!this.extensionEnabled) {
      return { success: false, error: "Extension is disabled" };
    }

    switch (message.type) {
      case "get-media-stream":
        return this.getMediaStream(message.streamId);
      case "start-recording":
        return this.startRecording(message.tabId, message.streamId);
      case "stop-recording":
        return this.stopRecording(message.tabId, message.streamId);
      case "get-recording-state":
        return this.getRecordingState(message.tabId);
      case "cleanup-tab":
        return this.cleanupTab(message.tabId);
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  setExtensionEnabled(enabled: boolean): void {
    this.extensionEnabled = enabled;
  }

  getRecordingSessions(): Map<number, any> {
    return this.recordingSessions;
  }

  private async getMediaStream(streamId: string): Promise<any> {
    if (!streamId) {
      return { success: false, error: RecordingError.TAB_CAPTURE_FAILED };
    }

    await this.ensureOffscreenDocument();

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "get-media-stream", streamId },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          resolve(response);
        }
      );
    });
  }

  private async startRecording(tabId: number, streamId?: string): Promise<any> {
    // Check if tab already has an active recording
    const existingSession = this.recordingSessions.get(tabId);
    if (existingSession && existingSession.isActive) {
      return {
        success: false,
        error: "Recording already active for this tab",
      };
    }

    // Get tab information
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
      throw new RecordingException(
        RecordingError.TAB_NOT_FOUND,
        `Tab ${tabId} not found or invalid`
      );
    }

    // Verify this is a ShaderToy page
    if (!tab.url.includes("shadertoy.com")) {
      throw new RecordingException(
        RecordingError.INVALID_TAB,
        "Recording only supported on ShaderToy pages"
      );
    }

    if (!streamId) {
      streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId,
      });
      if (!streamId) {
        return { success: false, error: RecordingError.TAB_CAPTURE_FAILED };
      }
    }

    // Create recording session
    const session = {
      tabId,
      streamId,
      startTime: Date.now(),
      isActive: true,
      url: tab.url,
    };

    this.recordingSessions.set(tabId, session);

    await this.ensureOffscreenDocument();

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "start-audio-capture", streamId, tabId },
        (response) => {
          if (chrome.runtime.lastError) {
            this.recordingSessions.delete(tabId);
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          if (!response.success) {
            this.recordingSessions.delete(tabId);
          }

          resolve(response);
        }
      );
    });
  }

  private async stopRecording(tabId?: number, streamId?: string): Promise<any> {
    // Find session by tabId or streamId
    let session: any;
    let sessionTabId: number | undefined;

    if (tabId) {
      session = this.recordingSessions.get(tabId);
      sessionTabId = tabId;
    } else if (streamId) {
      for (const [tId, s] of this.recordingSessions.entries()) {
        if (s.streamId === streamId) {
          session = s;
          sessionTabId = tId;
          break;
        }
      }
    }

    if (!session || !sessionTabId) {
      return { success: true };
    }

    session.isActive = false;

    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "stop-audio-capture", streamId: session.streamId },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          resolve(response);
        }
      );
    });

    this.recordingSessions.delete(sessionTabId);
    return result;
  }

  private getRecordingState(tabId?: number): any {
    if (!tabId) {
      const activeSessions = Array.from(this.recordingSessions.values()).filter(
        (session) => session.isActive
      );

      return {
        success: true,
        activeSessions: activeSessions.length,
        sessions: activeSessions.map((session) => ({
          tabId: session.tabId,
          duration: Date.now() - session.startTime,
          url: session.url,
        })),
      };
    }

    const session = this.recordingSessions.get(tabId);
    return {
      success: true,
      isRecording: session?.isActive || false,
      duration: session ? Date.now() - session.startTime : 0,
      url: session?.url,
    };
  }

  private async cleanupTab(tabId: number): Promise<any> {
    const session = this.recordingSessions.get(tabId);
    if (session && session.isActive) {
      await this.stopRecording(tabId);
    }

    this.recordingSessions.delete(tabId);
    return { success: true };
  }

  private async ensureOffscreenDocument(): Promise<void> {
    if (this.isOffscreenDocumentCreated) {
      const hasDocument = await chrome.offscreen.hasDocument();
      if (hasDocument) return;
      this.isOffscreenDocumentCreated = false;
    }

    try {
      await chrome.offscreen.createDocument({
        url: this.offscreenDocumentUrl,
        reasons: ["USER_MEDIA"],
        justification:
          "Recording audio from ShaderToy tab for combined video/audio capture",
      });
      this.isOffscreenDocumentCreated = true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Only a single offscreen")
      ) {
        this.isOffscreenDocumentCreated = true;
        return;
      }
      throw error;
    }
  }
}

describe("Background Service", () => {
  let service: MockBackgroundService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
    service = new MockBackgroundService();

    // Setup default tab mock
    mockChrome.tabs.get.mockResolvedValue({
      id: 123,
      url: "https://www.shadertoy.com/view/test",
      windowId: 1,
    });
  });

  describe("Message Handling", () => {
    it("should handle get-media-stream message", async () => {
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);
      mockChrome.offscreen.createDocument.mockResolvedValue(undefined);
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, stream: { getAudioTracks: () => [{}] } });
      });

      const result = await service.handleMessage({
        type: "get-media-stream",
        streamId: "test-stream-id",
      });

      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    it("should handle start-recording message", async () => {
      mockChrome.tabCapture.getMediaStreamId.mockResolvedValue("stream-id-123");
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);
      mockChrome.offscreen.createDocument.mockResolvedValue(undefined);
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true });
      });

      const result = await service.handleMessage({
        type: "start-recording",
        tabId: 123,
      });

      expect(mockChrome.tabs.get).toHaveBeenCalledWith(123);
      expect(mockChrome.tabCapture.getMediaStreamId).toHaveBeenCalledWith({
        targetTabId: 123,
      });
      expect(result).toEqual(expect.objectContaining({ success: true }));
      expect(service.getRecordingSessions().has(123)).toBe(true);
    });

    it("should handle stop-recording message", async () => {
      // First start a recording
      mockChrome.tabCapture.getMediaStreamId.mockResolvedValue("stream-id-123");
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);
      mockChrome.offscreen.createDocument.mockResolvedValue(undefined);
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true });
      });

      await service.handleMessage({
        type: "start-recording",
        tabId: 123,
      });

      // Now stop it
      const result = await service.handleMessage({
        type: "stop-recording",
        tabId: 123,
      });

      expect(result).toEqual(expect.objectContaining({ success: true }));
      expect(service.getRecordingSessions().has(123)).toBe(false);
    });

    it("should handle get-recording-state message", async () => {
      const result = await service.handleMessage({
        type: "get-recording-state",
        tabId: 123,
      });

      expect(result).toEqual({
        success: true,
        isRecording: false,
        duration: 0,
        url: undefined,
      });
    });

    it("should handle cleanup-tab message", async () => {
      const result = await service.handleMessage({
        type: "cleanup-tab",
        tabId: 123,
      });

      expect(result).toEqual({ success: true });
    });

    it("should handle unknown message type", async () => {
      await expect(
        service.handleMessage({ type: "unknown-message" })
      ).rejects.toThrow("Unknown message type");
    });

    it("should reject messages when extension is disabled", async () => {
      service.setExtensionEnabled(false);

      const result = await service.handleMessage({
        type: "start-recording",
        tabId: 123,
      });

      expect(result).toEqual({
        success: false,
        error: "Extension is disabled",
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle tabCapture failures", async () => {
      mockChrome.tabCapture.getMediaStreamId.mockResolvedValue(null);

      const result = await service.handleMessage({
        type: "start-recording",
        tabId: 123,
      });

      expect(result).toEqual({
        success: false,
        error: RecordingError.TAB_CAPTURE_FAILED,
      });
    });

    it("should handle runtime.lastError", async () => {
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);
      mockChrome.offscreen.createDocument.mockResolvedValue(undefined);
      mockChrome.runtime.lastError = { message: "Runtime error occurred" };
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({});
      });

      const result = await service.handleMessage({
        type: "get-media-stream",
        streamId: "test-stream-id",
      });

      expect(result).toEqual({
        success: false,
        error: "Runtime error occurred",
      });
    });
  });

  describe("Session Management", () => {
    it("should prevent duplicate recordings on same tab", async () => {
      mockChrome.tabCapture.getMediaStreamId.mockResolvedValue("stream-id-123");
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);
      mockChrome.offscreen.createDocument.mockResolvedValue(undefined);
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true });
      });

      // Start first recording
      await service.handleMessage({
        type: "start-recording",
        tabId: 123,
      });

      // Try to start second recording on same tab
      const result = await service.handleMessage({
        type: "start-recording",
        tabId: 123,
      });

      expect(result).toEqual({
        success: false,
        error: "Recording already active for this tab",
      });
    });

    it("should validate ShaderToy URLs", async () => {
      mockChrome.tabs.get.mockResolvedValue({
        id: 123,
        url: "https://www.example.com",
        windowId: 1,
      });

      await expect(
        service.handleMessage({
          type: "start-recording",
          tabId: 123,
        })
      ).rejects.toThrow("Recording only supported on ShaderToy pages");
    });

    it("should handle invalid tab IDs", async () => {
      mockChrome.tabs.get.mockRejectedValue(new Error("Tab not found"));

      await expect(
        service.handleMessage({
          type: "start-recording",
          tabId: 999,
        })
      ).rejects.toThrow("Tab not found");
    });

    it("should track recording sessions", async () => {
      mockChrome.tabCapture.getMediaStreamId.mockResolvedValue("stream-id-123");
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);
      mockChrome.offscreen.createDocument.mockResolvedValue(undefined);
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true });
      });

      await service.handleMessage({
        type: "start-recording",
        tabId: 123,
      });

      const sessions = service.getRecordingSessions();
      expect(sessions.has(123)).toBe(true);

      const session = sessions.get(123);
      expect(session).toEqual(
        expect.objectContaining({
          tabId: 123,
          streamId: "stream-id-123",
          isActive: true,
          url: "https://www.shadertoy.com/view/test",
        })
      );
    });

    it("should get recording state for all sessions", async () => {
      mockChrome.tabCapture.getMediaStreamId.mockResolvedValue("stream-id-123");
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);
      mockChrome.offscreen.createDocument.mockResolvedValue(undefined);
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true });
      });

      await service.handleMessage({
        type: "start-recording",
        tabId: 123,
      });

      const result = await service.handleMessage({
        type: "get-recording-state",
      });

      expect(result).toEqual({
        success: true,
        activeSessions: 1,
        sessions: expect.arrayContaining([
          expect.objectContaining({
            tabId: 123,
            url: "https://www.shadertoy.com/view/test",
          }),
        ]),
      });
    });
  });

  describe("Offscreen Document Management", () => {
    it("should create offscreen document when needed", async () => {
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);
      mockChrome.offscreen.createDocument.mockResolvedValue(undefined);
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, stream: {} });
      });

      await service.handleMessage({
        type: "get-media-stream",
        streamId: "test-stream-id",
      });

      expect(mockChrome.offscreen.createDocument).toHaveBeenCalledWith({
        url: "src/offscreen/offscreen.html",
        reasons: ["USER_MEDIA"],
        justification:
          "Recording audio from ShaderToy tab for combined video/audio capture",
      });
    });

    it('should handle "document already exists" error gracefully', async () => {
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);
      mockChrome.offscreen.createDocument.mockRejectedValue(
        new Error("Only a single offscreen document may be created")
      );
      mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, stream: {} });
      });

      const result = await service.handleMessage({
        type: "get-media-stream",
        streamId: "test-stream-id",
      });

      expect(result).toEqual(expect.objectContaining({ success: true }));
    });
  });
});
