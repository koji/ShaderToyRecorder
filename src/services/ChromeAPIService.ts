import { ChromeAPIService } from "../types/services";
import { RecordingError } from "../types/errors";

/**
 * Service for handling Chrome extension API operations
 * Provides methods for tab management, content script injection, and audio capture
 */
export class ChromeAPIServiceImpl implements ChromeAPIService {
  private static instance: ChromeAPIServiceImpl;

  private constructor() {}

  public static getInstance(): ChromeAPIServiceImpl {
    if (!ChromeAPIServiceImpl.instance) {
      ChromeAPIServiceImpl.instance = new ChromeAPIServiceImpl();
    }
    return ChromeAPIServiceImpl.instance;
  }

  /**
   * Get the currently active tab
   * @returns Promise resolving to the current active tab
   * @throws Error if no active tab found or API call fails
   */
  async getCurrentTab(): Promise<chrome.tabs.Tab> {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab) {
        throw new Error(RecordingError.TAB_NOT_FOUND);
      }

      if (!tab.id) {
        throw new Error(RecordingError.INVALID_TAB);
      }

      return tab;
    } catch (error) {
      console.error("Failed to get current tab:", error);
      throw new Error(
        `Failed to get current tab: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Inject content script into the specified tab
   * @param tabId - ID of the tab to inject script into
   * @throws Error if injection fails or permissions denied
   */
  async injectContentScript(tabId: number): Promise<void> {
    try {
      // Check if we have permission to access the tab
      const hasPermission = await this.checkTabPermission(tabId);
      if (!hasPermission) {
        throw new Error(RecordingError.PERMISSION_DENIED);
      }

      // Inject the content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/content.js"], // Will be bundled by Vite
      });

      console.log(`Content script injected into tab ${tabId}`);
    } catch (error) {
      console.error(
        `Failed to inject content script into tab ${tabId}:`,
        error
      );

      if (error instanceof Error && error.message.includes("Cannot access")) {
        throw new Error(RecordingError.PERMISSION_DENIED);
      }

      throw new Error(
        `Failed to inject content script: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Capture audio from the specified tab using Chrome's tabCapture API
   * @param tabId - ID of the tab to capture audio from
   * @returns Promise resolving to MediaStream containing audio
   * @throws Error if audio capture fails or permissions denied
   */
  async captureTabAudio(tabId: number): Promise<MediaStream> {
    try {
      // Check if tabCapture permission is available
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        throw new Error(RecordingError.PERMISSION_DENIED);
      }

      // Get media stream ID for the tab
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId,
      });

      if (!streamId) {
        throw new Error(RecordingError.TAB_CAPTURE_FAILED);
      }

      // For Chrome 116+, we need to use offscreen document approach
      // This will be handled by the background script and offscreen document
      const stream = await this.getMediaStreamFromId(streamId);

      if (!stream || stream.getAudioTracks().length === 0) {
        throw new Error(RecordingError.AUDIO_NOT_AVAILABLE);
      }

      console.log(`Audio capture started for tab ${tabId}`);
      return stream;
    } catch (error) {
      console.error(`Failed to capture audio from tab ${tabId}:`, error);

      if (error instanceof Error) {
        if (error.message.includes("permission")) {
          throw new Error(RecordingError.PERMISSION_DENIED);
        }
        if (error.message.includes("not supported")) {
          throw new Error(RecordingError.UNSUPPORTED_BROWSER);
        }
      }

      throw new Error(
        `Audio capture failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Check if the extension has required permissions
   * @returns Promise resolving to true if all permissions are granted
   */
  async checkPermissions(): Promise<boolean> {
    try {
      const hasTabCapture = await chrome.permissions.contains({
        permissions: ["tabCapture"],
      });

      const hasScripting = await chrome.permissions.contains({
        permissions: ["scripting"],
      });

      const hasActiveTab = await chrome.permissions.contains({
        permissions: ["activeTab"],
      });

      return hasTabCapture && hasScripting && hasActiveTab;
    } catch (error) {
      console.error("Failed to check permissions:", error);
      return false;
    }
  }

  /**
   * Request required permissions from the user
   * @returns Promise resolving to true if permissions were granted
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const granted = await chrome.permissions.request({
        permissions: ["tabCapture", "scripting", "activeTab"],
      });

      if (granted) {
        console.log("Permissions granted successfully");
      } else {
        console.warn("Permissions denied by user");
      }

      return granted;
    } catch (error) {
      console.error("Failed to request permissions:", error);
      return false;
    }
  }

  /**
   * Check if we have permission to access a specific tab
   * @param tabId - ID of the tab to check
   * @returns Promise resolving to true if tab is accessible
   */
  private async checkTabPermission(tabId: number): Promise<boolean> {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab && tab.url && !tab.url.startsWith("chrome://");
    } catch (error) {
      console.error(`Cannot access tab ${tabId}:`, error);
      return false;
    }
  }

  /**
   * Convert stream ID to MediaStream using offscreen document
   * This is required for Chrome 116+ audio capture
   * @param streamId - Stream ID from tabCapture API
   * @returns Promise resolving to MediaStream
   */
  private async getMediaStreamFromId(streamId: string): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      // Send message to background script to handle offscreen document creation
      chrome.runtime.sendMessage(
        {
          type: "get-media-stream",
          streamId,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (response.error) {
            reject(new Error(response.error));
            return;
          }

          if (response.stream) {
            resolve(response.stream);
          } else {
            reject(new Error("No stream received from background script"));
          }
        }
      );
    });
  }

  /**
   * Check if the current tab is a ShaderToy page
   * @param tab - Tab to check
   * @returns true if tab is on ShaderToy domain
   */
  isShaderToyTab(tab: chrome.tabs.Tab): boolean {
    return tab.url?.includes("shadertoy.com") ?? false;
  }

  /**
   * Get all tabs that are currently being captured
   * @returns Promise resolving to array of capture info
   */
  async getCapturedTabs(): Promise<chrome.tabCapture.CaptureInfo[]> {
    try {
      return await chrome.tabCapture.getCapturedTabs();
    } catch (error) {
      console.error("Failed to get captured tabs:", error);
      return [];
    }
  }
}

// Export singleton instance
export const chromeAPIService = ChromeAPIServiceImpl.getInstance();
