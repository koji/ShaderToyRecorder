import { describe, it, expect, beforeEach, vi } from "vitest";
import ErrorHandlingService, {
  errorHandlingService,
} from "../ErrorHandlingService";
import { RecordingError, RecordingException } from "../../types/errors";

describe("ErrorHandlingService", () => {
  let service: ErrorHandlingService;

  beforeEach(() => {
    service = new ErrorHandlingService();
    vi.clearAllMocks();
  });

  describe("error classification", () => {
    it("classifies permission errors correctly", () => {
      const permissionError = new Error("Permission denied");
      const result = service.handleError(permissionError);

      expect(result.code).toBe(RecordingError.PERMISSION_DENIED);
    });

    it("classifies audio permission errors specifically", () => {
      const audioError = new Error("Audio permission denied");
      const result = service.handleError(audioError);

      expect(result.code).toBe(RecordingError.AUDIO_PERMISSION_DENIED);
    });

    it("classifies canvas errors correctly", () => {
      const canvasError = new Error("Canvas element not found");
      const result = service.handleError(canvasError);

      expect(result.code).toBe(RecordingError.CANVAS_NOT_FOUND);
    });

    it("classifies tab capture errors correctly", () => {
      const tabError = new Error("Tab capture failed");
      const result = service.handleError(tabError);

      expect(result.code).toBe(RecordingError.TAB_CAPTURE_FAILED);
    });

    it("classifies MediaRecorder errors correctly", () => {
      const mediaError = new Error("MediaRecorder initialization failed");
      const result = service.handleError(mediaError);

      expect(result.code).toBe(RecordingError.MEDIA_RECORDER_ERROR);
    });

    it("classifies stream errors correctly", () => {
      const streamError = new Error("Stream combination failed");
      const result = service.handleError(streamError);

      expect(result.code).toBe(RecordingError.STREAM_COMBINATION_FAILED);
    });

    it("classifies file generation errors correctly", () => {
      const fileError = new Error("Blob generation failed");
      const result = service.handleError(fileError);

      expect(result.code).toBe(RecordingError.FILE_GENERATION_FAILED);
    });

    it("classifies browser support errors correctly", () => {
      const supportError = new Error("Feature not supported");
      const result = service.handleError(supportError);

      expect(result.code).toBe(RecordingError.UNSUPPORTED_BROWSER);
    });

    it("classifies audio availability errors correctly", () => {
      const audioError = new Error("Audio device not available");
      const result = service.handleError(audioError);

      expect(result.code).toBe(RecordingError.AUDIO_NOT_AVAILABLE);
    });

    it("classifies tab not found errors correctly", () => {
      const tabError = new Error("Tab not found");
      const result = service.handleError(tabError);

      expect(result.code).toBe(RecordingError.TAB_NOT_FOUND);
    });

    it("defaults to generic recording failure for unknown errors", () => {
      const unknownError = new Error("Some unknown error");
      const result = service.handleError(unknownError);

      expect(result.code).toBe(RecordingError.RECORDING_FAILED);
    });
  });

  describe("error handling", () => {
    it("handles RecordingException correctly", () => {
      const exception = new RecordingException(
        RecordingError.CANVAS_NOT_FOUND,
        "Canvas not found",
        new Error("Original error"),
        { test: "context" }
      );

      const result = service.handleError(exception);

      expect(result.code).toBe(RecordingError.CANVAS_NOT_FOUND);
      expect(result.message).toBe("Canvas not found");
      expect(result.originalError).toBe(exception);
      expect(result.context).toEqual({ test: "context" });
    });

    it("handles string errors", () => {
      const result = service.handleError("String error message");

      expect(result.code).toBe(RecordingError.RECORDING_FAILED);
      expect(result.message).toBe("String error message");
      expect(result.originalError).toBeUndefined();
    });

    it("includes context in error details", () => {
      const error = new Error("Test error");
      const context = { operation: "test", tabId: 123 };

      const result = service.handleError(error, context);

      expect(result.context).toEqual(context);
    });

    it("adds timestamp to error details", () => {
      const error = new Error("Test error");
      const before = Date.now();

      const result = service.handleError(error);

      const after = Date.now();
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("error listeners", () => {
    it("notifies listeners when error occurs", () => {
      const listener = vi.fn();
      service.addErrorListener(listener);

      const error = new Error("Test error");
      service.handleError(error);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          code: RecordingError.RECORDING_FAILED,
          message: "Test error",
        })
      );
    });

    it("supports multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      service.addErrorListener(listener1);
      service.addErrorListener(listener2);

      const error = new Error("Test error");
      service.handleError(error);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("returns unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = service.addErrorListener(listener);

      // Unsubscribe
      unsubscribe();

      const error = new Error("Test error");
      service.handleError(error);

      expect(listener).not.toHaveBeenCalled();
    });

    it("handles listener errors gracefully", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error("Listener error");
      });

      service.addErrorListener(faultyListener);

      const error = new Error("Test error");
      expect(() => service.handleError(error)).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error in error listener:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("error history", () => {
    it("maintains error history", () => {
      const error1 = new Error("First error");
      const error2 = new Error("Second error");

      service.handleError(error1);
      service.handleError(error2);

      const history = service.getErrorHistory();
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe("Second error"); // Most recent first
      expect(history[1].message).toBe("First error");
    });

    it("limits history size", () => {
      // Create service with small history limit for testing
      const testService = new (class extends ErrorHandlingService {
        constructor() {
          super();
          (this as any).maxHistorySize = 2;
        }
      })();

      testService.handleError(new Error("Error 1"));
      testService.handleError(new Error("Error 2"));
      testService.handleError(new Error("Error 3"));

      const history = testService.getErrorHistory();
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe("Error 3");
      expect(history[1].message).toBe("Error 2");
    });

    it("clears error history", () => {
      service.handleError(new Error("Test error"));
      expect(service.getErrorHistory()).toHaveLength(1);

      service.clearErrorHistory();
      expect(service.getErrorHistory()).toHaveLength(0);
    });
  });

  describe("user-friendly messages", () => {
    it("provides appropriate messages for each error type", () => {
      const testCases = [
        {
          code: RecordingError.CANVAS_NOT_FOUND,
          expectedText: "Could not find the ShaderToy canvas",
        },
        {
          code: RecordingError.AUDIO_PERMISSION_DENIED,
          expectedText: "Audio recording permission was denied",
        },
        {
          code: RecordingError.TAB_CAPTURE_FAILED,
          expectedText: "Failed to capture audio from the current tab",
        },
        {
          code: RecordingError.UNSUPPORTED_BROWSER,
          expectedText: "Your browser doesn't support video recording",
        },
      ];

      testCases.forEach(({ code, expectedText }) => {
        const errorDetails = {
          code,
          message: "Original message",
          timestamp: Date.now(),
        };

        const userMessage = service.getUserFriendlyMessage(errorDetails);
        expect(userMessage).toContain(expectedText);
      });
    });

    it("falls back to original message for unknown errors", () => {
      const errorDetails = {
        code: "UNKNOWN_ERROR" as RecordingError,
        message: "Original error message",
        timestamp: Date.now(),
      };

      const userMessage = service.getUserFriendlyMessage(errorDetails);
      expect(userMessage).toBe("Original error message");
    });
  });

  describe("error recovery", () => {
    it("identifies recoverable errors", () => {
      const recoverableErrors = [
        RecordingError.RECORDING_FAILED,
        RecordingError.CANVAS_NOT_FOUND,
        RecordingError.TAB_CAPTURE_FAILED,
        RecordingError.STREAM_COMBINATION_FAILED,
      ];

      recoverableErrors.forEach((code) => {
        const errorDetails = { code, message: "Test", timestamp: Date.now() };
        expect(service.isRecoverable(errorDetails)).toBe(true);
      });
    });

    it("identifies non-recoverable errors", () => {
      const nonRecoverableErrors = [
        RecordingError.UNSUPPORTED_BROWSER,
        RecordingError.PERMISSION_DENIED,
        RecordingError.AUDIO_PERMISSION_DENIED,
      ];

      nonRecoverableErrors.forEach((code) => {
        const errorDetails = { code, message: "Test", timestamp: Date.now() };
        expect(service.isRecoverable(errorDetails)).toBe(false);
      });
    });

    it("identifies errors that allow graceful degradation", () => {
      const degradableErrors = [
        RecordingError.AUDIO_NOT_AVAILABLE,
        RecordingError.TAB_CAPTURE_FAILED,
        RecordingError.STREAM_COMBINATION_FAILED,
      ];

      degradableErrors.forEach((code) => {
        const errorDetails = { code, message: "Test", timestamp: Date.now() };
        expect(service.allowsGracefulDegradation(errorDetails)).toBe(true);
      });
    });
  });

  describe("suggested actions", () => {
    it("provides relevant suggestions for each error type", () => {
      const testCases = [
        {
          code: RecordingError.CANVAS_NOT_FOUND,
          expectedSuggestion: "Refresh the ShaderToy page",
        },
        {
          code: RecordingError.AUDIO_PERMISSION_DENIED,
          expectedSuggestion: "Click the microphone icon in the address bar",
        },
        {
          code: RecordingError.PERMISSION_DENIED,
          expectedSuggestion: "Go to Chrome Extensions settings",
        },
      ];

      testCases.forEach(({ code, expectedSuggestion }) => {
        const errorDetails = { code, message: "Test", timestamp: Date.now() };
        const suggestions = service.getSuggestedActions(errorDetails);

        expect(suggestions).toContain(expectedSuggestion);
      });
    });

    it("provides default suggestions for unknown errors", () => {
      const errorDetails = {
        code: "UNKNOWN_ERROR" as RecordingError,
        message: "Test",
        timestamp: Date.now(),
      };

      const suggestions = service.getSuggestedActions(errorDetails);
      expect(suggestions).toContain("Refresh the page and try again");
    });
  });

  describe("function wrapping", () => {
    it("wraps async functions with error handling", async () => {
      const asyncFn = vi.fn().mockRejectedValue(new Error("Async error"));
      const wrappedFn = service.wrapAsync(asyncFn, { operation: "test" });

      await expect(wrappedFn()).rejects.toThrow(RecordingException);
      expect(asyncFn).toHaveBeenCalled();
    });

    it("wraps sync functions with error handling", () => {
      const syncFn = vi.fn().mockImplementation(() => {
        throw new Error("Sync error");
      });
      const wrappedFn = service.wrapSync(syncFn, { operation: "test" });

      expect(() => wrappedFn()).toThrow(RecordingException);
      expect(syncFn).toHaveBeenCalled();
    });

    it("passes through successful function calls", async () => {
      const asyncFn = vi.fn().mockResolvedValue("success");
      const wrappedFn = service.wrapAsync(asyncFn);

      const result = await wrappedFn();
      expect(result).toBe("success");
    });
  });

  describe("createError", () => {
    it("creates RecordingException with correct properties", () => {
      const originalError = new Error("Original");
      const context = { test: "context" };

      const exception = service.createError(
        RecordingError.CANVAS_NOT_FOUND,
        "Canvas error",
        originalError,
        context
      );

      expect(exception).toBeInstanceOf(RecordingException);
      expect(exception.code).toBe(RecordingError.CANVAS_NOT_FOUND);
      expect(exception.message).toBe("Canvas error");
      expect(exception.context).toBe(context);
    });
  });

  describe("singleton instance", () => {
    it("exports a singleton instance", () => {
      expect(errorHandlingService).toBeInstanceOf(ErrorHandlingService);
    });
  });
});
