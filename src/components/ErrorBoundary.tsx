import React, { Component, ReactNode } from "react";
import { RecordingError, RecordingErrorDetails } from "../types/errors";
import { errorHandlingService } from "../services/ErrorHandlingService";

interface ErrorBoundaryState {
  hasError: boolean;
  error: RecordingErrorDetails | null;
  retryCount: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: RecordingErrorDetails, retry: () => void) => ReactNode;
  onError?: (error: RecordingErrorDetails) => void;
  maxRetries?: number;
  className?: string;
}

/**
 * React Error Boundary component for handling component errors
 * Provides retry mechanisms and user-friendly error display
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Use error handling service for proper classification
    const recordingError = errorHandlingService.handleError(error, {
      componentStack: error.stack,
      errorBoundary: true,
    });

    return {
      hasError: true,
      error: recordingError,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Use error handling service for proper classification
    const recordingError = errorHandlingService.handleError(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    });

    // Log error for debugging
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Notify parent component
    this.props.onError?.(recordingError);

    // Update state with error details
    this.setState({
      error: recordingError,
    });
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      window.clearTimeout(this.retryTimeoutId);
    }
  }

  /**
   * Retry mechanism for transient failures
   */
  handleRetry = () => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      console.warn("Maximum retry attempts reached");
      return;
    }

    // Clear error state and increment retry count
    this.setState({
      hasError: false,
      error: null,
      retryCount: retryCount + 1,
    });

    // Add delay before retry to prevent rapid retries
    this.retryTimeoutId = window.setTimeout(() => {
      // Force re-render of children
      this.forceUpdate();
    }, 1000 * (retryCount + 1)); // Exponential backoff
  };

  /**
   * Reset error boundary state
   */
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      retryCount: 0,
    });
  };

  /**
   * Get user-friendly error message based on error code
   */
  getUserFriendlyMessage(error: RecordingErrorDetails): string {
    return errorHandlingService.getUserFriendlyMessage(error);
  }

  /**
   * Default error fallback UI
   */
  renderDefaultFallback(error: RecordingErrorDetails) {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;
    const canRetry = retryCount < maxRetries;
    const userMessage = this.getUserFriendlyMessage(error);

    return (
      <div className="error-boundary" data-testid="error-boundary">
        <div className="error-boundary__content">
          <div className="error-boundary__icon">⚠️</div>
          <h3 className="error-boundary__title">Something went wrong</h3>
          <p className="error-boundary__message">{userMessage}</p>

          {error.code !== RecordingError.UNSUPPORTED_BROWSER && (
            <div className="error-boundary__actions">
              {canRetry && (
                <button
                  type="button"
                  className="error-boundary__retry-button"
                  onClick={this.handleRetry}
                  data-testid="retry-button"
                >
                  Retry ({maxRetries - retryCount} attempts left)
                </button>
              )}
              <button
                type="button"
                className="error-boundary__reset-button"
                onClick={this.handleReset}
                data-testid="reset-button"
              >
                Reset
              </button>
            </div>
          )}

          {/* Technical details for debugging (collapsed by default) */}
          <details className="error-boundary__details">
            <summary>Technical Details</summary>
            <div className="error-boundary__technical">
              <p>
                <strong>Error Code:</strong> {error.code}
              </p>
              <p>
                <strong>Timestamp:</strong>{" "}
                {new Date(error.timestamp).toLocaleString()}
              </p>
              {error.originalError && (
                <p>
                  <strong>Original Error:</strong> {error.originalError.message}
                </p>
              )}
              {error.context && (
                <pre className="error-boundary__context">
                  {JSON.stringify(error.context, null, 2)}
                </pre>
              )}
            </div>
          </details>
        </div>
      </div>
    );
  }

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, className } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided, otherwise use default
      const errorUI = fallback
        ? fallback(error, this.handleRetry)
        : this.renderDefaultFallback(error);

      return (
        <div className={`error-boundary-wrapper ${className || ""}`.trim()}>
          {errorUI}
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
