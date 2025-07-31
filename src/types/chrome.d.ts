// Additional Chrome API type definitions
// Extending the base @types/chrome package

declare namespace chrome {
  namespace offscreen {
    interface CreateParameters {
      url: string;
      reasons: string[];
      justification: string;
    }

    function createDocument(parameters: CreateParameters): Promise<void>;
    function closeDocument(): Promise<void>;
    function hasDocument(): Promise<boolean>;
  }

  namespace tabCapture {
    interface CaptureOptions {
      targetTabId?: number;
      consumerTabId?: number;
    }

    interface CaptureInfo {
      tabId: number;
      status: "pending" | "active" | "stopped" | "error";
      fullscreen: boolean;
    }

    function getMediaStreamId(options: CaptureOptions): Promise<string>;
    function getCapturedTabs(): Promise<CaptureInfo[]>;
  }

  namespace scripting {
    interface InjectionTarget {
      tabId: number;
      frameIds?: number[];
      documentIds?: string[];
      allFrames?: boolean;
    }

    interface ScriptInjection {
      target: InjectionTarget;
      files?: string[];
      func?: Function;
      args?: any[];
      world?: "ISOLATED" | "MAIN";
    }

    function executeScript(injection: ScriptInjection): Promise<any[]>;
  }

  namespace permissions {
    interface PermissionRequest {
      permissions?: string[];
      origins?: string[];
    }

    function request(permissions: PermissionRequest): Promise<boolean>;
    function contains(permissions: PermissionRequest): Promise<boolean>;
    function remove(permissions: PermissionRequest): Promise<boolean>;
  }
}

// Extension-specific message types
export interface ExtensionMessage {
  type: string;
  payload?: any;
  tabId?: number;
  timestamp?: number;
}

export interface RecordingMessage extends ExtensionMessage {
  type:
    | "start-recording"
    | "stop-recording"
    | "recording-status"
    | "recording-error";
  payload: {
    streamId?: string;
    error?: string;
    status?: string;
    duration?: number;
  };
}

export interface ContentScriptMessage extends ExtensionMessage {
  type: "canvas-found" | "canvas-lost" | "stream-ready" | "stream-error";
  payload: {
    canvasId?: string;
    streamId?: string;
    error?: string;
  };
}
