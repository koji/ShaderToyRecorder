import React from "react";
import { render, screen } from "@testing-library/react";
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

describe("Popup Styling and Responsive Design", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;

    // Reset mocks to default values
    const { mediaRecorderService } = await import(
      "../../services/MediaRecorderService"
    );
    const { chromeAPIService } = await import(
      "../../services/ChromeAPIService"
    );

    vi.mocked(mediaRecorderService.isRecordingSupported).mockReturnValue(true);
    vi.mocked(chromeAPIService.isShaderToyTab).mockReturnValue(true);
    vi.mocked(chromeAPIService.checkPermissions).mockResolvedValue(true);
  });

  it("applies correct CSS classes to popup container", async () => {
    render(<Popup />);

    const popup = screen.getByTestId("popup");
    expect(popup).toHaveClass("popup");
  });

  it("applies custom className when provided", async () => {
    render(<Popup className="custom-popup" />);

    const popup = screen.getByTestId("popup");
    expect(popup).toHaveClass("popup", "custom-popup");
  });

  it("renders header with correct structure", async () => {
    render(<Popup />);

    const header = document.querySelector(".popup__header");
    expect(header).toBeInTheDocument();

    const title = document.querySelector(".popup__title");
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent("ShaderToy Recorder");

    const subtitle = document.querySelector(".popup__subtitle");
    expect(subtitle).toBeInTheDocument();
    expect(subtitle).toHaveTextContent("Audio-Video Recording Extension");
  });

  it("renders content area with correct structure", async () => {
    render(<Popup />);

    const content = document.querySelector(".popup__content");
    expect(content).toBeInTheDocument();
  });

  it("renders footer with reset button", async () => {
    render(<Popup />);

    const footer = document.querySelector(".popup__footer");
    expect(footer).toBeInTheDocument();

    const resetButton = document.querySelector(".popup__reset-button");
    expect(resetButton).toBeInTheDocument();
  });

  it("applies correct CSS classes to components when supported", async () => {
    render(<Popup />);

    // Wait for components to render
    await screen.findByTestId("status-indicator");

    // Check status indicator has popup-specific class
    const statusIndicator = screen.getByTestId("status-indicator");
    expect(statusIndicator).toHaveClass("popup__status");

    // Check audio visualizer has popup-specific class
    const audioVisualizer = screen.getByTestId("audio-visualizer");
    expect(audioVisualizer).toHaveClass("popup__visualizer");

    // Check recording button has popup-specific class
    const recordingButton = screen.getByTestId("recording-button");
    expect(recordingButton).toHaveClass("popup__recording-button");
  });

  it("shows error styling when error is present", async () => {
    const { mediaRecorderService } = await import(
      "../../services/MediaRecorderService"
    );
    vi.mocked(mediaRecorderService.isRecordingSupported).mockReturnValue(false);

    render(<Popup />);

    await screen.findByTestId("popup-error");

    const errorElement = screen.getByTestId("popup-error");
    expect(errorElement).toHaveClass("popup__error");
    expect(errorElement).toHaveAttribute("role", "alert");
  });

  it("maintains proper structure for responsive design", async () => {
    render(<Popup />);

    // Check that all main sections exist for responsive CSS to work
    expect(document.querySelector(".popup__header")).toBeInTheDocument();
    expect(document.querySelector(".popup__content")).toBeInTheDocument();
    expect(document.querySelector(".popup__footer")).toBeInTheDocument();
  });
});
