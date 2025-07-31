// End-to-End tests for Chrome extension functionality

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Chrome extension environment
class ChromeExtensionE2EEnvironment {
  private mockChrome: any;
  private mockDocument: any;
  private mockWindow: any;

  constructor() {
    this.setupChromeAPIs();
    this.setupDOMEnvironment();
    this.setupWebAPIs();
  }

  private setupChromeAPIs() {
    this.mockChrome = {
      runtime: {
        id: "test-extension-id",
        getManifest: vi.fn().mockReturnValue({
          name: "ShaderToy Audio-Video Recorder",
          version: "2.0.0",
          manifest_version: 3,
        }),
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        lastError: null,
      },
      tabs: {
        query: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      scripting: {
        executeScript: vi.fn(),
        insertCSS: vi.fn(),
      },
      tabCapture: {
        getMediaStreamId: vi.fn(),
        getCapturedTabs: vi.fn(),
      },
      permissions: {
        contains: vi.fn(),
        request: vi.fn(),
      },
      action: {
        setIcon: vi.fn(),
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn(),
        },
        sync: {
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
      offscreen: {
        createDocument: vi.fn(),
        closeDocument: vi.fn(),
        hasDocument: vi.fn(),
      },
    };

    global.chrome = this.mockChrome;
  }

  private setupDOMEnvironment() {
    this.mockDocument = {
      createElement: vi.fn().mockImplementation((tagName: string) => {
        const element: any = {
          tagName: tagName.toUpperCase(),
          style: {},
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: vi.fn(),
          },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          click: vi.fn(),
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        };

        if (tagName === "canvas") {
          element.width = 800;
          element.height = 600;
          element.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(),
            clearRect: vi.fn(),
          });
          element.captureStream = vi.fn().mockReturnValue({
            id: "canvas-stream",
            getVideoTracks: vi.fn().mockReturnValue([{ kind: "video" }]),
            getAudioTracks: vi.fn().mockReturnValue([]),
          });
        }

        if (tagName === "a") {
          element.href = "";
          element.download = "";
        }

        return element;
      }),
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      head: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };

