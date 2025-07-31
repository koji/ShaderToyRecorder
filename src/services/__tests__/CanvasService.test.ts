// Unit tests for Canvas service functionality

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Canvas service implementation for testing
class CanvasService {
  /**
   * Finds the ShaderToy canvas element on the page
   */
  findShaderToyCanvas(): HTMLCanvasElement | null {
    // Look for canvas with ShaderToy-specific attributes or classes
    const canvases = document.querySelectorAll("canvas");

    for (const canvas of canvases) {
      if (this.isShaderToyCanvas(canvas as HTMLCanvasElement)) {
        return canvas as HTMLCanvasElement;
      }
    }

    return null;
  }

  /**
   * Captures a stream from a canvas element
   */
  captureCanvasStream(
    canvas: HTMLCanvasElement,
    frameRate: number = 30
  ): MediaStream {
    if (!this.validateCanvas(canvas)) {
      throw new Error("Invalid canvas element");
    }

    // Use captureStream if available
    if (typeof (canvas as any).captureStream === "function") {
      return (canvas as any).captureStream(frameRate);
    }

    // Fallback for older browsers
    if (typeof (canvas as any).mozCaptureStream === "function") {
      return (canvas as any).mozCaptureStream(frameRate);
    }

    throw new Error("Canvas stream capture not supported");
  }

  /**
   * Validates that a canvas is suitable for recording
   */
  validateCanvas(canvas: HTMLCanvasElement): boolean {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      return false;
    }

    // Check if canvas has content
    if (canvas.width === 0 || canvas.height === 0) {
      return false;
    }

    // Check if canvas is visible
    const style = window.getComputedStyle(canvas);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    return true;
  }

  /**
   * Checks if a canvas is likely a ShaderToy canvas
   */
  private isShaderToyCanvas(canvas: HTMLCanvasElement): boolean {
    // Check for ShaderToy-specific attributes
    if (canvas.id === "demogl" || canvas.className.includes("shader")) {
      return true;
    }

    // Check parent elements for ShaderToy indicators
    let parent = canvas.parentElement;
    while (parent) {
      if (
        parent.className.includes("shader") ||
        parent.id.includes("shader") ||
        parent.className.includes("demo")
      ) {
        return true;
      }
      parent = parent.parentElement;
    }

    // Check canvas size (ShaderToy canvases are typically large)
    if (canvas.width >= 512 && canvas.height >= 512) {
      return true;
    }

    return false;
  }

  /**
   * Gets canvas rendering context information
   */
  getCanvasInfo(canvas: HTMLCanvasElement): {
    width: number;
    height: number;
    contextType: string | null;
    isAnimated: boolean;
  } {
    const context =
      canvas.getContext("webgl") ||
      canvas.getContext("webgl2") ||
      canvas.getContext("2d");

    return {
      width: canvas.width,
      height: canvas.height,
      contextType: context ? context.constructor.name || "unknown" : null,
      isAnimated: this.detectAnimation(canvas),
    };
  }

  /**
   * Detects if a canvas is being animated
   */
  private detectAnimation(canvas: HTMLCanvasElement): boolean {
    // Simple animation detection by checking if canvas content changes
    let lastImageData: string | null = null;
    let changeCount = 0;

    const checkChanges = () => {
      try {
        const currentImageData = canvas.toDataURL();
        if (lastImageData && lastImageData !== currentImageData) {
          changeCount++;
        }
        lastImageData = currentImageData;
      } catch (error) {
        // Canvas might be tainted, assume it's animated
        return true;
      }
    };

    // Check for changes over a short period
    const interval = setInterval(checkChanges, 100);
    setTimeout(() => {
      clearInterval(interval);
    }, 1000);

    return changeCount > 2; // If content changed more than twice, likely animated
  }

  /**
   * Waits for canvas to be ready for capture
   */
  async waitForCanvasReady(
    canvas: HTMLCanvasElement,
    timeout: number = 5000
  ): Promise<boolean> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkReady = () => {
        if (
          this.validateCanvas(canvas) &&
          canvas.width > 0 &&
          canvas.height > 0
        ) {
          resolve(true);
          return;
        }

        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }

        setTimeout(checkReady, 100);
      };

      checkReady();
    });
  }
}

// Mock DOM elements
class MockCanvas {
  width: number = 800;
  height: number = 600;
  id: string = "";
  className: string = "";
  style: { display: string; visibility: string } = {
    display: "block",
    visibility: "visible",
  };
  parentElement: MockElement | null = null;

  constructor(id: string = "", className: string = "") {
    this.id = id;
    this.className = className;
  }

