// Export all React components
export { default as RecordingButton } from "./RecordingButton";
export { default as StatusIndicator } from "./StatusIndicator";
export { default as AudioVisualizer } from "./AudioVisualizer";
export { default as ErrorBoundary } from "./ErrorBoundary";

// Re-export component prop types for convenience
export type {
  RecordingButtonProps,
  StatusIndicatorProps,
  AudioVisualizerProps,
} from "../types/components";
