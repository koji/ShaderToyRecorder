// Test setup file for vitest
import { vi } from "vitest";
import "@testing-library/jest-dom";

// Mock Chrome APIs globally
const mockChrome = {
  tabs: {
    query: vi.fn(),
    get: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  tabCapture: {
    getMediaStreamId: vi.fn(),
    getCapturedTabs: vi.fn(),
  },
  permissions: {
    contains: vi.fn(),
    request: vi.fn(),
  },
  runtime: {
    sendMessage: vi.fn(),
    lastError: null,
  },
  offscreen: {
    createDocument: vi.fn(),
    closeDocument: vi.fn(),
    hasDocument: vi.fn(),
  },
};

Object.defineProperty(global, "chrome", {
  value: mockChrome,
  writable: true,
});

// Mock MediaStream and related APIs
global.MediaStream = vi.fn(() => ({
  getAudioTracks: vi.fn(() => []),
  getVideoTracks: vi.fn(() => []),
  addTrack: vi.fn(),
  removeTrack: vi.fn(),
})) as any;

global.MediaRecorder = vi.fn() as any;
