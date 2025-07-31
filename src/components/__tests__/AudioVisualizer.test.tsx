import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AudioVisualizer from "../AudioVisualizer";
import { AudioVisualizerProps } from "../../types/components";

// Mock Web Audio API
const mockAudioContext = {
  createAnalyser: vi.fn(() => ({
    fftSize: 256,
    smoothingTimeConstant: 0.8,
    frequencyBinCount: 128,
    getByteFrequencyData: vi.fn(),
  })),
  createMediaStreamSource: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  close: vi.fn(),
  state: "running",
};

const mockMediaStream = {
  getAudioTracks: vi.fn(() => [{ kind: "audio" }]),
  getVideoTracks: vi.fn(() => []),
} as unknown as MediaStream;

// Mock canvas context
const mockCanvasContext = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  set fillStyle(value: string) {},
  get fillStyle() {
    return "#000000";
  },
};

const mockCanvas = {
  getContext: vi.fn(() => mockCanvasContext),
  width: 200,
  height: 60,
};

describe("AudioVisualizer", () => {
  const defaultProps: AudioVisualizerProps = {
    audioStream: null,
    isActive: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock AudioContext
    (global as any).AudioContext = vi.fn(() => mockAudioContext);
    (global as any).webkitAudioContext = vi.fn(() => mockAudioContext);

    // Mock requestAnimationFrame and cancelAnimationFrame
    global.requestAnimationFrame = vi.fn((cb) => {
      setTimeout(cb, 16);
      return 1;
    });
    global.cancelAnimationFrame = vi.fn();

    // Mock canvas
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render with default props", () => {
    render(<AudioVisualizer {...defaultProps} />);

    expect(screen.getByTestId("audio-visualizer")).toBeInTheDocument();
    expect(screen.getByTestId("audio-visualizer-canvas")).toBeInTheDocument();
  });

  it("should show placeholder when not active", () => {
    render(<AudioVisualizer {...defaultProps} isActive={false} />);

    expect(
      screen.getByTestId("audio-visualizer-placeholder")
    ).toBeInTheDocument();
    expect(screen.getByText("No Audio")).toBeInTheDocument();
    expect(screen.getByText("🔇")).toBeInTheDocument();
  });

  it("should not show placeholder when active", () => {
    render(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );

    expect(
      screen.queryByTestId("audio-visualizer-placeholder")
    ).not.toBeInTheDocument();
  });

  it("should show loading state when active but not analyzing", async () => {
    render(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );

    // Initially should show loading
    expect(screen.getByTestId("audio-visualizer-loading")).toBeInTheDocument();
    expect(screen.getByText("Initializing...")).toBeInTheDocument();
    expect(screen.getByText("⏳")).toBeInTheDocument();

    // After timeout, loading should disappear
    await waitFor(
      () => {
        expect(
          screen.queryByTestId("audio-visualizer-loading")
        ).not.toBeInTheDocument();
      },
      { timeout: 200 }
    );
  });

  it("should set canvas dimensions correctly", () => {
    const customWidth = 300;
    const customHeight = 80;

    render(
      <AudioVisualizer
        {...defaultProps}
        width={customWidth}
        height={customHeight}
      />
    );

    const canvas = screen.getByTestId("audio-visualizer-canvas");
    expect(canvas).toHaveAttribute("width", customWidth.toString());
    expect(canvas).toHaveAttribute("height", customHeight.toString());
  });

  it("should apply custom className", () => {
    render(<AudioVisualizer {...defaultProps} className="custom-visualizer" />);

    const visualizer = screen.getByTestId("audio-visualizer");
    expect(visualizer).toHaveClass("custom-visualizer");
  });

  it("should have correct CSS classes based on state", () => {
    const { rerender } = render(
      <AudioVisualizer {...defaultProps} isActive={false} />
    );

    let visualizer = screen.getByTestId("audio-visualizer");
    expect(visualizer).toHaveClass("audio-visualizer--inactive");

    rerender(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );
    visualizer = screen.getByTestId("audio-visualizer");
    expect(visualizer).toHaveClass("audio-visualizer");
  });

  it("should have proper accessibility attributes", () => {
    const { rerender } = render(
      <AudioVisualizer {...defaultProps} isActive={false} />
    );

    let canvas = screen.getByTestId("audio-visualizer-canvas");
    expect(canvas).toHaveAttribute(
      "aria-label",
      "Audio visualization inactive"
    );

    rerender(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );
    canvas = screen.getByTestId("audio-visualizer-canvas");
    expect(canvas).toHaveAttribute("aria-label");
  });

  it("should initialize audio analysis when active with stream", async () => {
    render(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );

    await waitFor(() => {
      expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(
        mockMediaStream
      );
    });
  });

  it("should not initialize audio analysis when inactive", () => {
    render(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={false}
      />
    );

    expect(mockAudioContext.createAnalyser).not.toHaveBeenCalled();
    expect(mockAudioContext.createMediaStreamSource).not.toHaveBeenCalled();
  });

  it("should not initialize audio analysis without stream", () => {
    render(
      <AudioVisualizer {...defaultProps} audioStream={null} isActive={true} />
    );

    expect(mockAudioContext.createAnalyser).not.toHaveBeenCalled();
    expect(mockAudioContext.createMediaStreamSource).not.toHaveBeenCalled();
  });

  it("should handle audio context creation failure gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (global as any).AudioContext = vi.fn(() => {
      throw new Error("AudioContext creation failed");
    });

    render(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to start audio analysis:",
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it("should cleanup resources when unmounted", () => {
    const { unmount } = render(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );

    // Should not throw errors when unmounting
    expect(() => unmount()).not.toThrow();
  });

  it("should cleanup resources when stream changes", () => {
    const { rerender } = render(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );

    // Should not throw errors when changing stream
    expect(() => {
      rerender(
        <AudioVisualizer {...defaultProps} audioStream={null} isActive={true} />
      );
    }).not.toThrow();
  });

  it("should cleanup resources when becomes inactive", () => {
    const { rerender } = render(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );

    // Should not throw errors when becoming inactive
    expect(() => {
      rerender(
        <AudioVisualizer
          {...defaultProps}
          audioStream={mockMediaStream}
          isActive={false}
        />
      );
    }).not.toThrow();
  });

  it("should clear canvas when stopping analysis", async () => {
    const { rerender } = render(
      <AudioVisualizer
        {...defaultProps}
        audioStream={mockMediaStream}
        isActive={true}
      />
    );

    // Stop analysis
    rerender(
      <AudioVisualizer {...defaultProps} audioStream={null} isActive={false} />
    );

    await waitFor(() => {
      expect(mockCanvasContext.clearRect).toHaveBeenCalled();
    });
  });

  it("should use default dimensions when not specified", () => {
    render(<AudioVisualizer {...defaultProps} />);

    const canvas = screen.getByTestId("audio-visualizer-canvas");
    expect(canvas).toHaveAttribute("width", "200");
    expect(canvas).toHaveAttribute("height", "60");
  });

  it("should handle custom bar count", () => {
    render(<AudioVisualizer {...defaultProps} barCount={30} />);

    // Component should render without errors
    expect(screen.getByTestId("audio-visualizer")).toBeInTheDocument();
  });
});
