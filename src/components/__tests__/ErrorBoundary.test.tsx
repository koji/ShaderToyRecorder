import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import ErrorBoundary from "../ErrorBoundary";
import { RecordingError, RecordingErrorDetails } from "../../types/errors";

// Mock component that throws errors
const ThrowError: React.FC<{
  shouldThrow?: boolean;
  errorMessage?: string;
}> = ({ shouldThrow = false, errorMessage = "Test error" }) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div data-testid="success-component">Success</div>;
};

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress console.error for cleaner test output
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children when there are no errors", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("success-component")).toBeInTheDocument();
  });

  it("renders error UI when child component throws", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} errorMessage="Component crashed" />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("error-boundary")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/Component crashed/)).toBeInTheDocument();
  });

  it("calls onError callback when error occurs", () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} errorMessage="Test error" />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: RecordingError.RECORDING_FAILED,
        message: "Test error",
        originalError: expect.any(Error),
        timestamp: expect.any(Number),
      })
    );
  });

  it("shows retry button with correct attempts left", () => {
    render(
      <ErrorBoundary maxRetries={3}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const retryButton = screen.getByTestId("retry-button");
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).toHaveTextContent("Retry (3 attempts left)");
  });

  it("handles retry mechanism", async () => {
    let shouldThrow = true;
    const TestComponent = () => <ThrowError shouldThrow={shouldThrow} />;

    const { rerender } = render(
      <ErrorBoundary maxRetries={3}>
        <TestComponent />
      </ErrorBoundary>
    );

    // Error should be displayed
    expect(screen.getByTestId("error-boundary")).toBeInTheDocument();

    // Fix the error condition
    shouldThrow = false;

    // Click retry
    fireEvent.click(screen.getByTestId("retry-button"));

    // Wait for retry delay
    await waitFor(
      () => {
        rerender(
          <ErrorBoundary maxRetries={3}>
            <TestComponent />
          </ErrorBoundary>
        );
        expect(screen.getByTestId("success-component")).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it("disables retry after max attempts", () => {
    render(
      <ErrorBoundary maxRetries={0}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.queryByTestId("retry-button")).not.toBeInTheDocument();
  });

  it("handles reset functionality", () => {
    let shouldThrow = true;
    const TestComponent = () => <ThrowError shouldThrow={shouldThrow} />;

    const { rerender } = render(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>
    );

    // Error should be displayed
    expect(screen.getByTestId("error-boundary")).toBeInTheDocument();

    // Fix the error condition
    shouldThrow = false;

    // Click reset
    fireEvent.click(screen.getByTestId("reset-button"));

    // Re-render with no error
    rerender(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("success-component")).toBeInTheDocument();
  });

  it("uses custom fallback when provided", () => {
    const customFallback = (
      error: RecordingErrorDetails,
      retry: () => void
    ) => (
      <div data-testid="custom-fallback">
        Custom error: {error.message}
        <button onClick={retry} data-testid="custom-retry">
          Custom Retry
        </button>
      </div>
    );

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} errorMessage="Custom error message" />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
    expect(
      screen.getByText("Custom error: Custom error message")
    ).toBeInTheDocument();
    expect(screen.getByTestId("custom-retry")).toBeInTheDocument();
  });

  it("provides user-friendly messages for different error codes", () => {
    const errorMessages = [
      {
        errorMessage: "Canvas element not found",
        expectedText: "Could not find the ShaderToy canvas",
      },
      {
        errorMessage: "Audio permission denied",
        expectedText: "Audio recording permission was denied",
      },
      {
        errorMessage: "Feature not supported",
        expectedText: "Your browser doesn't support video recording",
      },
    ];

    errorMessages.forEach(({ errorMessage, expectedText }) => {
      const ThrowSpecificError = () => {
        throw new Error(errorMessage);
      };

      const { unmount } = render(
        <ErrorBoundary>
          <ThrowSpecificError />
        </ErrorBoundary>
      );

      expect(screen.getByText(new RegExp(expectedText))).toBeInTheDocument();
      unmount();
    });
  });

  it("shows technical details in collapsed section", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} errorMessage="Technical error" />
      </ErrorBoundary>
    );

    const details = screen.getByText("Technical Details");
    expect(details).toBeInTheDocument();

    // Click to expand details
    fireEvent.click(details);

    expect(screen.getByText("Error Code:")).toBeInTheDocument();
    expect(screen.getByText("Timestamp:")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <ErrorBoundary className="custom-error-class">
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const wrapper = screen.getByTestId("error-boundary").parentElement;
    expect(wrapper).toHaveClass("custom-error-class");
  });

  it("handles component unmounting during retry", () => {
    const { unmount } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Click retry to start timeout
    fireEvent.click(screen.getByTestId("retry-button"));

    // Unmount component before timeout completes
    expect(() => unmount()).not.toThrow();
  });

  it("increments retry count on each attempt", () => {
    const { rerender } = render(
      <ErrorBoundary maxRetries={3}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // First attempt
    expect(screen.getByText("Retry (3 attempts left)")).toBeInTheDocument();

    // Click retry
    fireEvent.click(screen.getByTestId("retry-button"));

    // Re-render with error again
    rerender(
      <ErrorBoundary maxRetries={3}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Should show decremented attempts
    expect(screen.getByText("Retry (2 attempts left)")).toBeInTheDocument();
  });
});
