// React component prop interfaces

import { MediaStreamStatus, RecordingState } from "./recording";

export interface RecordingButtonProps {
  isRecording: boolean;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export interface StatusIndicatorProps {
  videoStatus: MediaStreamStatus;
  audioStatus: MediaStreamStatus;
  duration: number;
  showTooltips?: boolean;
  className?: string;
}

export interface AudioVisualizerProps {
  audioStream: MediaStream | null;
  isActive: boolean;
  width?: number;
  height?: number;
  barCount?: number;
  className?: string;
}

export interface PopupProps {
  initialState?: Partial<RecordingState>;
  onStateChange?: (state: RecordingState) => void;
  className?: string;
}

// Hook return types
export interface UseRecordingHook {
  state: RecordingState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetState: () => void;
  isSupported: boolean;
}

export interface UseAudioVisualizerHook {
  analyzerData: {
    frequencyData: Uint8Array;
    timeData: Uint8Array;
    volume: number;
  } | null;
  isAnalyzing: boolean;
  startAnalyzing: (stream: MediaStream) => void;
  stopAnalyzing: () => void;
}

// Event handler types
export type RecordingEventHandler = (
  event: "start" | "stop" | "error",
  data?: any
) => void;
export type StatusChangeHandler = (
  status: MediaStreamStatus,
  type: "video" | "audio"
) => void;
