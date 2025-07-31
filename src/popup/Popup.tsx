import React, { useState, useEffect, useCallback, useRef } from "react";
import RecordingButton from "../components/RecordingButton";
import StatusIndicator from "../components/StatusIndicator";
import AudioVisualizer from "../components/AudioVisualizer";
import ErrorBoundary from "../components/ErrorBoundary";
import { mediaRecorderService } from "../services/MediaRecorderService";
import { chromeAPIService } from "../services/ChromeAPIService";
import { errorHandlingService } from "../services/ErrorHandlingService";
import { RecordingState } from "../types/recording";
import { PopupProps } from "../types/components";
import { RecordingError, RecordingErrorDetails } from "../types/errors";
import "./popup.css";
import "../components/ErrorBoundary.css";

const Popup: React.FC<PopupProps> = ({
  initialState,
  onStateChange,
  className = "",
}) => {
  // Recording state management
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    startTime: null,
    duration: 0,
    videoStatus: "inactive",
    audioStatus: "inactive",
    error: null,
    ...initialState,
  });

  // Stream references
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Component state
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [lastError, setLastError] = useState<RecordingErrorDetails | null>(
    null
  );
  const [retryCount, setRetryCount] = useState(0);

  // Initialize component
  useEffect(() => {
    initializePopup();

    // Set up global error handling
    const unsubscribe =
      errorHandlingService.addErrorListener(handleGlobalError);

    return () => {
      cleanup();
      unsubscribe();
    };
  }, []);

  // Notify parent of state changes
  useEffect(() => {
    onStateChange?.(recordingState);
  }, [recordingState, onStateChange]);

  // Duration timer effect
  useEffect(() => {
    if (recordingState.isRecording && recordingState.startTime) {
      durationIntervalRef.current = setInterval(() => {
        const duration = Math.floor(
          (Date.now() - recordingState.startTime!) / 1000
        );
        updateRecordingState({ duration });
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [recordingState.isRecording, recordingState.startTime]);

  /**
   * Initialize popup component
   */
  const initializePopup = async () => {
    try {
      // Check if recording is supported
      const supported = mediaRecorderService.isRecordingSupported();
      setIsSupported(supported);

      if (!supported) {
        updateRecordingState({
          error: "Recording is not supported in this browser",
        });
        return;
      }

      // Get current tab
      const tab = await chromeAPIService.getCurrentTab();
      setCurrentTab(tab);

      // Check if it's a ShaderToy tab
      if (!chromeAPIService.isShaderToyTab(tab)) {
        updateRecordingState({
          error: "Please navigate to a ShaderToy page to start recording",
        });
        return;
      }

      // Check permissions
      const hasPermissions = await chromeAPIService.checkPermissions();
      if (!hasPermissions) {
        updateRecordingState({
          error:
            "Required permissions not granted. Please check extension permissions.",
        });
        return;
      }

      // Check canvas availability
      await checkCanvasAvailability();
    } catch (error) {
      const handledError = errorHandlingService.handleError(error as Error, {
        operation: "popup_initialization",
        tab: currentTab?.id,
      });

      // Error is already handled by the global error listener
      console.error("Failed to initialize popup:", handledError);
    }
  };

  /**
   * Update recording state
   */
  const updateRecordingState = useCallback(
    (updates: Partial<RecordingState>) => {
      setRecordingState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  /**
   * Handle global errors from error handling service
   */
  const handleGlobalError = useCallback(
    (error: RecordingErrorDetails) => {
      setLastError(error);

      // Update recording state with user-friendly message
      const userMessage = errorHandlingService.getUserFriendlyMessage(error);
      updateRecordingState({ error: userMessage });

      // Handle graceful degradation for audio errors
      if (errorHandlingService.allowsGracefulDegradation(error)) {
        handleGracefulDegradation(error);
      }
    },
    [updateRecordingState]
  );

  /**
   * Handle graceful degradation for recoverable errors
   */
  const handleGracefulDegradation = useCallback(
    (error: RecordingErrorDetails) => {
      switch (error.code) {
        case RecordingError.AUDIO_NOT_AVAILABLE:
        case RecordingError.TAB_CAPTURE_FAILED:
        case RecordingError.AUDIO_PERMISSION_DENIED:
          // Continue with video-only recording
          updateRecordingState({
            audioStatus: "error",
            error: "Audio capture failed - continuing with video only",
          });
          break;

        case RecordingError.STREAM_COMBINATION_FAILED:
          // Try to continue with separate streams
          console.warn("Stream combination failed, attempting fallback");
          break;

        default:
          break;
      }
    },
    [updateRecordingState]
  );

  /**
   * Retry failed operation
   */
  const handleRetry = useCallback(async () => {
    if (!lastError || !errorHandlingService.isRecoverable(lastError)) {
      return;
    }

    const maxRetries = 3;
    if (retryCount >= maxRetries) {
      updateRecordingState({
        error: "Maximum retry attempts reached. Please refresh the page.",
      });
      return;
    }

    setRetryCount((prev) => prev + 1);
    setLastError(null);
    updateRecordingState({ error: null });

    // Retry based on error type
    try {
      switch (lastError.code) {
        case RecordingError.CANVAS_NOT_FOUND:
          await checkCanvasAvailability();
          break;

        case RecordingError.TAB_CAPTURE_FAILED:
          if (currentTab?.id) {
            await chromeAPIService.captureTabAudio(currentTab.id);
          }
          break;

        case RecordingError.RECORDING_FAILED:
          await initializePopup();
          break;

        default:
          await initializePopup();
          break;
      }
    } catch (error) {
      errorHandlingService.handleError(error as Error, {
        retryAttempt: retryCount + 1,
        originalError: lastError.code,
      });
    }
  }, [lastError, retryCount, currentTab, updateRecordingState]);

  /**
   * Reset error state
   */
  const handleErrorReset = useCallback(() => {
    setLastError(null);
    setRetryCount(0);
    updateRecordingState({ error: null });
  }, [updateRecordingState]);

  /**
   * Start recording process
   */
  const startRecording = async (): Promise<void> => {
    if (!currentTab?.id) {
      throw new Error("No active tab found");
    }

    setIsLoading(true);
    updateRecordingState({ error: null });

    try {
      // Inject content script to capture canvas
      await chromeAPIService.injectContentScript(currentTab.id);

      // Get video stream from content script
      const videoStream = await getVideoStreamFromContentScript();
      videoStreamRef.current = videoStream;
      updateRecordingState({ videoStatus: "active" });

      // Try to capture audio with graceful degradation
      let audioStream: MediaStream | null = null;
      try {
        audioStream = await chromeAPIService.captureTabAudio(currentTab.id);
        audioStreamRef.current = audioStream;
        updateRecordingState({ audioStatus: "active" });
      } catch (audioError) {
        // Handle audio capture failure with graceful degradation
        const fallbackInfo = mediaRecorderService.handleAudioStreamFailure(
          audioError as Error,
          {
            operation: "audio_capture",
            tabId: currentTab.id,
          }
        );

        console.warn("Audio capture failed:", {
          error: audioError,
          fallback: fallbackInfo,
        });

        // Update UI with fallback message
        updateRecordingState({
          audioStatus: "error",
          error: fallbackInfo.fallbackMessage,
        });

        // If we shouldn't continue, throw the error
        if (!fallbackInfo.shouldContinue) {
          throw errorHandlingService.createError(
            fallbackInfo.errorCode,
            fallbackInfo.fallbackMessage,
            audioError as Error,
            { tabId: currentTab.id }
          );
        }
      }

      // Start recording with graceful degradation
      const recordingResult =
        await mediaRecorderService.startRecordingWithGracefulDegradation({
          videoStream,
          audioStream: audioStream || undefined,
          videoBitsPerSecond: 2500000, // 2.5 Mbps
        });

      // Create degradation notification
      const notification = mediaRecorderService.createDegradationNotification(
        recordingResult.hasAudio,
        recordingResult.hasVideo,
        recordingResult.degradationReason
      );

      // Update state based on recording result
      updateRecordingState({
        isRecording: true,
        startTime: Date.now(),
        duration: 0,
        audioStatus: recordingResult.hasAudio ? "active" : "error",
        videoStatus: recordingResult.hasVideo ? "active" : "error",
        error: notification.type === "warning" ? notification.message : null,
      });

      // Log degradation info
      if (recordingResult.degradationReason) {
        console.warn("Recording started with degradation:", {
          reason: recordingResult.degradationReason,
          hasAudio: recordingResult.hasAudio,
          hasVideo: recordingResult.hasVideo,
        });
      }
    } catch (error) {
      const handledError = errorHandlingService.handleError(error as Error, {
        operation: "start_recording",
        tab: currentTab?.id,
        hasVideo: !!videoStreamRef.current,
        hasAudio: !!audioStreamRef.current,
      });

      // Clean up streams on error
      cleanupStreams();

      updateRecordingState({
        videoStatus: "error",
        audioStatus: "error",
      });

      throw handledError;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Stop recording process
   */
  const stopRecording = async (): Promise<void> => {
    if (!recordingState.isRecording) {
      return;
    }

    setIsLoading(true);

    try {
      // Stop the MediaRecorder
      const recordingResult = await mediaRecorderService.getRecordingResult();

      // Stop canvas capture in content script
      await stopCanvasCapture();

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `shadertoy-recording-${timestamp}.webm`;

      // Download the file
      await downloadRecording(recordingResult.blob, filename);

      // Update state
      updateRecordingState({
        isRecording: false,
        startTime: null,
        videoStatus: "inactive",
        audioStatus: "inactive",
        error: null,
      });

      console.log(`Recording completed: ${filename}`);
    } catch (error) {
      const handledError = errorHandlingService.handleError(error as Error, {
        operation: "stop_recording",
        tab: currentTab?.id,
        duration: recordingState.duration,
      });

      throw handledError;
    } finally {
      // Clean up streams and state
      cleanupStreams();
      setIsLoading(false);
    }
  };

  /**
   * Stop canvas capture in content script
   */
  const stopCanvasCapture = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!currentTab?.id) {
        resolve(); // No tab to stop capture in
        return;
      }

      chrome.tabs.sendMessage(
        currentTab.id,
        { type: "stop-canvas-capture" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "Failed to stop canvas capture:",
              chrome.runtime.lastError.message
            );
            resolve(); // Don't fail the whole stop process
            return;
          }

          if (response && !response.success) {
            console.warn("Canvas capture stop failed:", response.message);
          }

          resolve();
        }
      );
    });
  };

  /**
   * Get video stream from content script
   */
  const getVideoStreamFromContentScript = (): Promise<MediaStream> => {
    return new Promise((resolve, reject) => {
      if (!currentTab?.id) {
        reject(new Error("No active tab"));
        return;
      }

      // Send message to content script to start canvas capture
      chrome.tabs.sendMessage(
        currentTab.id,
        {
          type: "start-canvas-capture",
          options: { frameRate: 60 },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            reject(new Error("No response from content script"));
            return;
          }

          if (!response.success) {
            const errorMessage = response.message || "Canvas capture failed";
            reject(new Error(errorMessage));
            return;
          }

          if (response.stream) {
            resolve(response.stream);
          } else {
            reject(new Error("No video stream received from content script"));
          }
        }
      );
    });
  };

  /**
   * Download recording blob as file
   */
  const downloadRecording = async (
    blob: Blob,
    filename: string
  ): Promise<void> => {
    const url = URL.createObjectURL(blob);

    // Create download link
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * Clean up streams and resources
   */
  const cleanupStreams = () => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
  };

  /**
   * Clean up component resources
   */
  const cleanup = () => {
    cleanupStreams();
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
  };

  /**
   * Reset recording state
   */
  const resetState = () => {
    cleanupStreams();
    updateRecordingState({
      isRecording: false,
      startTime: null,
      duration: 0,
      videoStatus: "inactive",
      audioStatus: "inactive",
      error: null,
    });
  };

  /**
   * Check if canvas is available for capture
   */
  const checkCanvasAvailability = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!currentTab?.id) {
        reject(new Error("No active tab"));
        return;
      }

      // Inject content script first
      chromeAPIService
        .injectContentScript(currentTab.id)
        .then(() => {
          // Check canvas status
          chrome.tabs.sendMessage(
            currentTab.id!,
            { type: "get-canvas-status" },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }

              if (!response) {
                reject(new Error("No response from content script"));
                return;
              }

              if (!response.success) {
                reject(new Error(response.message || "Canvas check failed"));
                return;
              }

              if (!response.canvasInfo?.found) {
                updateRecordingState({
                  error:
                    "No ShaderToy canvas found on this page. Make sure the shader is loaded.",
                });
              }

              resolve();
            }
          );
        })
        .catch((error) => {
          console.warn(
            "Failed to inject content script for canvas check:",
            error
          );
          // Don't fail initialization, just warn
          resolve();
        });
    });
  };

  // Determine if recording can be started
  const canStartRecording =
    isSupported &&
    !recordingState.isRecording &&
    !isLoading &&
    currentTab &&
    chromeAPIService.isShaderToyTab(currentTab) &&
    !recordingState.error?.includes("permissions");

  return (
    <ErrorBoundary
      onError={handleGlobalError}
      maxRetries={3}
      className="popup-error-boundary"
    >
      <div className={`popup ${className}`.trim()} data-testid="popup">
        {/* Header */}
        <div className="popup__header">
          <h1 className="popup__title">ShaderToy Recorder</h1>
          <p className="popup__subtitle">Audio-Video Recording Extension</p>
        </div>

        {/* Main Content */}
        <div className="popup__content">
          {/* Enhanced Error Display */}
          {(recordingState.error || lastError) && (
            <div className="popup__error-section">
              <div
                className="popup__error"
                data-testid="popup-error"
                role="alert"
              >
                <span className="popup__error-icon">⚠️</span>
                <span className="popup__error-text">
                  {recordingState.error ||
                    (lastError &&
                      errorHandlingService.getUserFriendlyMessage(lastError))}
                </span>
              </div>

              {/* Error Actions */}
              {lastError && (
                <div className="popup__error-actions">
                  {errorHandlingService.isRecoverable(lastError) &&
                    retryCount < 3 && (
                      <button
                        type="button"
                        className="popup__retry-button"
                        onClick={handleRetry}
                        disabled={isLoading}
                        data-testid="retry-button"
                      >
                        Retry ({3 - retryCount} attempts left)
                      </button>
                    )}
                  <button
                    type="button"
                    className="popup__error-reset-button"
                    onClick={handleErrorReset}
                    data-testid="error-reset-button"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Suggested Actions */}
              {lastError && (
                <details className="popup__error-suggestions">
                  <summary>Suggested Actions</summary>
                  <ul className="popup__suggestions-list">
                    {errorHandlingService
                      .getSuggestedActions(lastError)
                      .map((action, index) => (
                        <li key={index}>{action}</li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Unsupported Browser */}
          {!isSupported && !recordingState.error && (
            <div className="popup__unsupported" data-testid="popup-unsupported">
              <span className="popup__unsupported-icon">❌</span>
              <span className="popup__unsupported-text">
                Recording is not supported in this browser
              </span>
            </div>
          )}

          {/* Recording Controls */}
          {isSupported && (
            <>
              {/* Status Indicator */}
              <StatusIndicator
                videoStatus={recordingState.videoStatus}
                audioStatus={recordingState.audioStatus}
                duration={recordingState.duration}
                className="popup__status"
              />

              {/* Audio Visualizer */}
              <AudioVisualizer
                audioStream={audioStreamRef.current}
                isActive={recordingState.audioStatus === "active"}
                className="popup__visualizer"
              />

              {/* Recording Button */}
              <RecordingButton
                isRecording={recordingState.isRecording}
                onStartRecording={startRecording}
                onStopRecording={stopRecording}
                disabled={!canStartRecording}
                loading={isLoading}
                className="popup__recording-button"
              />

              {/* Tab Info */}
              {currentTab && (
                <div className="popup__tab-info" data-testid="tab-info">
                  <span className="popup__tab-label">Current Tab:</span>
                  <span className="popup__tab-title">
                    {chromeAPIService.isShaderToyTab(currentTab)
                      ? "✅ ShaderToy"
                      : "❌ Not ShaderToy"}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="popup__footer">
          <button
            className="popup__reset-button"
            onClick={resetState}
            disabled={recordingState.isRecording || isLoading}
            data-testid="reset-button"
          >
            Reset
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default Popup;
