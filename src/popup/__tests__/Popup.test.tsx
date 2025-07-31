import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Popup from "../Popup";

// Mock services
vi.mock("../../services/MediaRecorderService", () => ({
  mediaRecorderService: {
    isRecordingSupported: vi.fn(() => true),
    startRecording: vi.fn(() => Promise.resolve({})),
    getRecordingResult: vi.fn(() =>
      Promise.resolve({
        blob: new Blob(["test"], { type: "video/webm" }),
        duration: 5000,
        hasAudio: true,
        hasVideo: true,
      })
    ),
  },
}));

vi.mock("../../services/ChromeAPIService", () => ({
  chromeAPIService: {
    getCurrentTab: vi.fn(() =>
      Promise.resolve({
        id: 1,
        url: "https://www.shadertoy.com/view/test",
        title: "Test ShaderToy",
      })
    ),
    isShaderToyTab: vi.fn(() => true),
    checkPermissions: vi.fn(() => Promise.resolve(true)),
    injectContentScript: vi.fn(() => Promise.resolve()),
    captureTabAudio: vi.fn(() => Promise.resolve(new MediaStream())),
  },
}));

// Mock Chrome APIs
const mockChrome = {
  tabs: {
    sendMessage: vi.fn((tabId, message, callback) => {
      setTimeout(() => callback({ stream: new MediaStream() }), 10);
    }),
  },
  runtime: { lastError: null },
};

// @ts-ignore
global.chrome = mockChrome;
global.URL.createObjectURL = vi.fn(() => "blob:test-url");
global.URL.revokeObjectURL = vi.fn();

describe("Popup Component Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
  });

  it("renders popup with main components", async () => {
    render(<Popup />);

    expect(screen.getByText("ShaderToy Recorder")).toBeInTheDocument();
    expect(
      screen.getByText("Audio-Video Recording Extension")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("status-indicator")).toBeInTheDocument();
    });

    expect(screen.getByTestId("audio-visualizer")).toBeInTheDocument();
    expect(screen.getByTestId("recording-button")).toBeInTheDocument();
    expect(screen.getByTestId("reset-button")).toBeInTheDocument();
  });

  it("shows ShaderToy tab info", async () => {
    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByTestId("tab-info")).toBeInTheDocument();
    });

    expect(screen.getByText("✅ ShaderToy")).toBeInTheDocument();
  });

  it("handles state changes through callback", async () => {
    const onStateChange = vi.fn();
    render(<Popup onStateChange={onStateChange} />);

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalled();
    });

    const lastCall =
      onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0];
    expect(lastCall).toHaveProperty("isRecording", false);
    expect(lastCall).toHaveProperty("videoStatus", "inactive");
    expect(lastCall).toHaveProperty("audioStatus", "inactive");
  });

  it("resets state when reset button clicked", async () => {
    const onStateChange = vi.fn();
    render(<Popup onStateChange={onStateChange} />);

    await waitFor(() => {
      expect(screen.getByTestId("reset-button")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("reset-button"));
    });

    const resetCall = onStateChange.mock.calls.find(
      (call) => call[0].startTime === null && call[0].duration === 0
    );
    expect(resetCall).toBeTruthy();
  });
});
