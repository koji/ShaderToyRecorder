// FileService for handling file generation, downloads, and format management

import { FileService as IFileService } from "../types";

export class FileService implements IFileService {
  private readonly DEFAULT_MAX_SIZE_MB = 500; // 500MB default limit

  /**
   * Generates a timestamped filename with the specified extension
   */
  generateFileName(extension: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

    const cleanExtension = extension.startsWith(".")
      ? extension
      : `.${extension}`;
    return `shadertoy-recording_${timestamp}${cleanExtension}`;
  }

  /**
   * Generates a filename with custom prefix and timestamp
   */
  generateFileNameWithPrefix(prefix: string, extension: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const cleanExtension = extension.startsWith(".")
      ? extension
      : `.${extension}`;
    const cleanPrefix = prefix.replace(/[^a-zA-Z0-9-_]/g, "_");

    return `${cleanPrefix}_${timestamp}${cleanExtension}`;
  }

  /**
   * Downloads a blob as a file with the specified filename
   */
  downloadBlob(blob: Blob, filename: string): void {
    try {
      // Create object URL
      const url = URL.createObjectURL(blob);

      // Create temporary download link
      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download = filename;
      downloadLink.style.display = "none";

      // Add to DOM, click, and remove
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Clean up object URL
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Failed to download file:", error);
      throw new Error(
        `Failed to download file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Downloads a blob with automatic filename generation
   */
  downloadBlobWithAutoName(blob: Blob, extension: string = "webm"): void {
    const filename = this.generateFileName(extension);
    this.downloadBlob(blob, filename);
  }

  /**
   * Validates file size against maximum allowed size
   */
  validateFileSize(blob: Blob, maxSizeMB?: number): boolean {
    const maxSize = (maxSizeMB || this.DEFAULT_MAX_SIZE_MB) * 1024 * 1024; // Convert to bytes
    return blob.size <= maxSize;
  }

  /**
   * Gets human-readable file size string
   */
  getFileSizeString(blob: Blob): string {
    const bytes = blob.size;

    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Estimates recording file size based on duration and bitrate
   */
  estimateFileSize(
    durationMs: number,
    videoBitsPerSecond: number,
    audioBitsPerSecond: number = 128000
  ): number {
    const durationSeconds = durationMs / 1000;
    const totalBitsPerSecond = videoBitsPerSecond + audioBitsPerSecond;
    const totalBits = totalBitsPerSecond * durationSeconds;
    return Math.ceil(totalBits / 8); // Convert to bytes
  }

  /**
   * Gets the appropriate file extension for a MIME type
   */
  getExtensionFromMimeType(mimeType: string): string {
    const mimeToExtension: Record<string, string> = {
      "video/webm": "webm",
      "video/mp4": "mp4",
      "video/avi": "avi",
      "video/mov": "mov",
      "video/quicktime": "mov",
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/wav": "wav",
      "audio/mp3": "mp3",
    };

    // Extract base MIME type (remove codecs)
    const baseMimeType = mimeType.split(";")[0].toLowerCase();

    return mimeToExtension[baseMimeType] || "webm";
  }

  /**
   * Creates a download with progress tracking
   */
  async downloadBlobWithProgress(
    blob: Blob,
    filename: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");

        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.style.display = "none";

        // Simulate progress for user feedback
        if (onProgress) {
          let progress = 0;
          const progressInterval = setInterval(() => {
            progress += 10;
            onProgress(Math.min(progress, 90));

            if (progress >= 90) {
              clearInterval(progressInterval);
            }
          }, 50);

          // Complete progress after download starts
          setTimeout(() => {
            clearInterval(progressInterval);
            onProgress(100);
          }, 500);
        }

        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        setTimeout(() => {
          URL.revokeObjectURL(url);
          resolve();
        }, 100);
      } catch (error) {
        reject(
          new Error(
            `Failed to download file: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          )
        );
      }
    });
  }

  /**
   * Validates that a filename is safe for download
   */
  validateFileName(filename: string): boolean {
    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(filename)) {
      return false;
    }

    // Check length
    if (filename.length > 255) {
      return false;
    }

    // Check for reserved names (Windows)
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    const nameWithoutExt = filename.split(".")[0];
    if (reservedNames.test(nameWithoutExt)) {
      return false;
    }

    return true;
  }

  /**
   * Sanitizes a filename by removing or replacing invalid characters
   */
  sanitizeFileName(filename: string): string {
    // Replace invalid characters with underscores
    let sanitized = filename.replace(/[<>:"/\\|?*]/g, "_");

    // Limit length
    if (sanitized.length > 255) {
      const extension = sanitized.split(".").pop() || "";
      const nameWithoutExt = sanitized.substring(0, 255 - extension.length - 1);
      sanitized = `${nameWithoutExt}.${extension}`;
    }

    // Handle reserved names
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    const nameWithoutExt = sanitized.split(".")[0];
    if (reservedNames.test(nameWithoutExt)) {
      sanitized = `file_${sanitized}`;
    }

    return sanitized;
  }

  /**
   * Checks if the browser supports file downloads
   */
  isDownloadSupported(): boolean {
    return (
      typeof document !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    );
  }

  /**
   * Gets MIME type information and browser support
   */
  getMimeTypeInfo(mimeType: string): {
    extension: string;
    isSupported: boolean;
    description: string;
  } {
    const extension = this.getExtensionFromMimeType(mimeType);
    const isSupported =
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(mimeType);

    const descriptions: Record<string, string> = {
      "video/webm": "WebM Video",
      "video/mp4": "MP4 Video",
      "audio/webm": "WebM Audio",
      "audio/mp4": "MP4 Audio",
    };

    const baseMimeType = mimeType.split(";")[0];
    const description = descriptions[baseMimeType] || "Unknown Format";

    return {
      extension,
      isSupported,
      description,
    };
  }
}

// Export singleton instance
export const fileService = new FileService();
