import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChromeAPIServiceImpl } from "../ChromeAPIService";
import { RecordingError } from "../../types/errors";

// Mock Chrome APIs
const mockChrome = {
  tabs: {
    query: vi.fn(),
    get: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  tabCapture: {
    getMediaStreamId: vi.fn(),
    getCapturedTabs: vi.fn(),
  },
  permissions: {
    contains: vi.fn(),
    request: vi.fn(),
  },
  runtime: {
    sendMessage: vi.fn(),
    lastError: null,
  },
};

// Mock global chrome object
Object.defineProperty(global, "chrome", {
  value: mockChrome,
  writable: true,
});

describe("ChromeAPIService", () => {
  let service: ChromeAPIServiceImpl;

  beforeEach(() => {
    service = ChromeAPIServiceImpl.getInstance();
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getCurrentTab", () => {
    it("should return the current active tab", async () => {
      const mockTab = { id: 123, url: "https://www.shadertoy.com/view/test" };
      mockChrome.tabs.query.mockResolvedValue([mockTab]);

      const result = await service.getCurrentTab();

      expect(result).toEqual(mockTab);
      expect(mockChrome.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });

    it("should throw error when no active tab found", async () => {
      mockChrome.tabs.query.mockResolvedValue([]);

      await expect(service.getCurrentTab()).rejects.toThrow(
        RecordingError.TAB_NOT_FOUND
      );
    });

    it("should throw error when tab has no ID", async () => {
      const mockTab = { url: "https://www.shadertoy.com/view/test" };
      mockChrome.tabs.query.mockResolvedValue([mockTab]);

      await expect(service.getCurrentTab()).rejects.toThrow(
        RecordingError.INVALID_TAB
      );
    });

    it("should handle API errors gracefully", async () => {
      mockChrome.tabs.query.mockRejectedValue(new Error("API Error"));

      await expect(service.getCurrentTab()).rejects.toThrow(
        "Failed to get current tab: API Error"
      );
    });
  });

  describe("injectContentScript", () => {
    beforeEach(() => {
      mockChrome.tabs.get.mockResolvedValue({
        id: 123,
        url: "https://www.shadertoy.com/view/test",
      });
    });

    it("should inject content script successfully", async () => {
      mockChrome.scripting.executeScript.mockResolvedValue([]);

      await service.injectContentScript(123);

      expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 123 },
        files: ["src/content/content.js"],
      });
    });

    it("should throw error when tab is not accessible", async () => {
      mockChrome.tabs.get.mockRejectedValue(new Error("Cannot access tab"));

      await expect(service.injectContentScript(123)).rejects.toThrow(
        RecordingError.PERMISSION_DENIED
      );
    });

    it("should handle permission denied errors", async () => {
      mockChrome.scripting.executeScript.mockRejectedValue(
        new Error("Cannot access contents of url")
      );

      await expect(service.injectContentScript(123)).rejects.toThrow(
        RecordingError.PERMISSION_DENIED
      );
    });

    it("should handle chrome:// URLs", async () => {
      mockChrome.tabs.get.mockResolvedValue({
        id: 123,
        url: "chrome://extensions/",
      });

      await expect(service.injectContentScript(123)).rejects.toThrow(
        RecordingError.PERMISSION_DENIED
      );
    });
  });

  describe("captureTabAudio", () => {
    beforeEach(() => {
      mockChrome.permissions.contains.mockResolvedValue(true);
      mockChrome.tabCapture.getMediaStreamId.mockResolvedValue("stream-id-123");
    });

    it("should capture audio successfully", async () => {
      const mockStream = {
        getAudioTracks: vi.fn().mockReturnValue([{ kind: "audio" }]),
      };

      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ stream: mockStream });
      });

      const result = await service.captureTabAudio(123);

      expect(result).toEqual(mockStream);
      expect(mockChrome.tabCapture.getMediaStreamId).toHaveBeenCalledWith({
        targetTabId: 123,
      });
    });

    it("should throw error when permissions are denied", async () => {
      mockChrome.permissions.contains.mockResolvedValue(false);

      await expect(service.captureTabAudio(123)).rejects.toThrow(
        RecordingError.PERMISSION_DENIED
      );
    });

    it("should throw error when stream ID is not available", async () => {
      mockChrome.tabCapture.getMediaStreamId.mockResolvedValue(null);

      await expect(service.captureTabAudio(123)).rejects.toThrow(
        RecordingError.TAB_CAPTURE_FAILED
      );
    });

    it("should throw error when no audio tracks available", async () => {
      const mockStream = {
        getAudioTracks: vi.fn().mockReturnValue([]),
      };

      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ stream: mockStream });
      });

      await expect(service.captureTabAudio(123)).rejects.toThrow(
        RecordingError.AUDIO_NOT_AVAILABLE
      );
    });

    it("should handle runtime errors from background script", async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({ error: "Background script error" });
      });

      await expect(service.captureTabAudio(123)).rejects.toThrow(
        "Background script error"
      );
    });

    it("should handle chrome.runtime.lastError", async () => {
      mockChrome.runtime.lastError = { message: "Runtime error" };
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({});
      });

      await expect(service.captureTabAudio(123)).rejects.toThrow(
        "Runtime error"
      );
    });
  });

  describe("checkPermissions", () => {
    it("should return true when all permissions are granted", async () => {
      mockChrome.permissions.contains.mockResolvedValue(true);

      const result = await service.checkPermissions();

      expect(result).toBe(true);
      expect(mockChrome.permissions.contains).toHaveBeenCalledTimes(3);
    });

    it("should return false when any permission is missing", async () => {
      mockChrome.permissions.contains
        .mockResolvedValueOnce(true) // tabCapture
        .mockResolvedValueOnce(false) // scripting
        .mockResolvedValueOnce(true); // activeTab

      const result = await service.checkPermissions();

      expect(result).toBe(false);
    });

    it("should handle permission check errors", async () => {
      mockChrome.permissions.contains.mockRejectedValue(new Error("API Error"));

      const result = await service.checkPermissions();

      expect(result).toBe(false);
    });
  });

  describe("requestPermissions", () => {
    it("should return true when permissions are granted", async () => {
      mockChrome.permissions.request.mockResolvedValue(true);

      const result = await service.requestPermissions();

      expect(result).toBe(true);
      expect(mockChrome.permissions.request).toHaveBeenCalledWith({
        permissions: ["tabCapture", "scripting", "activeTab"],
      });
    });

    it("should return false when permissions are denied", async () => {
      mockChrome.permissions.request.mockResolvedValue(false);

      const result = await service.requestPermissions();

      expect(result).toBe(false);
    });

    it("should handle permission request errors", async () => {
      mockChrome.permissions.request.mockRejectedValue(new Error("API Error"));

      const result = await service.requestPermissions();

      expect(result).toBe(false);
    });
  });

  describe("isShaderToyTab", () => {
    it("should return true for ShaderToy URLs", () => {
      const tab = { url: "https://www.shadertoy.com/view/test" };

      const result = service.isShaderToyTab(tab as chrome.tabs.Tab);

      expect(result).toBe(true);
    });

    it("should return false for non-ShaderToy URLs", () => {
      const tab = { url: "https://www.google.com" };

      const result = service.isShaderToyTab(tab as chrome.tabs.Tab);

      expect(result).toBe(false);
    });

    it("should return false when URL is undefined", () => {
      const tab = {};

      const result = service.isShaderToyTab(tab as chrome.tabs.Tab);

      expect(result).toBe(false);
    });
  });

  describe("getCapturedTabs", () => {
    it("should return captured tabs", async () => {
      const mockCapturedTabs = [
        { tabId: 123, status: "active", fullscreen: false },
      ];
      mockChrome.tabCapture.getCapturedTabs.mockResolvedValue(mockCapturedTabs);

      const result = await service.getCapturedTabs();

      expect(result).toEqual(mockCapturedTabs);
    });

    it("should return empty array on error", async () => {
      mockChrome.tabCapture.getCapturedTabs.mockRejectedValue(
        new Error("API Error")
      );

      const result = await service.getCapturedTabs();

      expect(result).toEqual([]);
    });
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = ChromeAPIServiceImpl.getInstance();
      const instance2 = ChromeAPIServiceImpl.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});