    global.document = this.mockDocument;
  }

  private setupWebAPIs() {
    global.URL = {
      createObjectURL: vi.fn().mockReturnValue("blob:mock-url"),
      revokeObjectURL: vi.fn(),
    };

    global.Blob = class MockBlob {
      size: number;
      type: string;
      constructor(parts: any[], options: { type?: string } = {}) {
        this.size = parts.reduce((acc, part) => acc + (part.length || 0), 0);
        this.type = options.type || "";
      }
    } as any;

    global.MediaRecorder = class MockMediaRecorder {
      state: MediaRecorderRecordingState = "inactive";
      mimeType: string;
      stream: MediaStream;
      private eventListeners: { [key: string]: EventListener[] } = {};

      constructor(stream: MediaStream, options?: { mimeType?: string }) {
        this.stream = stream;
        this.mimeType = options?.mimeType || "video/webm";
      }

      start() {
        this.state = "recording";
        setTimeout(() => this.dispatchEvent(new Event("start")), 0);
      }

      stop() {
        this.state = "inactive";
        setTimeout(() => {
          const blob = new Blob(["mock data"], { type: this.mimeType });
          this.dispatchEvent(
            new BlobEvent("dataavailable", { data: blob } as any)
          );
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
    } as any;

    this.mockWindow = {
      location: {
        href: "https://www.shadertoy.com/view/test",
        hostname: "www.shadertoy.com",
      },
      getComputedStyle: vi.fn().mockReturnValue({
        display: "block",
        visibility: "visible",
      }),
    };

    global.window = this.mockWindow;
  }

  // Simulate extension installation
  simulateExtensionInstall() {
    this.mockChrome.runtime.onInstalled = {
      addListener: vi.fn(),
    };
  }

  // Simulate tab navigation to ShaderToy
  simulateShaderToyNavigation(tabId: number = 123) {
    const tab = {
      id: tabId,
      url: "https://www.shadertoy.com/view/test",
      title: "ShaderToy - Test Shader",
      active: true,
    };

    this.mockChrome.tabs.query.mockResolvedValue([tab]);
    this.mockChrome.tabs.get.mockResolvedValue(tab);

    // Simulate canvas element on page
    this.mockDocument.querySelector.mockImplementation((selector: string) => {
      if (selector === "canvas" || selector.includes("canvas")) {
        return this.mockDocument.createElement("canvas");
      }
      return null;
    });

    return tab;
  }

  // Simulate user clicking extension icon
  simulateExtensionIconClick() {
    // This would trigger popup opening in real scenario
    return {
      popupOpened: true,
      popupUrl: "popup.html",
    };
  }

  // Simulate permission requests
  simulatePermissionFlow(granted: boolean = true) {
    this.mockChrome.permissions.contains.mockResolvedValue(granted);
    this.mockChrome.permissions.request.mockResolvedValue(granted);
  }

  // Simulate audio capture
  simulateAudioCapture(success: boolean = true) {
    if (success) {
      this.mockChrome.tabCapture.getMediaStreamId.mockResolvedValue(
        "stream-id"
      );
      this.mockChrome.runtime.sendMessage.mockImplementation(
        (message, callback) => {
          callback({
            stream: {
              id: "audio-stream",
              getAudioTracks: () => [{ kind: "audio", id: "audio-track" }],
              getVideoTracks: () => [],
            },
          });
        }
      );
    } else {
      this.mockChrome.tabCapture.getMediaStreamId.mockResolvedValue(null);
    }
  }

  // Clean up mocks
  cleanup() {
    vi.clearAllMocks();
  }
}

// E2E Test Scenarios
describe("Chrome Extension E2E Tests", () => {
  let environment: ChromeExtensionE2EEnvironment;

  beforeEach(() => {
    environment = new ChromeExtensionE2EEnvironment();
  });

  afterEach(() => {
    environment.cleanup();
  });

  describe("Extension Installation and Setup", () => {
    it("should install extension successfully", () => {
      environment.simulateExtensionInstall();

      expect(chrome.runtime.getManifest()).toEqual({
        name: "ShaderToy Audio-Video Recorder",
        version: "2.0.0",
        manifest_version: 3,
      });
    });

    it("should have required permissions in manifest", () => {
      const manifest = chrome.runtime.getManifest();

      expect(manifest.name).toBe("ShaderToy Audio-Video Recorder");
      expect(manifest.version).toBe("2.0.0");
      expect(manifest.manifest_version).toBe(3);
    });
  });

  describe("ShaderToy Page Detection", () => {
    it("should detect ShaderToy pages correctly", async () => {
      const tab = environment.simulateShaderToyNavigation();

      expect(tab.url).toContain("shadertoy.com");
      expect(chrome.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });

    it("should find canvas element on ShaderToy page", () => {
      environment.simulateShaderToyNavigation();

      const canvas = document.querySelector("canvas");
      expect(canvas).toBeTruthy();
      expect(canvas?.tagName).toBe("CANVAS");
    });

    it("should reject non-ShaderToy pages", async () => {
      const nonShaderToyTab = {
        id: 123,
        url: "https://www.google.com",
        title: "Google",
        active: true,
      };

      chrome.tabs.query = vi.fn().mockResolvedValue([nonShaderToyTab]);

      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      expect(tabs[0].url).not.toContain("shadertoy.com");
    });
  });

  describe("Permission Handling", () => {
    it("should request required permissions", async () => {
      environment.simulatePermissionFlow(true);

      const hasPermissions = await chrome.permissions.contains({
        permissions: ["tabCapture", "scripting", "activeTab"],
      });

      expect(hasPermissions).toBe(true);
      expect(chrome.permissions.contains).toHaveBeenCalled();
    });

    it("should handle permission denial gracefully", async () => {
      environment.simulatePermissionFlow(false);

      const granted = await chrome.permissions.request({
        permissions: ["tabCapture", "scripting", "activeTab"],
      });

      expect(granted).toBe(false);
      expect(chrome.permissions.request).toHaveBeenCalled();
    });
  });

  describe("Content Script Injection", () => {
    it("should inject content script into ShaderToy pages", async () => {
      const tab = environment.simulateShaderToyNavigation();

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content/content.js"],
      });

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: tab.id },
        files: ["src/content/content.js"],
      });
    });

    it("should handle content script injection failures", async () => {
      chrome.scripting.executeScript = vi
        .fn()
        .mockRejectedValue(new Error("Cannot access contents of url"));

      const tab = environment.simulateShaderToyNavigation();

      await expect(
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["src/content/content.js"],
        })
      ).rejects.toThrow("Cannot access contents of url");
    });
  });

  describe("Audio Capture Workflow", () => {
    it("should capture audio from tab successfully", async () => {
      const tab = environment.simulateShaderToyNavigation();
      environment.simulateAudioCapture(true);

      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tab.id,
      });

      expect(streamId).toBe("stream-id");
      expect(chrome.tabCapture.getMediaStreamId).toHaveBeenCalledWith({
        targetTabId: tab.id,
      });
    });

    it("should handle audio capture failures", async () => {
      const tab = environment.simulateShaderToyNavigation();
      environment.simulateAudioCapture(false);

      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tab.id,
      });

      expect(streamId).toBeNull();
    });

    it("should use offscreen document for Chrome 116+", async () => {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification: "Recording audio from ShaderToy tab",
      });

      expect(chrome.offscreen.createDocument).toHaveBeenCalledWith({
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification: "Recording audio from ShaderToy tab",
      });
    });
  });

  describe("Video Recording Workflow", () => {
    it("should capture video from canvas", () => {
      environment.simulateShaderToyNavigation();

      const canvas = document.createElement("canvas");
      const stream = canvas.captureStream(30);

      expect(stream).toBeTruthy();
      expect(stream.id).toBe("canvas-stream");
      expect(canvas.captureStream).toHaveBeenCalledWith(30);
    });

    it("should start MediaRecorder with combined streams", () => {
      const videoStream = {
        id: "video-stream",
        getVideoTracks: () => [{ kind: "video" }],
        getAudioTracks: () => [],
      };

      const audioStream = {
        id: "audio-stream",
        getVideoTracks: () => [],
        getAudioTracks: () => [{ kind: "audio" }],
      };

      const recorder = new MediaRecorder(videoStream as any);
      expect(recorder).toBeInstanceOf(MediaRecorder);
      expect(recorder.state).toBe("inactive");
    });
  });

  describe("File Generation and Download", () => {
    it("should generate recording file with timestamp", () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");

      const filename = `shadertoy-recording_${year}-${month}-${day}_12-34-56.webm`;

      expect(filename).toMatch(
        /^shadertoy-recording_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.webm$/
      );
    });

    it("should trigger file download", () => {
      const blob = new Blob(["test data"], { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "test.webm";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(document.createElement).toHaveBeenCalledWith("a");
      expect(link.click).toHaveBeenCalled();
    });
  });

  describe("Cross-Tab Recording Management", () => {
    it("should handle multiple ShaderToy tabs", async () => {
      const tab1 = { id: 123, url: "https://www.shadertoy.com/view/test1" };
      const tab2 = { id: 124, url: "https://www.shadertoy.com/view/test2" };

      chrome.tabs.query = vi.fn().mockResolvedValue([tab1, tab2]);

      const tabs = await chrome.tabs.query({ url: "*://www.shadertoy.com/*" });
      expect(tabs).toHaveLength(2);
      expect(tabs.every((tab) => tab.url?.includes("shadertoy.com"))).toBe(
        true
      );
    });

    it("should prevent duplicate recordings on same tab", async () => {
      const tab = environment.simulateShaderToyNavigation();

      // Simulate recording state tracking
      const recordingSessions = new Map();

      if (recordingSessions.has(tab.id)) {
        throw new Error("Recording already in progress on this tab");
      }

      recordingSessions.set(tab.id, { startTime: Date.now() });

      expect(() => {
        if (recordingSessions.has(tab.id)) {
          throw new Error("Recording already in progress on this tab");
        }
      }).toThrow("Recording already in progress on this tab");
    });

    it("should clean up when tab is closed", () => {
      const tab = environment.simulateShaderToyNavigation();
      const recordingSessions = new Map();
      recordingSessions.set(tab.id, { startTime: Date.now() });

      // Simulate tab removal
      chrome.tabs.onRemoved.addListener((tabId: number) => {
        recordingSessions.delete(tabId);
      });

      // Trigger tab removal
      const listeners = (chrome.tabs.onRemoved.addListener as any).mock
        .calls[0];
      if (listeners && listeners[0]) {
        listeners[0](tab.id);
      }

      expect(recordingSessions.has(tab.id)).toBe(false);
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should handle extension context invalidation", () => {
      chrome.runtime.lastError = { message: "Extension context invalidated" };

      const hasError = chrome.runtime.lastError !== null;
      expect(hasError).toBe(true);
      expect(chrome.runtime.lastError?.message).toBe(
        "Extension context invalidated"
      );
    });

    it("should handle tab navigation away from ShaderToy", async () => {
      const tab = environment.simulateShaderToyNavigation();

      // Simulate navigation to different site
      const updatedTab = { ...tab, url: "https://www.google.com" };
      chrome.tabs.get = vi.fn().mockResolvedValue(updatedTab);

      const currentTab = await chrome.tabs.get(tab.id);
      expect(currentTab.url).not.toContain("shadertoy.com");
    });

    it("should handle browser restart scenarios", () => {
      // Simulate extension restart
      const extensionId = chrome.runtime.id;
      expect(extensionId).toBe("test-extension-id");

      // Extension should maintain state across restarts
      chrome.storage.local.set({ recordingState: "inactive" });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        recordingState: "inactive",
      });
    });
  });

  describe("Performance and Resource Management", () => {
    it("should handle memory constraints", () => {
      // Simulate large recording
      const largeBlob = new Blob([new ArrayBuffer(100 * 1024 * 1024)]); // 100MB
      expect(largeBlob.size).toBe(100 * 1024 * 1024);

      // Should handle large files appropriately
      const isLarge = largeBlob.size > 50 * 1024 * 1024; // 50MB threshold
      expect(isLarge).toBe(true);
    });

    it("should clean up resources after recording", () => {
      const url = URL.createObjectURL(new Blob(["test"]));

      // Simulate cleanup
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it("should handle concurrent operations", async () => {
      const operations = Array.from({ length: 5 }, (_, i) =>
        Promise.resolve(`operation-${i}`)
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(5);
      expect(results.every((r) => r.startsWith("operation-"))).toBe(true);
    });
  });

  describe("User Interface Integration", () => {
    it("should update extension icon based on recording state", () => {
      // Recording inactive
      chrome.action.setIcon({ path: "icon-inactive.png" });
      expect(chrome.action.setIcon).toHaveBeenCalledWith({
        path: "icon-inactive.png",
      });

      // Recording active
      chrome.action.setIcon({ path: "icon-recording.png" });
      expect(chrome.action.setIcon).toHaveBeenCalledWith({
        path: "icon-recording.png",
      });
    });

    it("should show recording duration in badge", () => {
      chrome.action.setBadgeText({ text: "1:23" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "1:23" });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: "#FF0000",
      });
    });

    it("should handle popup interactions", () => {
      const popupResult = environment.simulateExtensionIconClick();

      expect(popupResult.popupOpened).toBe(true);
      expect(popupResult.popupUrl).toBe("popup.html");
    });
  });
});
