import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import StatusIndicator from "../StatusIndicator";
import { StatusIndicatorProps } from "../../types/components";
import { MediaStreamStatus } from "../../types/recording";

describe("StatusIndicator", () => {
  const defaultProps: StatusIndicatorProps = {
    videoStatus: "inactive" as MediaStreamStatus,
    audioStatus: "inactive" as MediaStreamStatus,
    duration: 0,
  };

  beforeEach(() => {
    // Reset any state between tests
  });

  it("should render duration display correctly", () => {
    render(<StatusIndicator {...defaultProps} duration={125} />);

    expect(screen.getByTestId("duration-display")).toBeInTheDocument();
    expect(screen.getByText("02:05")).toBeInTheDocument();
  });

  it("should format duration correctly for different values", () => {
    const { rerender } = render(
      <StatusIndicator {...defaultProps} duration={0} />
    );
    expect(screen.getByText("00:00")).toBeInTheDocument();

    rerender(<StatusIndicator {...defaultProps} duration={59} />);
    expect(screen.getByText("00:59")).toBeInTheDocument();

    rerender(<StatusIndicator {...defaultProps} duration={60} />);
    expect(screen.getByText("01:00")).toBeInTheDocument();

    rerender(<StatusIndicator {...defaultProps} duration={3661} />);
    expect(screen.getByText("61:01")).toBeInTheDocument();
  });

  it("should display video status correctly", () => {
    const { rerender } = render(
      <StatusIndicator {...defaultProps} videoStatus="inactive" />
    );

    let videoStatus = screen.getByTestId("video-status");
    expect(videoStatus).toHaveTextContent("⚪");
    expect(videoStatus).toHaveTextContent("Video");

    rerender(<StatusIndicator {...defaultProps} videoStatus="active" />);
    videoStatus = screen.getByTestId("video-status");
    expect(videoStatus).toHaveTextContent("🟢");

    rerender(<StatusIndicator {...defaultProps} videoStatus="error" />);
    videoStatus = screen.getByTestId("video-status");
    expect(videoStatus).toHaveTextContent("🔴");
  });

  it("should display audio status correctly", () => {
    const { rerender } = render(
      <StatusIndicator {...defaultProps} audioStatus="inactive" />
    );

    let audioStatus = screen.getByTestId("audio-status");
    expect(audioStatus).toHaveTextContent("⚪");
    expect(audioStatus).toHaveTextContent("Audio");

    rerender(<StatusIndicator {...defaultProps} audioStatus="active" />);
    audioStatus = screen.getByTestId("audio-status");
    expect(audioStatus).toHaveTextContent("🟢");

    rerender(<StatusIndicator {...defaultProps} audioStatus="error" />);
    audioStatus = screen.getByTestId("audio-status");
    expect(audioStatus).toHaveTextContent("🔴");
  });

  it("should show tooltips when showTooltips is true", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="active"
        audioStatus="error"
        showTooltips={true}
      />
    );

    const videoStatus = screen.getByTestId("video-status");
    const audioStatus = screen.getByTestId("audio-status");

    expect(videoStatus).toHaveAttribute("title", "Video recording active");
    expect(audioStatus).toHaveAttribute("title", "Audio recording error");
  });

  it("should not show tooltips when showTooltips is false", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="active"
        audioStatus="error"
        showTooltips={false}
      />
    );

    const videoStatus = screen.getByTestId("video-status");
    const audioStatus = screen.getByTestId("audio-status");

    expect(videoStatus).not.toHaveAttribute("title");
    expect(audioStatus).not.toHaveAttribute("title");
  });

  it("should display error message for video error", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="error"
        audioStatus="active"
      />
    );

    const errorMessage = screen.getByTestId("error-message");
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent("Video recording failed");
    expect(errorMessage).toHaveAttribute("role", "alert");
  });

  it("should display error message for audio error", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="active"
        audioStatus="error"
      />
    );

    const errorMessage = screen.getByTestId("error-message");
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent(
      "Audio recording failed - continuing with video only"
    );
  });

  it("should display error message for both video and audio errors", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="error"
        audioStatus="error"
      />
    );

    const errorMessage = screen.getByTestId("error-message");
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent(
      "Both video and audio recording failed"
    );
  });

  it("should not display error message when no errors", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="active"
        audioStatus="active"
      />
    );

    expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
  });

  it("should show recording pulse when video is active", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="active"
        audioStatus="inactive"
      />
    );

    const recordingPulse = screen.getByTestId("recording-pulse");
    expect(recordingPulse).toBeInTheDocument();
    expect(recordingPulse).toHaveTextContent("REC");
    expect(recordingPulse).toHaveAttribute(
      "aria-label",
      "Recording in progress"
    );
  });

  it("should show recording pulse when audio is active", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="inactive"
        audioStatus="active"
      />
    );

    const recordingPulse = screen.getByTestId("recording-pulse");
    expect(recordingPulse).toBeInTheDocument();
  });

  it("should show recording pulse when both are active", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="active"
        audioStatus="active"
      />
    );

    const recordingPulse = screen.getByTestId("recording-pulse");
    expect(recordingPulse).toBeInTheDocument();
  });

  it("should not show recording pulse when both are inactive", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="inactive"
        audioStatus="inactive"
      />
    );

    expect(screen.queryByTestId("recording-pulse")).not.toBeInTheDocument();
  });

  it("should not show recording pulse when both have errors", () => {
    render(
      <StatusIndicator
        {...defaultProps}
        videoStatus="error"
        audioStatus="error"
      />
    );

    expect(screen.queryByTestId("recording-pulse")).not.toBeInTheDocument();
  });

  it("should apply custom className", () => {
    render(<StatusIndicator {...defaultProps} className="custom-status" />);

    const statusIndicator = screen.getByTestId("status-indicator");
    expect(statusIndicator).toHaveClass("custom-status");
  });

  it("should update duration when prop changes", () => {
    const { rerender } = render(
      <StatusIndicator {...defaultProps} duration={30} />
    );
    expect(screen.getByText("00:30")).toBeInTheDocument();

    rerender(<StatusIndicator {...defaultProps} duration={90} />);
    expect(screen.getByText("01:30")).toBeInTheDocument();
  });

  it("should handle edge case durations correctly", () => {
    const { rerender } = render(
      <StatusIndicator {...defaultProps} duration={-1} />
    );
    expect(screen.getByText("00:00")).toBeInTheDocument();

    rerender(<StatusIndicator {...defaultProps} duration={3600} />);
    expect(screen.getByText("60:00")).toBeInTheDocument();
  });
});
