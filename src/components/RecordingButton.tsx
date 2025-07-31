import React, { useState } from "react";
import { RecordingButtonProps } from "../types/components";
import "./RecordingButton.css";

const RecordingButton: React.FC<RecordingButtonProps> = ({
  isRecording,
  onStartRecording,
  onStopRecording,
  disabled = false,
  loading = false,
  className = "",
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClick = async () => {
    if (disabled || loading || isProcessing) {
      return;
    }

    setIsProcessing(true);
    try {
      if (isRecording) {
        await onStopRecording();
      } else {
        await onStartRecording();
      }
    } catch (error) {
      console.error("Recording operation failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getButtonText = () => {
    if (loading || isProcessing) {
      return isRecording ? "Stopping..." : "Starting...";
    }
    return isRecording ? "Stop Recording" : "Start Recording";
  };

  const getButtonClass = () => {
    const baseClass = "recording-button";
    const stateClass = isRecording
      ? "recording-button--recording"
      : "recording-button--idle";
    const disabledClass =
      disabled || loading || isProcessing ? "recording-button--disabled" : "";

    return `${baseClass} ${stateClass} ${disabledClass} ${className}`.trim();
  };

  return (
    <button
      className={getButtonClass()}
      onClick={handleClick}
      disabled={disabled || loading || isProcessing}
      type="button"
      aria-label={getButtonText()}
      data-testid="recording-button"
    >
      <span className="recording-button__icon">
        {isRecording ? "⏹️" : "🔴"}
      </span>
      <span className="recording-button__text">{getButtonText()}</span>
      {(loading || isProcessing) && (
        <span className="recording-button__spinner" aria-hidden="true">
          ⏳
        </span>
      )}
    </button>
  );
};

export default RecordingButton;
