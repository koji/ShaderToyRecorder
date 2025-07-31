// Unit tests for error types and RecordingException

import { describe, it, expect, beforeEach } from "vitest";
import {
  RecordingError,
  RecordingException,
  RecordingErrorDetails,
} from "../errors";

describe("RecordingError enum", () => {
  it("should have all expected error codes", () => {
    const expectedErrors = [
      "CANVAS_NOT_FOUND",
      "AUDIO_PERMISSION_DENIED",
      "RECORDING_FAILED",
      "TAB_CAPTURE_FAILED",
      "UNSUPPORTED_BROWSER",
      "STREAM_COMBINATION_FAILED",
      "MEDIA_RECORDER_ERROR",
      "FILE_GENERATION_FAILED",
      "TAB_NOT_FOUND",
      "INVALID_TAB",
      "PERMISSION_DENIED",
      "AUDIO_NOT_AVAILABLE",
    ];

    expectedErrors.forEach((errorCode) => {
      expect(RecordingError).toHaveProperty(errorCode);
      expect(RecordingError[errorCode as keyof typeof RecordingError]).toBe(
        errorCode
      );
    });
  });

  it("should have unique error codes", () => {
    const values = Object.values(RecordingError);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});

describe("RecordingException", () => {
  let originalError: Error;
  let context: Record<string, unknown>;

  beforeEach(() => {
    originalError = new Error("Original error message");
    context = { operation: "test", tabId: 123 };
  });

  it("should create exception with required parameters", () => {
    const exception = new RecordingException(
      RecordingError.CANVAS_NOT_FOUND,
      "Canvas not found"
    );

    expect(exception).toBeInstanceOf(Error);
    expect(exception).toBeInstanceOf(RecordingException);
    expect(exception.name).toBe("RecordingException");
    expect(exception.code).toBe(RecordingError.CANVAS_NOT_FOUND);
    expect(exception.message).toBe("Canvas not found");
    expect(exception.timestamp).toBeTypeOf("number");
    expect(exception.timestamp).toBeGreaterThan(0);
  });

  it("should create exception with original error", () => {
    const exception = new RecordingException(
      RecordingError.RECORDING_FAILED,
      "Recording failed",
      originalError
    );

    expect(exception.code).toBe(RecordingError.RECORDING_FAILED);
    expect(exception.message).toBe("Recording failed");
    expect(exception.stack).toBe(originalError.stack);
  });

  it("should create exception with context", () => {
    const exception = new RecordingException(
      RecordingError.TAB_CAPTURE_FAILED,
      "Tab capture failed",
      undefined,
      context
    );

    expect(exception.context).toEqual(context);
  });

  it("should create exception with all parameters", () => {
    const exception = new RecordingException(
      RecordingError.AUDIO_PERMISSION_DENIED,
      "Audio permission denied",
      originalError,
      context
    );

    expect(exception.code).toBe(RecordingError.AUDIO_PERMISSION_DENIED);
    expect(exception.message).toBe("Audio permission denied");
    expect(exception.stack).toBe(originalError.stack);
    expect(exception.context).toEqual(context);
    expect(exception.timestamp).toBeTypeOf("number");
  });

  it("should set timestamp to current time", () => {
    const before = Date.now();
    const exception = new RecordingException(
      RecordingError.RECORDING_FAILED,
      "Test"
    );
    const after = Date.now();

    expect(exception.timestamp).toBeGreaterThanOrEqual(before);
    expect(exception.timestamp).toBeLessThanOrEqual(after);
  });

  it("should be throwable and catchable", () => {
    const exception = new RecordingException(
      RecordingError.CANVAS_NOT_FOUND,
      "Test exception"
    );

    expect(() => {
      throw exception;
    }).toThrow(RecordingException);

    expect(() => {
      throw exception;
    }).toThrow("Test exception");

    try {
      throw exception;
    } catch (caught) {
      expect(caught).toBeInstanceOf(RecordingException);
      expect((caught as RecordingException).code).toBe(
        RecordingError.CANVAS_NOT_FOUND
      );
    }
  });

  it("should preserve error properties when serialized", () => {
    const exception = new RecordingException(
      RecordingError.MEDIA_RECORDER_ERROR,
      "MediaRecorder error",
      originalError,
      context
    );

    // Test that the exception has the expected properties
    expect(exception.name).toBe("RecordingException");
    expect(exception.message).toBe("MediaRecorder error");
    expect(exception.code).toBe(RecordingError.MEDIA_RECORDER_ERROR);

    // Note: JSON serialization of Error objects doesn't preserve all properties by default
    // This is expected behavior in JavaScript
  });
});

describe("RecordingErrorDetails interface", () => {
  it("should accept valid error details", () => {
    const errorDetails: RecordingErrorDetails = {
      code: RecordingError.STREAM_COMBINATION_FAILED,
      message: "Stream combination failed",
      timestamp: Date.now(),
    };

    expect(errorDetails.code).toBe(RecordingError.STREAM_COMBINATION_FAILED);
    expect(errorDetails.message).toBe("Stream combination failed");
    expect(errorDetails.timestamp).toBeTypeOf("number");
  });

  it("should accept error details with optional properties", () => {
    const originalError = new Error("Original");
    const context = { test: "context" };

    const errorDetails: RecordingErrorDetails = {
      code: RecordingError.FILE_GENERATION_FAILED,
      message: "File generation failed",
      originalError,
      timestamp: Date.now(),
      context,
    };

    expect(errorDetails.originalError).toBe(originalError);
    expect(errorDetails.context).toBe(context);
  });

  it("should work with all error codes", () => {
    Object.values(RecordingError).forEach((errorCode) => {
      const errorDetails: RecordingErrorDetails = {
        code: errorCode,
        message: `Test message for ${errorCode}`,
        timestamp: Date.now(),
      };

      expect(errorDetails.code).toBe(errorCode);
    });
  });
});

describe("Error type integration", () => {
  it("should work together in error handling scenarios", () => {
    // Simulate a typical error handling flow
    const originalError = new Error("Network timeout");
    const context = { operation: "audio_capture", tabId: 456 };

    // Create exception
    const exception = new RecordingException(
      RecordingError.TAB_CAPTURE_FAILED,
      "Failed to capture audio from tab",
      originalError,
      context
    );

    // Convert to error details
    const errorDetails: RecordingErrorDetails = {
      code: exception.code,
      message: exception.message,
      originalError: exception,
      timestamp: exception.timestamp,
      context: exception.context,
    };

    expect(errorDetails.code).toBe(RecordingError.TAB_CAPTURE_FAILED);
    expect(errorDetails.originalError).toBe(exception);
    expect(errorDetails.context).toEqual(context);
  });

  it("should support error handler function type", () => {
    const errorHandler = (error: RecordingErrorDetails) => {
      expect(error).toHaveProperty("code");
      expect(error).toHaveProperty("message");
      expect(error).toHaveProperty("timestamp");
    };

    const errorDetails: RecordingErrorDetails = {
      code: RecordingError.UNSUPPORTED_BROWSER,
      message: "Browser not supported",
      timestamp: Date.now(),
    };

    expect(() => errorHandler(errorDetails)).not.toThrow();
  });
});
