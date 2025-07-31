import React, { useEffect, useState } from "react";
import { StatusIndicatorProps } from "../types/components";
import { MediaStreamStatus } from "../types/recording";
import "./StatusIndicator.css";

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  videoStatus,
  audioStatus,
  duration,
  showTooltips = true,
  className = "",
}) => {
  const [displayDuration, setDisplayDuration] = useState(duration);

  useEffect(() => {
    setDisplayDuration(duration);
  }, [duration]);

  const formatDuration = (seconds: number): string => {
    // Handle negative values by treating them as 0
    const normalizedSeconds = Math.max(0, seconds);
    const mins = Math.floor(normalizedSeconds / 60);
    const secs = normalizedSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const getStatusIcon = (status: MediaStreamStatus): string => {
    switch (status) {
      case "active":
        return "🟢";
      case "error":
        return "🔴";
      case "inactive":
      default:
        return "⚪";
    }
  };

  const getStatusText = (
    status: MediaStreamStatus,
    type: "video" | "audio"
  ): string => {
    const typeText = type === "video" ? "Video" : "Audio";
    switch (status) {
      case "active":
        return `${typeText} recording active`;
      case "error":
        return `${typeText} recording error`;
      case "inactive":
      default:
        return `${typeText} recording inactive`;
    }
  };

  const getErrorMessage = (): string | null => {
    if (videoStatus === "error" && audioStatus === "error") {
      return "Both video and audio recording failed";
    } else if (videoStatus === "error") {
      return "Video recording failed";
    } else if (audioStatus === "error") {
      return "Audio recording failed - continuing with video only";
    }
    return null;
  };

  const hasError = videoStatus === "error" || audioStatus === "error";
  const isRecording = videoStatus === "active" || audioStatus === "active";

  return (
    <div
      className={`status-indicator ${className}`.trim()}
      data-testid="status-indicator"
    >
      {/* Duration Display */}
      <div
        className="status-indicator__duration"
        data-testid="duration-display"
      >
        <span className="status-indicator__duration-label">Duration:</span>
        <span className="status-indicator__duration-value">
          {formatDuration(displayDuration)}
        </span>
      </div>

      {/* Status Icons */}
      <div className="status-indicator__statuses">
        {/* Video Status */}
        <div
          className="status-indicator__status status-indicator__status--video"
          title={showTooltips ? getStatusText(videoStatus, "video") : undefined}
          data-testid="video-status"
        >
          <span className="status-indicator__status-icon">
            {getStatusIcon(videoStatus)}
          </span>
          <span className="status-indicator__status-label">Video</span>
        </div>

        {/* Audio Status */}
        <div
          className="status-indicator__status status-indicator__status--audio"
          title={showTooltips ? getStatusText(audioStatus, "audio") : undefined}
          data-testid="audio-status"
        >
          <span className="status-indicator__status-icon">
            {getStatusIcon(audioStatus)}
          </span>
          <span className="status-indicator__status-label">Audio</span>
        </div>
      </div>

      {/* Error Messages */}
      {hasError && (
        <div
          className="status-indicator__error"
          data-testid="error-message"
          role="alert"
        >
          <span className="status-indicator__error-icon">⚠️</span>
          <span className="status-indicator__error-text">
            {getErrorMessage()}
          </span>
        </div>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div
          className="status-indicator__recording-pulse"
          data-testid="recording-pulse"
          aria-label="Recording in progress"
        >
          <span className="status-indicator__pulse-dot"></span>
          <span className="status-indicator__pulse-text">REC</span>
        </div>
      )}
    </div>
  );
};

export default StatusIndicator;
