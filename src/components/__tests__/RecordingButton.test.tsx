import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RecordingButton from "../RecordingButton";
import { RecordingButtonProps } from "../../types/components";

describe("RecordingButton", () => {
  const defaultProps: RecordingButtonProps = {
    isRecording: false,
    onStartRecording: vi.fn(),
    onStopRecording: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render with start recording text when not recording", () => {
    render(<RecordingButton {...defaultProps} />);

    expect(screen.getByText("Start Recording")).toBeInTheDocument();
    expect(screen.getByText("🔴")).toBeInTheDocument();
  });

  it("should render with stop recording text when recording", () => {
    render(<RecordingButton {...defaultProps} isRecording={true} />);

    expect(screen.getByText("Stop Recording")).toBeInTheDocument();
    expect(screen.getByText("⏹️")).toBeInTheDocument();
  });

  it("should call onStartRecording when clicked and not recording", async () => {
    const onStartRecording = vi.fn().mockResolvedValue(undefined);
    render(
      <RecordingButton {...defaultProps} onStartRecording={onStartRecording} />
    );

    const button = screen.getByTestId("recording-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(onStartRecording).toHaveBeenCalledTimes(1);
    });
  });

  it("should call onStopRecording when clicked and recording", async () => {
    const onStopRecording = vi.fn().mockResolvedValue(undefined);
    render(
      <RecordingButton
        {...defaultProps}
        isRecording={true}
        onStopRecording={onStopRecording}
      />
    );

    const button = screen.getByTestId("recording-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(onStopRecording).toHaveBeenCalledTimes(1);
    });
  });

  it("should be disabled when disabled prop is true", () => {
    render(<RecordingButton {...defaultProps} disabled={true} />);

    const button = screen.getByTestId("recording-button");
    expect(button).toBeDisabled();
  });

  it("should show loading state when loading prop is true", () => {
    render(<RecordingButton {...defaultProps} loading={true} />);

    expect(screen.getByText("Starting...")).toBeInTheDocument();
    expect(screen.getByText("⏳")).toBeInTheDocument();

    const button = screen.getByTestId("recording-button");
    expect(button).toBeDisabled();
  });

  it("should show processing state during async operations", async () => {
    const onStartRecording = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

    render(
      <RecordingButton {...defaultProps} onStartRecording={onStartRecording} />
    );

    const button = screen.getByTestId("recording-button");
    fireEvent.click(button);

    // Should show processing state immediately
    expect(screen.getByText("Starting...")).toBeInTheDocument();
    expect(button).toBeDisabled();

    // Wait for async operation to complete
    await waitFor(() => {
      expect(screen.getByText("Start Recording")).toBeInTheDocument();
    });

    expect(button).not.toBeDisabled();
  });

  it("should handle errors gracefully during recording operations", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onStartRecording = vi
      .fn()
      .mockRejectedValue(new Error("Recording failed"));

    render(
      <RecordingButton {...defaultProps} onStartRecording={onStartRecording} />
    );

    const button = screen.getByTestId("recording-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Recording operation failed:",
        expect.any(Error)
      );
    });

    // Button should return to normal state after error
    expect(screen.getByText("Start Recording")).toBeInTheDocument();
    expect(button).not.toBeDisabled();

    consoleSpy.mockRestore();
  });

  it("should apply custom className", () => {
    render(<RecordingButton {...defaultProps} className="custom-class" />);

    const button = screen.getByTestId("recording-button");
    expect(button).toHaveClass("custom-class");
  });

  it("should have proper accessibility attributes", () => {
    render(<RecordingButton {...defaultProps} />);

    const button = screen.getByTestId("recording-button");
    expect(button).toHaveAttribute("aria-label", "Start Recording");
    expect(button).toHaveAttribute("type", "button");
  });

  it("should not trigger multiple operations when clicked rapidly", async () => {
    const onStartRecording = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      );

    render(
      <RecordingButton {...defaultProps} onStartRecording={onStartRecording} />
    );

    const button = screen.getByTestId("recording-button");

    // Click multiple times rapidly
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(onStartRecording).toHaveBeenCalledTimes(1);
    });
  });

  it("should show correct loading text for stop operation", () => {
    render(
      <RecordingButton {...defaultProps} isRecording={true} loading={true} />
    );

    expect(screen.getByText("Stopping...")).toBeInTheDocument();
  });
});