  getContext(type: string): MockContext | null {
    if (type === "webgl" || type === "webgl2" || type === "2d") {
      return new MockContext(type);
    }
    return null;
  }

  captureStream(frameRate?: number): MediaStream {
    return new MockMediaStream(`canvas-stream-${frameRate || 30}`);
  }

  toDataURL(): string {
    return `data:image/png;base64,mock-data-${Date.now()}`;
  }
}

class MockContext {
  constructor(public type: string) {}
}

class MockElement {
  className: string = "";
  id: string = "";
  parentElement: MockElement | null = null;

  constructor(className: string = "", id: string = "") {
    this.className = className;
    this.id = id;
  }
}

class MockMediaStream {
  id: string;
  active: boolean = true;

  constructor(id: string) {
    this.id = id;
  }

  getVideoTracks(): MediaStreamTrack[] {
    return [{ kind: "video", id: "video-track" } as MediaStreamTrack];
  }

  getAudioTracks(): MediaStreamTrack[] {
    return [];
  }
}

describe("CanvasService", () => {
  let service: CanvasService;
  let mockCanvas: MockCanvas;
  let mockDocument: any;

  beforeEach(() => {
    service = new CanvasService();
    mockCanvas = new MockCanvas("demogl", "shader-canvas");

    // Mock document.querySelectorAll
    mockDocument = {
      querySelectorAll: vi.fn(),
    };
    global.document = mockDocument;

    // Mock window.getComputedStyle
    global.window = {
      getComputedStyle: vi.fn().mockReturnValue({
        display: "block",
        visibility: "visible",
      }),
    } as any;

    // Mock HTMLCanvasElement
    global.HTMLCanvasElement = MockCanvas as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("findShaderToyCanvas", () => {
    it("should find canvas with ShaderToy ID", () => {
      const shaderCanvas = new MockCanvas("demogl", "");
      mockDocument.querySelectorAll.mockReturnValue([shaderCanvas]);

      const found = service.findShaderToyCanvas();

      expect(found).toBe(shaderCanvas);
      expect(mockDocument.querySelectorAll).toHaveBeenCalledWith("canvas");
    });

    it("should find canvas with shader class", () => {
      const shaderCanvas = new MockCanvas("", "shader-display");
      mockDocument.querySelectorAll.mockReturnValue([shaderCanvas]);

      const found = service.findShaderToyCanvas();

      expect(found).toBe(shaderCanvas);
    });

    it("should find canvas with shader parent", () => {
      const canvas = new MockCanvas("", "");
      const parent = new MockElement("shader-container", "");
      canvas.parentElement = parent;
      mockDocument.querySelectorAll.mockReturnValue([canvas]);

      const found = service.findShaderToyCanvas();

      expect(found).toBe(canvas);
    });

    it("should find large canvas as potential ShaderToy canvas", () => {
      const largeCanvas = new MockCanvas("", "");
      largeCanvas.width = 1024;
      largeCanvas.height = 768;
      mockDocument.querySelectorAll.mockReturnValue([largeCanvas]);

      const found = service.findShaderToyCanvas();

      expect(found).toBe(largeCanvas);
    });

    it("should return null when no suitable canvas found", () => {
      const smallCanvas = new MockCanvas("", "");
      smallCanvas.width = 100;
      smallCanvas.height = 100;
      mockDocument.querySelectorAll.mockReturnValue([smallCanvas]);

      const found = service.findShaderToyCanvas();

      expect(found).toBeNull();
    });

    it("should return null when no canvases exist", () => {
      mockDocument.querySelectorAll.mockReturnValue([]);

      const found = service.findShaderToyCanvas();

      expect(found).toBeNull();
    });
  });

  describe("captureCanvasStream", () => {
    it("should capture stream from valid canvas", () => {
      const stream = service.captureCanvasStream(mockCanvas as any);

      expect(stream).toBeInstanceOf(MockMediaStream);
      expect(stream.id).toContain("canvas-stream");
    });

    it("should use custom frame rate", () => {
      const stream = service.captureCanvasStream(mockCanvas as any, 60);

      expect(stream.id).toContain("60");
    });

    it("should throw error for invalid canvas", () => {
      const invalidCanvas = new MockCanvas();
      invalidCanvas.width = 0;

      expect(() => service.captureCanvasStream(invalidCanvas as any)).toThrow(
        "Invalid canvas element"
      );
    });

    it("should throw error when captureStream not supported", () => {
      const canvasWithoutCapture = new MockCanvas();
      canvasWithoutCapture.captureStream = undefined as any;
      (canvasWithoutCapture as any).mozCaptureStream = undefined;

      expect(() =>
        service.captureCanvasStream(canvasWithoutCapture as any)
      ).toThrow("Canvas stream capture not supported");
    });

    it("should use mozCaptureStream fallback", () => {
      const canvasWithMoz = new MockCanvas();
      canvasWithMoz.captureStream = undefined as any;
      (canvasWithMoz as any).mozCaptureStream = (frameRate: number) =>
        new MockMediaStream(`moz-stream-${frameRate}`);

      const stream = service.captureCanvasStream(canvasWithMoz as any, 30);

      expect(stream.id).toBe("moz-stream-30");
    });
  });

  describe("validateCanvas", () => {
    it("should validate proper canvas", () => {
      const isValid = service.validateCanvas(mockCanvas as any);
      expect(isValid).toBe(true);
    });

    it("should reject null canvas", () => {
      const isValid = service.validateCanvas(null as any);
      expect(isValid).toBe(false);
    });

    it("should reject canvas with zero dimensions", () => {
      mockCanvas.width = 0;
      const isValid = service.validateCanvas(mockCanvas as any);
      expect(isValid).toBe(false);
    });

    it("should reject hidden canvas", () => {
      global.window.getComputedStyle = vi.fn().mockReturnValue({
        display: "none",
        visibility: "visible",
      });

      const isValid = service.validateCanvas(mockCanvas as any);
      expect(isValid).toBe(false);
    });

    it("should reject invisible canvas", () => {
      global.window.getComputedStyle = vi.fn().mockReturnValue({
        display: "block",
        visibility: "hidden",
      });

      const isValid = service.validateCanvas(mockCanvas as any);
      expect(isValid).toBe(false);
    });
  });

  describe("getCanvasInfo", () => {
    it("should return canvas information", () => {
      const info = service.getCanvasInfo(mockCanvas as any);

      expect(info.width).toBe(800);
      expect(info.height).toBe(600);
      expect(info.contextType).toBe("MockContext");
      expect(typeof info.isAnimated).toBe("boolean");
    });

    it("should handle canvas without context", () => {
      const canvasWithoutContext = {
        ...mockCanvas,
        getContext: () => null,
      };

      const info = service.getCanvasInfo(canvasWithoutContext as any);

      expect(info.contextType).toBeNull();
    });
  });

  describe("waitForCanvasReady", () => {
    it("should resolve immediately for ready canvas", async () => {
      const isReady = await service.waitForCanvasReady(mockCanvas as any, 1000);
      expect(isReady).toBe(true);
    });

    it("should timeout for invalid canvas", async () => {
      const invalidCanvas = new MockCanvas();
      invalidCanvas.width = 0;

      const isReady = await service.waitForCanvasReady(
        invalidCanvas as any,
        100
      );
      expect(isReady).toBe(false);
    });

    it("should wait for canvas to become ready", async () => {
      const canvas = new MockCanvas();
      canvas.width = 0;

      // Make canvas ready after a delay
      setTimeout(() => {
        canvas.width = 800;
        canvas.height = 600;
      }, 50);

      const isReady = await service.waitForCanvasReady(canvas as any, 200);
      expect(isReady).toBe(true);
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle canvas with complex parent hierarchy", () => {
      const canvas = new MockCanvas("", "");
      const parent1 = new MockElement("", "");
      const parent2 = new MockElement("shader-wrapper", "");
      const parent3 = new MockElement("", "demo-container");

      canvas.parentElement = parent1;
      parent1.parentElement = parent2;
      parent2.parentElement = parent3;

      mockDocument.querySelectorAll.mockReturnValue([canvas]);

      const found = service.findShaderToyCanvas();
      expect(found).toBe(canvas);
    });

    it("should handle canvas toDataURL errors gracefully", () => {
      const canvasWithError = new MockCanvas();
      canvasWithError.toDataURL = () => {
        throw new Error("Canvas is tainted");
      };

      const info = service.getCanvasInfo(canvasWithError as any);
      expect(info.isAnimated).toBe(true); // Should assume animated on error
    });

    it("should handle multiple canvas elements", () => {
      const canvas1 = new MockCanvas("", "regular-canvas");
      canvas1.width = 100; // Make it small so it doesn't match
      canvas1.height = 100;

      const canvas2 = new MockCanvas("demogl", "shader-canvas");
      const canvas3 = new MockCanvas("", "another-canvas");
      canvas3.width = 100; // Make it small so it doesn't match
      canvas3.height = 100;

      mockDocument.querySelectorAll.mockReturnValue([
        canvas1,
        canvas2,
        canvas3,
      ]);

      const found = service.findShaderToyCanvas();
      expect(found).toBe(canvas2); // Should find the ShaderToy one
    });
  });
});
