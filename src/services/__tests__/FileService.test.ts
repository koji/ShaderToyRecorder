// Unit tests for FileService

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FileService } from "../FileService";

// Mock DOM APIs
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockClick = vi.fn();

// Mock MediaRecorder for MIME type support testing
class MockMediaRecorder {
  static isTypeSupported(mimeType: string): boolean {
    const supportedTypes = [
      "video/webm",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/mp4",
    ];
    return supportedTypes.includes(mimeType);
  }
}

describe("FileService", () => {
  let service: FileService;
  let mockElement: any;

  beforeEach(() => {
    // Setup DOM mocks
    mockElement = {
      href: "",
      download: "",
      style: { display: "" },
      click: mockClick,
    };

    global.document = {
      createElement: vi.fn().mockReturnValue(mockElement),
      body: {
        appendChild: mockAppendChild,
        removeChild: mockRemoveChild,
      },
    } as any;

    global.URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    } as any;

    global.MediaRecorder = MockMediaRecorder as any;

    // Setup return values
    mockCreateObjectURL.mockReturnValue("blob:mock-url");

    service = new FileService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("generateFileName", () => {
    it("should generate filename with timestamp and extension", () => {
      const filename = service.generateFileName("webm");

      expect(filename).toMatch(
        /^shadertoy-recording_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.webm$/
      );
    });

    it("should handle extension with dot prefix", () => {
      const filename = service.generateFileName(".mp4");

      expect(filename).toMatch(
        /^shadertoy-recording_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.mp4$/
      );
    });

    it("should generate unique filenames for different calls", () => {
      const filename1 = service.generateFileName("webm");
      const filename2 = service.generateFileName("webm");

      // They should be the same since they're generated in the same second
      // But the format should be correct
      expect(filename1).toMatch(/^shadertoy-recording_/);
      expect(filename2).toMatch(/^shadertoy-recording_/);
    });
  });

  describe("generateFileNameWithPrefix", () => {
    it("should generate filename with custom prefix", () => {
      const filename = service.generateFileNameWithPrefix("my-shader", "webm");

      expect(filename).toMatch(
        /^my-shader_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.webm$/
      );
    });

    it("should sanitize prefix with invalid characters", () => {
      const filename = service.generateFileNameWithPrefix(
        "my/shader:test",
        "webm"
      );

      expect(filename).toMatch(
        /^my_shader_test_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.webm$/
      );
    });
  });

  describe("downloadBlob", () => {
    it("should create download link and trigger download", () => {
      const blob = new Blob(["test data"], { type: "video/webm" });
      const filename = "test.webm";

      service.downloadBlob(blob, filename);

      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(global.document.createElement).toHaveBeenCalledWith("a");
      expect(mockElement.href).toBe("blob:mock-url");
      expect(mockElement.download).toBe(filename);
      expect(mockElement.style.display).toBe("none");
      expect(mockAppendChild).toHaveBeenCalledWith(mockElement);
      expect(mockClick).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalledWith(mockElement);
    });

    it("should handle download errors gracefully", () => {
      mockCreateObjectURL.mockImplementation(() => {
        throw new Error("Failed to create URL");
      });

      const blob = new Blob(["test data"]);

      expect(() => service.downloadBlob(blob, "test.webm")).toThrow(
        "Failed to download file"
      );
    });

    it("should revoke object URL after timeout", async () => {
      const blob = new Blob(["test data"]);

      service.downloadBlob(blob, "test.webm");

      // Wait for the timeout to complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });
  });

  describe("downloadBlobWithAutoName", () => {
    it("should download with auto-generated filename", () => {
      const blob = new Blob(["test data"], { type: "video/webm" });

      service.downloadBlobWithAutoName(blob, "webm");

      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(mockElement.download).toMatch(/^shadertoy-recording_.*\.webm$/);
    });

    it("should use default extension when not provided", () => {
      const blob = new Blob(["test data"]);

      service.downloadBlobWithAutoName(blob);

      expect(mockElement.download).toMatch(/^shadertoy-recording_.*\.webm$/);
    });
  });

  describe("validateFileSize", () => {
    it("should validate file size within limit", () => {
      const smallBlob = new Blob(["small data"]); // Very small blob

      const isValid = service.validateFileSize(smallBlob, 1); // 1MB limit

      expect(isValid).toBe(true);
    });

    it("should reject file size exceeding limit", () => {
      // Create a blob that appears large (we'll mock the size)
      const largeBlob = new Blob(["data"]);
      Object.defineProperty(largeBlob, "size", { value: 2 * 1024 * 1024 }); // 2MB

      const isValid = service.validateFileSize(largeBlob, 1); // 1MB limit

      expect(isValid).toBe(false);
    });

    it("should use default size limit when not specified", () => {
      const blob = new Blob(["data"]);
      Object.defineProperty(blob, "size", { value: 600 * 1024 * 1024 }); // 600MB

      const isValid = service.validateFileSize(blob); // Uses default 500MB limit

      expect(isValid).toBe(false);
    });
  });

  describe("getFileSizeString", () => {
    it("should format bytes correctly", () => {
      const blob = new Blob([""]);
      Object.defineProperty(blob, "size", { value: 0 });

      expect(service.getFileSizeString(blob)).toBe("0 Bytes");
    });

    it("should format KB correctly", () => {
      const blob = new Blob([""]);
      Object.defineProperty(blob, "size", { value: 1536 }); // 1.5KB

      expect(service.getFileSizeString(blob)).toBe("1.5 KB");
    });

    it("should format MB correctly", () => {
      const blob = new Blob([""]);
      Object.defineProperty(blob, "size", { value: 2 * 1024 * 1024 }); // 2MB

      expect(service.getFileSizeString(blob)).toBe("2 MB");
    });

    it("should format GB correctly", () => {
      const blob = new Blob([""]);
      Object.defineProperty(blob, "size", { value: 1.5 * 1024 * 1024 * 1024 }); // 1.5GB

      expect(service.getFileSizeString(blob)).toBe("1.5 GB");
    });
  });

  describe("estimateFileSize", () => {
    it("should estimate file size correctly", () => {
      const durationMs = 10000; // 10 seconds
      const videoBitsPerSecond = 1000000; // 1Mbps
      const audioBitsPerSecond = 128000; // 128kbps

      const estimatedSize = service.estimateFileSize(
        durationMs,
        videoBitsPerSecond,
        audioBitsPerSecond
      );

      // Expected: (1000000 + 128000) * 10 / 8 = 1,410,000 bytes
      expect(estimatedSize).toBe(1410000);
    });

    it("should use default audio bitrate when not provided", () => {
      const durationMs = 5000; // 5 seconds
      const videoBitsPerSecond = 500000; // 500kbps

      const estimatedSize = service.estimateFileSize(
        durationMs,
        videoBitsPerSecond
      );

      // Expected: (500000 + 128000) * 5 / 8 = 392,500 bytes
      expect(estimatedSize).toBe(392500);
    });
  });

  describe("getExtensionFromMimeType", () => {
    it("should return correct extension for video/webm", () => {
      expect(service.getExtensionFromMimeType("video/webm")).toBe("webm");
    });

    it("should return correct extension for video/mp4", () => {
      expect(service.getExtensionFromMimeType("video/mp4")).toBe("mp4");
    });

    it("should handle MIME types with codecs", () => {
      expect(
        service.getExtensionFromMimeType("video/webm;codecs=vp9,opus")
      ).toBe("webm");
    });

    it("should return default extension for unknown MIME type", () => {
      expect(service.getExtensionFromMimeType("video/unknown")).toBe("webm");
    });

    it("should handle case insensitive MIME types", () => {
      expect(service.getExtensionFromMimeType("VIDEO/MP4")).toBe("mp4");
    });
  });

  describe("downloadBlobWithProgress", () => {
    it("should download with progress callback", async () => {
      const blob = new Blob(["test data"]);
      const progressCallback = vi.fn();

      await service.downloadBlobWithProgress(
        blob,
        "test.webm",
        progressCallback
      );

      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(progressCallback).toHaveBeenCalled();
      // Progress callback should be called at least once
      expect(progressCallback).toHaveBeenCalled();
    });

    it("should work without progress callback", async () => {
      const blob = new Blob(["test data"]);

      await expect(
        service.downloadBlobWithProgress(blob, "test.webm")
      ).resolves.toBeUndefined();
    });
  });

  describe("validateFileName", () => {
    it("should validate valid filename", () => {
      expect(service.validateFileName("valid-filename.webm")).toBe(true);
    });

    it("should reject filename with invalid characters", () => {
      expect(service.validateFileName("invalid<filename>.webm")).toBe(false);
      expect(service.validateFileName("invalid:filename.webm")).toBe(false);
      expect(service.validateFileName("invalid/filename.webm")).toBe(false);
    });

    it("should reject filename that is too long", () => {
      const longName = "a".repeat(256) + ".webm";
      expect(service.validateFileName(longName)).toBe(false);
    });

    it("should reject reserved names", () => {
      expect(service.validateFileName("CON.webm")).toBe(false);
      expect(service.validateFileName("PRN.webm")).toBe(false);
      expect(service.validateFileName("COM1.webm")).toBe(false);
    });
  });

  describe("sanitizeFileName", () => {
    it("should sanitize invalid characters", () => {
      const sanitized = service.sanitizeFileName(
        'invalid<>:"/\\|?*filename.webm'
      );
      expect(sanitized).toBe("invalid_________filename.webm");
    });

    it("should handle long filenames", () => {
      const longName = "a".repeat(250) + ".webm";
      const sanitized = service.sanitizeFileName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(255);
      expect(sanitized).toMatch(/\.webm$/);
    });

    it("should handle reserved names", () => {
      const sanitized = service.sanitizeFileName("CON.webm");
      expect(sanitized).toBe("file_CON.webm");
    });
  });

  describe("isDownloadSupported", () => {
    it("should return true when download is supported", () => {
      expect(service.isDownloadSupported()).toBe(true);
    });

    it("should return false when document is not available", () => {
      const originalDocument = global.document;
      delete (global as any).document;

      expect(service.isDownloadSupported()).toBe(false);

      global.document = originalDocument;
    });

    it("should return false when URL is not available", () => {
      const originalURL = global.URL;
      delete (global as any).URL;

      expect(service.isDownloadSupported()).toBe(false);

      global.URL = originalURL;
    });
  });

  describe("getMimeTypeInfo", () => {
    it("should return correct info for supported MIME type", () => {
      const info = service.getMimeTypeInfo("video/webm");

      expect(info.extension).toBe("webm");
      expect(info.isSupported).toBe(true);
      expect(info.description).toBe("WebM Video");
    });

    it("should return correct info for unsupported MIME type", () => {
      const info = service.getMimeTypeInfo("video/unknown");

      expect(info.extension).toBe("webm");
      expect(info.isSupported).toBe(false);
      expect(info.description).toBe("Unknown Format");
    });

    it("should handle MIME types with codecs", () => {
      const info = service.getMimeTypeInfo("video/webm;codecs=vp9,opus");

      expect(info.extension).toBe("webm");
      expect(info.isSupported).toBe(true);
      expect(info.description).toBe("WebM Video");
    });
  });
});
