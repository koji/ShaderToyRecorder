/**
 * Background service worker for Chrome extension
 * Manages offscreen documents, handles audio capture coordination,
 * and manages recording sessions across tabs
 */

import { RecordingError, RecordingException } from "../types/errors";

interface BackgroundMessage {
  type:
    | "get-media-stream"
    | "start-recording"
    | "stop-recording"
    | "get-recording-state"
    | "cleanup-tab"
    | "cross-tab-recording";
  streamId?: string;
  tabId?: number;
  action?: string;
}

interface RecordingSession {
  tabId: number;
  streamId: string;
  startTime: number;
  isActive: boolean;
  url?: string;
}

class BackgroundService {
  private offscreenDocumentUrl = "src/offscreen/offscreen.html";
  private isOffscreenDocumentCreated = false;
  private recordingSessions = new Map<number, RecordingSession>();
  private extensionEnabled = true;

  constructor() {
    this.setupMessageListener();
    this.setupExtensionEvents();
    this.setupPeriodicCleanup();
    this.setupTabFocusMonitoring();
    this.handleExtensionRecovery();
    console.log("Background service worker initialized");
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: BackgroundMessage, sender, sendResponse) => {
        this.handleMessage(message, sender)
          .then(sendResponse)
          .catch((error) => {
            console.error("Background message handling error:", error);
            sendResponse({
              success: false,
              error: error.message || "Unknown error in background script",
            });
          });

        // Return true to indicate we will send a response asynchronously
        return true;
      }
    );
  }

  private setupExtensionEvents(): void {
    // Handle extension startup
    chrome.runtime.onStartup.addListener(() => {
      console.log("Extension started");
      this.extensionEnabled = true;
      this.recordingSessions.clear();
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      console.log("Extension installed:", details.reason);
      if (details.reason === "install") {
        this.initializeExtension();
      }
    });

    // Handle extension suspension/disable
    chrome.runtime.onSuspend.addListener(() => {
      console.log("Extension suspending, cleaning up");
      this.handleExtensionDisableEnhanced();
    });

    // Handle tab updates to cleanup resources
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.handleTabClosed(tabId);
    });

    // Handle tab navigation
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.url) {
        this.handleTabNavigated(tabId, changeInfo.url);
      }
    });

    // Handle window closed
    chrome.windows.onRemoved.addListener((windowId) => {
      this.handleWindowClosed(windowId);
    });
  }

  private async handleMessage(
    message: BackgroundMessage,
    sender: chrome.runtime.MessageSender
  ): Promise<any> {
    if (!this.extensionEnabled) {
      return {
        success: false,
        error: "Extension is disabled",
      };
    }

    switch (message.type) {
      case "get-media-stream":
        return this.getMediaStream(message.streamId!);

      case "start-recording":
        return this.startRecording(message.tabId!, message.streamId);

      case "stop-recording":
        return this.stopRecording(message.tabId, message.streamId);

      case "get-recording-state":
        return this.getRecordingState(message.tabId);

      case "cleanup-tab":
        return this.cleanupTab(message.tabId!);

      case "cross-tab-recording":
        return this.handleCrossTabRecording(
          message.tabId!,
          message.action as "start" | "stop"
        );

      default:
        throw new Error(`Unknown message type: ${(message as any).type}`);
    }
  }

  /**
   * Get media stream using offscreen document
   */
  private async getMediaStream(streamId: string): Promise<any> {
    try {
      // Ensure offscreen document exists
      await this.ensureOffscreenDocument();

      // Forward the request to offscreen document
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "get-media-stream",
            streamId,
          },
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
    } catch (error) {
      console.error("Failed to get media stream:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Media stream failed",
      };
    }
  }

  /**
   * Start recording session
   */
  private async startRecording(tabId: number, streamId?: string): Promise<any> {
    try {
      console.log(`Starting recording for tab ${tabId}`);

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

      // If no stream ID provided, get one from tabCapture
      if (!streamId) {
        streamId = await chrome.tabCapture.getMediaStreamId({
          targetTabId: tabId,
        });

        if (!streamId) {
          throw new RecordingException(
            RecordingError.TAB_CAPTURE_FAILED,
            "Failed to get media stream ID for tab capture"
          );
        }
      }

      // Create recording session
      const session: RecordingSession = {
        tabId,
        streamId,
        startTime: Date.now(),
        isActive: true,
        url: tab.url,
      };

      this.recordingSessions.set(tabId, session);

      // Notify other tabs about new recording starting
      await this.synchronizeCrossTabState(tabId, "started");

      // Ensure offscreen document exists
      await this.ensureOffscreenDocument();

      // Start audio capture in offscreen document
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "start-audio-capture",
            streamId,
            tabId,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              // Remove failed session
              this.recordingSessions.delete(tabId);
              resolve({
                success: false,
                error: chrome.runtime.lastError.message,
              });
              return;
            }

            if (!response.success) {
              // Remove failed session
              this.recordingSessions.delete(tabId);
            }

            resolve(response);
          }
        );
      });
    } catch (error) {
      console.error("Failed to start recording:", error);

      // Clean up failed session
      this.recordingSessions.delete(tabId);

      if (error instanceof RecordingException) {
        return {
          success: false,
          error: error.message,
          code: error.code,
        };
      }

      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Recording start failed",
      };
    }
  }

  /**
   * Stop recording session
   */
  private async stopRecording(tabId?: number, streamId?: string): Promise<any> {
    try {
      // Find session by tabId or streamId
      let session: RecordingSession | undefined;
      let sessionTabId: number | undefined;

      if (tabId) {
        session = this.recordingSessions.get(tabId);
        sessionTabId = tabId;
      } else if (streamId) {
        // Find session by streamId
        for (const [tId, s] of this.recordingSessions.entries()) {
          if (s.streamId === streamId) {
            session = s;
            sessionTabId = tId;
            break;
          }
        }
      }

      if (!session || !sessionTabId) {
        return { success: true }; // Nothing to stop
      }

      console.log(
        `Stopping recording for tab ${sessionTabId}, stream ${session.streamId}`
      );

      // Mark session as inactive
      session.isActive = false;

      // Stop audio capture in offscreen document
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "stop-audio-capture",
            streamId: session!.streamId,
          },
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

      // Remove session after stopping
      this.recordingSessions.delete(sessionTabId);

      // Notify other tabs about recording stopped
      await this.synchronizeCrossTabState(sessionTabId, "stopped");

      return result;
    } catch (error) {
      console.error("Failed to stop recording:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Recording stop failed",
      };
    }
  }

  /**
   * Ensure offscreen document exists for audio capture
   */
  private async ensureOffscreenDocument(): Promise<void> {
    try {
      // Check if offscreen document already exists
      if (this.isOffscreenDocumentCreated) {
        const hasDocument = await chrome.offscreen.hasDocument();
        if (hasDocument) {
          return; // Document already exists
        } else {
          this.isOffscreenDocumentCreated = false;
        }
      }

      // Create offscreen document
      await chrome.offscreen.createDocument({
        url: this.offscreenDocumentUrl,
        reasons: ["USER_MEDIA"],
        justification:
          "Recording audio from ShaderToy tab for combined video/audio capture",
      });

      this.isOffscreenDocumentCreated = true;
      console.log("Offscreen document created successfully");
    } catch (error) {
      console.error("Failed to create offscreen document:", error);

      // If document already exists, that's fine
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

  /**
   * Get recording state for a tab
   */
  private getRecordingState(tabId?: number): any {
    if (!tabId) {
      // Return all active sessions
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

  /**
   * Clean up resources for a specific tab
   */
  private async cleanupTab(tabId: number): Promise<any> {
    try {
      console.log(`Cleaning up resources for tab ${tabId}`);

      const session = this.recordingSessions.get(tabId);
      if (session && session.isActive) {
        await this.stopRecording(tabId);
      }

      this.recordingSessions.delete(tabId);

      return { success: true };
    } catch (error) {
      console.error(`Error cleaning up tab ${tabId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Cleanup failed",
      };
    }
  }

  /**
   * Initialize extension on first install
   */
  private async initializeExtension(): Promise<void> {
    try {
      console.log("Initializing extension for first time");
      this.extensionEnabled = true;
      this.recordingSessions.clear();

      // Set up any initial configuration
      await chrome.storage.local.set({
        extensionEnabled: true,
        installDate: Date.now(),
      });
    } catch (error) {
      console.error("Error initializing extension:", error);
    }
  }

  /**
   * Handle extension disable/suspend
   */
  private async handleExtensionDisable(): Promise<void> {
    try {
      console.log("Extension being disabled, stopping all recordings");
      this.extensionEnabled = false;

      // Stop all active recordings
      const activeTabIds = Array.from(this.recordingSessions.keys());
      for (const tabId of activeTabIds) {
        await this.stopRecording(tabId);
      }

      this.recordingSessions.clear();

      // Clean up offscreen document
      if (this.isOffscreenDocumentCreated) {
        await chrome.offscreen.closeDocument();
        this.isOffscreenDocumentCreated = false;
      }
    } catch (error) {
      console.error("Error handling extension disable:", error);
    }
  }

  /**
   * Set up periodic cleanup of stale sessions
   */
  private setupPeriodicCleanup(): void {
    // Clean up stale sessions every 5 minutes
    setInterval(() => {
      this.cleanupStaleSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up sessions that have been running too long or are stale
   */
  private async cleanupStaleSessions(): Promise<void> {
    try {
      const now = Date.now();
      const maxSessionDuration = 60 * 60 * 1000; // 1 hour
      const staleTabIds: number[] = [];

      for (const [tabId, session] of this.recordingSessions.entries()) {
        // Check if session is too old
        if (now - session.startTime > maxSessionDuration) {
          console.log(
            `Session for tab ${tabId} exceeded max duration, cleaning up`
          );
          staleTabIds.push(tabId);
          continue;
        }

        // Check if tab still exists
        try {
          await chrome.tabs.get(tabId);
        } catch (error) {
          console.log(`Tab ${tabId} no longer exists, cleaning up session`);
          staleTabIds.push(tabId);
        }
      }

      // Clean up stale sessions
      for (const tabId of staleTabIds) {
        await this.cleanupTab(tabId);
      }
    } catch (error) {
      console.error("Error during periodic cleanup:", error);
    }
  }

  /**
   * Handle tab closed event
   */
  private async handleTabClosed(tabId: number): Promise<void> {
    try {
      console.log(`Tab ${tabId} closed, cleaning up resources`);
      await this.cleanupTab(tabId);
    } catch (error) {
      console.error("Error handling tab closed:", error);
    }
  }

  /**
   * Handle tab navigation event with enhanced cleanup
   */
  private async handleTabNavigated(tabId: number, url: string): Promise<void> {
    try {
      const session = this.recordingSessions.get(tabId);

      if (session && session.isActive) {
        // If user navigated away from ShaderToy, stop recording gracefully
        if (!url.includes("shadertoy.com")) {
          console.log(
            `Tab ${tabId} navigated away from ShaderToy (${session.url} -> ${url}), stopping recording gracefully`
          );

          // Stop recording with graceful cleanup
          await this.stopRecordingGracefully(tabId, "navigation_away");

          // Notify other tabs about the state change
          await this.synchronizeCrossTabState(tabId, "stopped");

          // Send message to the tab that navigated away (if possible)
          try {
            await chrome.tabs.sendMessage(tabId, {
              type: "recording-stopped",
              reason: "navigation_away",
              previousUrl: session.url,
              newUrl: url,
            });
          } catch (error) {
            // Tab might not be able to receive messages, ignore
            console.log(
              `Could not notify tab ${tabId} about recording stop:`,
              error
            );
          }
        } else {
          // Update session URL if still on ShaderToy
          const previousUrl = session.url;
          session.url = url;

          console.log(
            `Tab ${tabId} navigated within ShaderToy (${previousUrl} -> ${url}), continuing recording`
          );

          // Notify the tab about URL change while recording
          try {
            await chrome.tabs.sendMessage(tabId, {
              type: "recording-url-changed",
              previousUrl,
              newUrl: url,
              recordingDuration: Date.now() - session.startTime,
            });
          } catch (error) {
            console.log(
              `Could not notify tab ${tabId} about URL change:`,
              error
            );
          }
        }
      }
    } catch (error) {
      console.error("Error handling tab navigation:", error);
    }
  }

  /**
   * Stop recording gracefully with proper cleanup and notification
   */
  private async stopRecordingGracefully(
    tabId: number,
    reason: string
  ): Promise<void> {
    try {
      const session = this.recordingSessions.get(tabId);
      if (!session || !session.isActive) {
        return;
      }

      console.log(
        `Gracefully stopping recording for tab ${tabId}, reason: ${reason}`
      );

      // Calculate recording duration
      const duration = Date.now() - session.startTime;

      // Mark session as inactive immediately to prevent race conditions
      session.isActive = false;

      // Stop audio capture in offscreen document with timeout
      try {
        await Promise.race([
          new Promise((resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "stop-audio-capture",
                streamId: session.streamId,
                reason,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "Error stopping audio capture:",
                    chrome.runtime.lastError.message
                  );
                }
                resolve(response);
              }
            );
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Stop timeout")), 5000)
          ),
        ]);
      } catch (error) {
        console.error(
          `Timeout or error stopping recording for tab ${tabId}:`,
          error
        );
      }

      // Remove session
      this.recordingSessions.delete(tabId);

      // Log the graceful stop
      console.log(
        `Recording stopped gracefully for tab ${tabId} after ${duration}ms, reason: ${reason}`
      );

      // Store cleanup info for debugging
      await chrome.storage.local.set({
        [`lastStop_${tabId}`]: {
          timestamp: Date.now(),
          duration,
          reason,
          url: session.url,
        },
      });
    } catch (error) {
      console.error(`Error in graceful stop for tab ${tabId}:`, error);

      // Force cleanup even if graceful stop failed
      this.recordingSessions.delete(tabId);
    }
  }

  /**
   * Handle window closed event
   */
  private async handleWindowClosed(windowId: number): Promise<void> {
    try {
      console.log(`Window ${windowId} closed, cleaning up associated tabs`);

      // Get all tabs that were in this window and clean them up
      const tabsToCleanup: number[] = [];

      for (const [tabId, session] of this.recordingSessions.entries()) {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.windowId === windowId) {
            tabsToCleanup.push(tabId);
          }
        } catch (error) {
          // Tab doesn't exist anymore, add to cleanup
          tabsToCleanup.push(tabId);
        }
      }

      // Clean up all tabs from the closed window
      for (const tabId of tabsToCleanup) {
        await this.cleanupTab(tabId);
      }
    } catch (error) {
      console.error("Error handling window closed:", error);
    }
  }

  /**
   * Cleanup resources when service worker is terminated
   */
  async cleanup(): Promise<void> {
    try {
      console.log("Background service cleanup initiated");

      // Stop all active recordings
      const activeTabIds = Array.from(this.recordingSessions.keys());
      for (const tabId of activeTabIds) {
        await this.stopRecording(tabId);
      }

      this.recordingSessions.clear();

      // Close offscreen document
      if (this.isOffscreenDocumentCreated) {
        await chrome.offscreen.closeDocument();
        this.isOffscreenDocumentCreated = false;
      }

      console.log("Background service cleanup completed");
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }

  /**
   * Get current recording statistics
   */
  getStats(): any {
    return {
      totalSessions: this.recordingSessions.size,
      activeSessions: Array.from(this.recordingSessions.values()).filter(
        (s) => s.isActive
      ).length,
      extensionEnabled: this.extensionEnabled,
      offscreenDocumentCreated: this.isOffscreenDocumentCreated,
    };
  }

  /**
   * Stop all recordings across all tabs
   */
  async stopAllRecordings(): Promise<void> {
    console.log("Stopping all active recordings");

    const activeTabIds = Array.from(this.recordingSessions.keys());
    const stopPromises = activeTabIds.map((tabId) => this.stopRecording(tabId));

    try {
      await Promise.all(stopPromises);
      console.log(`Stopped ${activeTabIds.length} recordings`);
    } catch (error) {
      console.error("Error stopping all recordings:", error);
    }
  }

  /**
   * Get all active recording sessions
   */
  getActiveRecordings(): RecordingSession[] {
    return Array.from(this.recordingSessions.values()).filter(
      (session) => session.isActive
    );
  }

  /**
   * Get recording sessions for specific tabs
   */
  getRecordingSessionsForTabs(tabIds: number[]): RecordingSession[] {
    return tabIds
      .map((tabId) => this.recordingSessions.get(tabId))
      .filter(
        (session): session is RecordingSession =>
          session !== undefined && session.isActive
      );
  }

  /**
   * Check if any tabs in a window are recording
   */
  async isWindowRecording(windowId: number): Promise<boolean> {
    try {
      const tabs = await chrome.tabs.query({ windowId });
      return tabs.some((tab) => tab.id && this.isTabRecording(tab.id));
    } catch (error) {
      console.error("Error checking window recording status:", error);
      return false;
    }
  }

  /**
   * Get cross-tab recording statistics
   */
  getCrossTabStats(): {
    totalTabs: number;
    activeTabs: number;
    recordingSessions: Array<{
      tabId: number;
      url?: string;
      duration: number;
      startTime: number;
    }>;
  } {
    const activeRecordings = this.getActiveRecordings();

    return {
      totalTabs: this.recordingSessions.size,
      activeTabs: activeRecordings.length,
      recordingSessions: activeRecordings.map((session) => ({
        tabId: session.tabId,
        url: session.url,
        duration: Date.now() - session.startTime,
        startTime: session.startTime,
      })),
    };
  }

  /**
   * Check if a tab has an active recording
   */
  isTabRecording(tabId: number): boolean {
    const session = this.recordingSessions.get(tabId);
    return session?.isActive || false;
  }

  /**
   * Handle extension context invalidation (when extension is reloaded)
   */
  private handleContextInvalidation(): void {
    console.log("Extension context invalidated, cleaning up");

    // Mark extension as disabled to prevent new operations
    this.extensionEnabled = false;

    // Clear all sessions since they're no longer valid
    this.recordingSessions.clear();

    // Reset offscreen document state
    this.isOffscreenDocumentCreated = false;
  }

  /**
   * Enhanced cross-tab recording management
   * Ensures proper handling of recording state across multiple tabs
   */
  async handleCrossTabRecording(
    tabId: number,
    action: "start" | "stop"
  ): Promise<any> {
    try {
      if (action === "start") {
        // Check if this tab already has an active recording
        const existingSession = this.recordingSessions.get(tabId);
        if (existingSession && existingSession.isActive) {
          return {
            success: false,
            error: "Recording already active for this tab",
            code: "RECORDING_ALREADY_ACTIVE",
          };
        }

        // Check if any other tabs are recording
        const activeRecordings = this.getActiveRecordings();
        const otherActiveRecordings = activeRecordings.filter(
          (session) => session.tabId !== tabId
        );

        // Verify tab is still valid and on ShaderToy
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url || !tab.url.includes("shadertoy.com")) {
          return {
            success: false,
            error: "Tab is not a valid ShaderToy page",
            code: "INVALID_TAB",
          };
        }

        // Check if tab is still active/visible
        if (!tab.active) {
          console.log(`Warning: Starting recording on inactive tab ${tabId}`);
        }

        // Log cross-tab recording scenario
        if (otherActiveRecordings.length > 0) {
          console.log(
            `Starting recording on tab ${tabId} while ${otherActiveRecordings.length} other tabs are recording`
          );

          // Notify about concurrent recordings
          return {
            success: true,
            canProceed: true,
            warning: `${otherActiveRecordings.length} other tabs are currently recording`,
            concurrentRecordings: otherActiveRecordings.map((session) => ({
              tabId: session.tabId,
              url: session.url,
              duration: Date.now() - session.startTime,
            })),
          };
        }

        return { success: true, canProceed: true };
      } else if (action === "stop") {
        // Stop recording for this tab
        const session = this.recordingSessions.get(tabId);
        if (session && session.isActive) {
          await this.stopRecording(tabId);
          return {
            success: true,
            stopped: true,
            duration: Date.now() - session.startTime,
          };
        }

        return { success: true, stopped: false };
      }

      return { success: false, error: "Invalid action" };
    } catch (error) {
      console.error("Error in cross-tab recording management:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Cross-tab management failed",
      };
    }
  }

  /**
   * Handle cross-tab state synchronization
   * Ensures all tabs are aware of recording state changes
   */
  private async synchronizeCrossTabState(
    changedTabId: number,
    action: "started" | "stopped"
  ): Promise<void> {
    try {
      // Get all ShaderToy tabs
      const allTabs = await chrome.tabs.query({
        url: "*://www.shadertoy.com/*",
      });

      // Send state update to all ShaderToy tabs except the one that changed
      const updatePromises = allTabs
        .filter((tab) => tab.id !== changedTabId && tab.id)
        .map(async (tab) => {
          try {
            await chrome.tabs.sendMessage(tab.id!, {
              type: "recording-state-changed",
              action,
              changedTabId,
              activeRecordings: this.getActiveRecordings().map((session) => ({
                tabId: session.tabId,
                url: session.url,
                duration: Date.now() - session.startTime,
              })),
            });
          } catch (error) {
            // Tab might not have content script loaded, ignore
            console.log(
              `Could not notify tab ${tab.id} of state change:`,
              error
            );
          }
        });

      await Promise.allSettled(updatePromises);
    } catch (error) {
      console.error("Error synchronizing cross-tab state:", error);
    }
  }

  /**
   * Handle tab conflicts when multiple tabs try to record simultaneously
   */
  private async handleTabRecordingConflict(
    requestingTabId: number,
    conflictingTabIds: number[]
  ): Promise<{ resolution: string; stoppedTabs: number[] }> {
    try {
      console.log(
        `Handling recording conflict: tab ${requestingTabId} vs tabs ${conflictingTabIds.join(
          ", "
        )}`
      );

      // For now, we allow concurrent recordings but track them
      // In the future, this could implement different conflict resolution strategies:
      // 1. Stop other recordings
      // 2. Prevent new recording
      // 3. Ask user for preference

      return {
        resolution: "allow_concurrent",
        stoppedTabs: [],
      };
    } catch (error) {
      console.error("Error handling tab recording conflict:", error);
      return {
        resolution: "error",
        stoppedTabs: [],
      };
    }
  }

  /**
   * Monitor tab focus changes and handle recording priorities
   */
  private setupTabFocusMonitoring(): void {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        const { tabId } = activeInfo;
        const tab = await chrome.tabs.get(tabId);

        // If user switches to a non-ShaderToy tab while recording,
        // we could pause or warn, but for now just log
        const activeRecordings = this.getActiveRecordings();
        if (
          activeRecordings.length > 0 &&
          tab.url &&
          !tab.url.includes("shadertoy.com")
        ) {
          console.log(
            `User switched to non-ShaderToy tab while ${activeRecordings.length} recordings are active`
          );
        }
      } catch (error) {
        console.error("Error monitoring tab focus:", error);
      }
    });

    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus - could implement pause functionality here
        const activeRecordings = this.getActiveRecordings();
        if (activeRecordings.length > 0) {
          console.log(
            `Browser lost focus with ${activeRecordings.length} active recordings`
          );
        }
      }
    });
  }

  /**
   * Handle tab duplication scenarios
   */
  private async handleTabDuplicated(
    originalTabId: number,
    newTabId: number
  ): Promise<void> {
    try {
      // If original tab was recording, we need to decide what to do with the duplicate
      const originalSession = this.recordingSessions.get(originalTabId);

      if (originalSession && originalSession.isActive) {
        console.log(
          `Tab ${originalTabId} was duplicated to ${newTabId} while recording`
        );

        // For now, we'll keep the original recording active
        // The new tab will need to start its own recording if desired

        // We could implement logic to transfer the recording to the new tab
        // or stop the original recording, depending on requirements
      }
    } catch (error) {
      console.error("Error handling tab duplication:", error);
    }
  }

  /**
   * Enhanced cleanup for extension disable with cross-tab notification
   */
  private async handleExtensionDisableEnhanced(): Promise<void> {
    try {
      console.log(
        "Extension being disabled, performing enhanced cleanup with cross-tab notification"
      );
      this.extensionEnabled = false;

      // Get all active recordings before cleanup
      const activeRecordings = this.getActiveRecordings();
      console.log(
        `Stopping ${activeRecordings.length} active recordings gracefully`
      );

      // Notify all ShaderToy tabs about extension disable
      await this.notifyAllTabsExtensionDisabling(activeRecordings);

      // Stop all recordings gracefully with timeout protection
      const stopPromises = activeRecordings.map(async (session) => {
        try {
          await Promise.race([
            this.stopRecordingGracefully(session.tabId, "extension_disable"),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Stop recording timeout")),
                5000
              )
            ),
          ]);
        } catch (error) {
          console.error(
            `Failed to gracefully stop recording for tab ${session.tabId}:`,
            error
          );

          // Force cleanup if graceful stop fails
          this.recordingSessions.delete(session.tabId);
        }
      });

      await Promise.allSettled(stopPromises);

      // Clear all sessions
      this.recordingSessions.clear();

      // Clean up offscreen document with timeout
      if (this.isOffscreenDocumentCreated) {
        try {
          await Promise.race([
            chrome.offscreen.closeDocument(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Close document timeout")),
                3000
              )
            ),
          ]);
        } catch (error) {
          console.error("Error closing offscreen document:", error);
        } finally {
          this.isOffscreenDocumentCreated = false;
        }
      }

      // Save cleanup state to storage for recovery
      await chrome.storage.local.set({
        lastCleanupTime: Date.now(),
        cleanupReason: "extension_disable",
        stoppedRecordings: activeRecordings.map((session) => ({
          tabId: session.tabId,
          url: session.url,
          duration: Date.now() - session.startTime,
        })),
      });

      console.log("Enhanced cleanup with cross-tab notification completed");
    } catch (error) {
      console.error("Error during enhanced extension disable:", error);
    }
  }

  /**
   * Notify all ShaderToy tabs that the extension is being disabled
   */
  private async notifyAllTabsExtensionDisabling(
    activeRecordings: RecordingSession[]
  ): Promise<void> {
    try {
      // Get all ShaderToy tabs
      const allTabs = await chrome.tabs.query({
        url: "*://www.shadertoy.com/*",
      });

      console.log(
        `Notifying ${allTabs.length} ShaderToy tabs about extension disable`
      );

      // Send notification to all tabs
      const notificationPromises = allTabs
        .filter((tab) => tab.id)
        .map(async (tab) => {
          try {
            await chrome.tabs.sendMessage(tab.id!, {
              type: "extension-disabling",
              activeRecordings: activeRecordings.map((session) => ({
                tabId: session.tabId,
                url: session.url,
                duration: Date.now() - session.startTime,
                isThisTab: session.tabId === tab.id,
              })),
              timestamp: Date.now(),
            });
          } catch (error) {
            // Tab might not have content script loaded or be responsive
            console.log(
              `Could not notify tab ${tab.id} about extension disable:`,
              error
            );
          }
        });

      // Wait for all notifications to complete or timeout
      await Promise.race([
        Promise.allSettled(notificationPromises),
        new Promise((resolve) => setTimeout(resolve, 2000)), // 2 second timeout
      ]);

      console.log("Tab notifications completed");
    } catch (error) {
      console.error("Error notifying tabs about extension disable:", error);
    }
  }

  /**
   * Recovery mechanism for when extension restarts after unexpected shutdown
   */
  private async handleExtensionRecovery(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        "lastCleanupTime",
        "cleanupReason",
      ]);

      if (result.lastCleanupTime) {
        const timeSinceCleanup = Date.now() - result.lastCleanupTime;

        // If cleanup was recent (within 1 minute), we likely had an unexpected shutdown
        if (timeSinceCleanup < 60000) {
          console.log(
            `Extension recovered after ${timeSinceCleanup}ms, reason: ${result.cleanupReason}`
          );

          // Clear any stale state
          this.recordingSessions.clear();
          this.isOffscreenDocumentCreated = false;

          // Check for any orphaned offscreen documents
          try {
            const hasDocument = await chrome.offscreen.hasDocument();
            if (hasDocument) {
              await chrome.offscreen.closeDocument();
              console.log("Cleaned up orphaned offscreen document");
            }
          } catch (error) {
            console.error(
              "Error checking for orphaned offscreen document:",
              error
            );
          }
        }
      }
    } catch (error) {
      console.error("Error during extension recovery:", error);
    }
  }
}

// Initialize the background service
const backgroundService = new BackgroundService();

// Handle service worker termination
self.addEventListener("beforeunload", () => {
  backgroundService.cleanup();
});
