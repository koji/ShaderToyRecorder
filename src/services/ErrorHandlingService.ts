import {
  RecordingError,
  RecordingErrorDetails,
  RecordingException,
} from "../types/errors";

/**
 * Centralized error handling service for the extension
 * Provides error classification, user-friendly messages, and retry logic
 */
class ErrorHandlingService {
  private errorListeners: Array<(error: RecordingErrorDetails) => void> = [];
  private errorHistory: RecordingErrorDetails[] = [];
  private maxHistorySize = 50;

  /**
   * Add error listener for global error handling
   */
  addErrorListener(
    listener: (error: RecordingErrorDetails) => void
  ): () => void {
    this.errorListeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  /**
   * Handle and classify errors
   */
  handleError(
    error: Error | RecordingException | string,
    context?: Record<string, unknown>
  ): RecordingErrorDetails {
    let errorDetails: RecordingErrorDetails;

    if (error instanceof RecordingException) {
      errorDetails = {
        code: error.code,
        message: error.message,
        originalError: error,
        timestamp: error.timestamp,
        context: { ...error.context, ...context },
      };
    } else if (error instanceof Error) {
      errorDetails = {
        code: this.classifyError(error),
        message: error.message,
        originalError: error,
        timestamp: Date.now(),
        context,
      };
    } else {
      errorDetails = {
        code: RecordingError.RECORDING_FAILED,
        message: typeof error === "string" ? error : "Unknown error occurred",
        timestamp: Date.now(),
        context,
      };
    }

    // Add to history
    this.addToHistory(errorDetails);

    // Notify listeners
    this.notifyListeners(errorDetails);

    // Log for debugging
    console.error("ErrorHandlingService:", errorDetails);

    return errorDetails;
  }

  /**
   * Create a RecordingException with proper classification
   */
  createError(
    code: RecordingError,
    message: string,
    originalError?: Error,
    context?: Record<string, unknown>
  ): RecordingException {
    return new RecordingException(code, message, originalError, context);
  }

  /**
   * Classify generic errors into specific RecordingError codes
   */
  private classifyError(error: Error): RecordingError {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || "";

    // Permission-related errors
    if (message.includes("permission") || message.includes("denied")) {
      if (message.includes("audio") || message.includes("microphone")) {
        return RecordingError.AUDIO_PERMISSION_DENIED;
      }
      return RecordingError.PERMISSION_DENIED;
    }

    // Canvas-related errors
    if (message.includes("canvas") || message.includes("element not found")) {
      return RecordingError.CANVAS_NOT_FOUND;
    }

    // Tab-related errors (check specific cases first)
    if (message.includes("tab not found") || message.includes("invalid tab")) {
      return RecordingError.TAB_NOT_FOUND;
    }

    // Tab capture errors
    if (message.includes("tab") || message.includes("capture")) {
      return RecordingError.TAB_CAPTURE_FAILED;
    }

    // MediaRecorder errors
    if (message.includes("mediarecorder") || message.includes("recording")) {
      return RecordingError.MEDIA_RECORDER_ERROR;
    }

    // Stream-related errors
    if (message.includes("stream") || message.includes("track")) {
      return RecordingError.STREAM_COMBINATION_FAILED;
    }

    // File generation errors
    if (
      message.includes("blob") ||
      message.includes("file") ||
      message.includes("download")
    ) {
      return RecordingError.FILE_GENERATION_FAILED;
    }

    // Browser support errors
    if (message.includes("not supported") || message.includes("unsupported")) {
      return RecordingError.UNSUPPORTED_BROWSER;
    }

    // Audio-specific errors
    if (message.includes("audio") && !message.includes("permission")) {
      return RecordingError.AUDIO_NOT_AVAILABLE;
    }

    // Default to generic recording failure
    return RecordingError.RECORDING_FAILED;
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(error: RecordingErrorDetails): string {
    switch (error.code) {
      case RecordingError.CANVAS_NOT_FOUND:
        return "Could not find the ShaderToy canvas. Please make sure the shader is loaded and try again.";

      case RecordingError.AUDIO_PERMISSION_DENIED:
        return "Audio recording permission was denied. Please allow microphone access in your browser settings and try again.";

      case RecordingError.TAB_CAPTURE_FAILED:
        return "Failed to capture audio from the current tab. Recording will continue with video only.";

      case RecordingError.UNSUPPORTED_BROWSER:
        return "Your browser doesn't support video recording. Please use Chrome 88+ or Firefox 72+.";

      case RecordingError.RECORDING_FAILED:
        return "Recording failed unexpectedly. Please try again.";

      case RecordingError.STREAM_COMBINATION_FAILED:
        return "Failed to combine audio and video streams. Recording may continue with video only.";

      case RecordingError.MEDIA_RECORDER_ERROR:
        return "Media recorder encountered an error. Please check your browser settings and try again.";

      case RecordingError.FILE_GENERATION_FAILED:
        return "Failed to generate the recording file. Please try recording again.";

      case RecordingError.TAB_NOT_FOUND:
        return "Could not access the current tab. Please refresh the page and try again.";

      case RecordingError.INVALID_TAB:
        return "The current tab is not valid for recording. Please navigate to a ShaderToy page.";

      case RecordingError.PERMISSION_DENIED:
        return "Required permissions were denied. Please check extension permissions in Chrome settings.";

      case RecordingError.AUDIO_NOT_AVAILABLE:
        return "Audio capture is not available. Recording will continue with video only.";

      default:
        return (
          error.message || "An unexpected error occurred. Please try again."
        );
    }
  }

  /**
   * Determine if an error is recoverable (can be retried)
   */
  isRecoverable(error: RecordingErrorDetails): boolean {
    const nonRecoverableErrors = [
      RecordingError.UNSUPPORTED_BROWSER,
      RecordingError.PERMISSION_DENIED,
      RecordingError.AUDIO_PERMISSION_DENIED,
    ];

    return !nonRecoverableErrors.includes(error.code);
  }

  /**
   * Determine if an error allows graceful degradation
   */
  allowsGracefulDegradation(error: RecordingErrorDetails): boolean {
    const degradableErrors = [
      RecordingError.AUDIO_NOT_AVAILABLE,
      RecordingError.TAB_CAPTURE_FAILED,
      RecordingError.STREAM_COMBINATION_FAILED,
    ];

    return degradableErrors.includes(error.code);
  }

  /**
   * Get suggested actions for an error
   */
  getSuggestedActions(error: RecordingErrorDetails): string[] {
    switch (error.code) {
      case RecordingError.CANVAS_NOT_FOUND:
        return [
          "Refresh the ShaderToy page",
          "Wait for the shader to fully load",
          "Try a different shader",
        ];

      case RecordingError.AUDIO_PERMISSION_DENIED:
        return [
          "Click the microphone icon in the address bar",
          "Allow audio access for this site",
          "Check browser audio settings",
        ];

      case RecordingError.TAB_CAPTURE_FAILED:
        return [
          "Refresh the page and try again",
          "Check if audio is playing in the tab",
          "Continue with video-only recording",
        ];

      case RecordingError.PERMISSION_DENIED:
        return [
          "Go to Chrome Extensions settings",
          "Enable required permissions for this extension",
          "Refresh the page after enabling permissions",
        ];

      case RecordingError.UNSUPPORTED_BROWSER:
        return [
          "Update your browser to the latest version",
          "Use Chrome 88+ or Firefox 72+",
          "Enable hardware acceleration in browser settings",
        ];

      default:
        return [
          "Refresh the page and try again",
          "Check your internet connection",
          "Restart your browser if the problem persists",
        ];
    }
  }

  /**
   * Get error history
   */
  getErrorHistory(): RecordingErrorDetails[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Add error to history
   */
  private addToHistory(error: RecordingErrorDetails): void {
    this.errorHistory.unshift(error);

    // Limit history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Notify all error listeners
   */
  private notifyListeners(error: RecordingErrorDetails): void {
    this.errorListeners.forEach((listener) => {
      try {
        listener(error);
      } catch (listenerError) {
        console.error("Error in error listener:", listenerError);
      }
    });
  }

  /**
   * Wrap async functions with error handling
   */
  wrapAsync<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    context?: Record<string, unknown>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        const handledError = this.handleError(error as Error, context);
        throw new RecordingException(
          handledError.code,
          handledError.message,
          handledError.originalError,
          handledError.context
        );
      }
    };
  }

  /**
   * Wrap sync functions with error handling
   */
  wrapSync<T extends unknown[], R>(
    fn: (...args: T) => R,
    context?: Record<string, unknown>
  ): (...args: T) => R {
    return (...args: T): R => {
      try {
        return fn(...args);
      } catch (error) {
        const handledError = this.handleError(error as Error, context);
        throw new RecordingException(
          handledError.code,
          handledError.message,
          handledError.originalError,
          handledError.context
        );
      }
    };
  }
}

// Export singleton instance
export const errorHandlingService = new ErrorHandlingService();
export default ErrorHandlingService;
