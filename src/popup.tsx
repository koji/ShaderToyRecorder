import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

// Define the shape of the state stored in chrome.storage.local
interface RecordingStorageState {
  recordingState?: 'recording' | 'stopped';
  recordingStartTime?: number;
}

// Define the expected global functions on the content script's window object
// This helps in typing the `func` property of `chrome.scripting.executeScript` more accurately,
// even though the function itself is stringified and re-evaluated in the content script.
declare global {
  interface Window {
    startRecording: () => Promise<void>; // Assuming startRecording is async
    stopRecording: () => void;
  }
}

const Popup: React.FC = () => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<string>("00:00");
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  // Effect to get the current tab ID once when the popup opens
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        setCurrentTabId(tabs[0].id);
      } else {
        console.error("Could not get active tab ID.");
      }
    });
  }, []);

  // Effect to restore recording state from storage when the popup opens or tab ID changes
  useEffect(() => {
    if (!currentTabId) return; // Don't do anything if we don't have a tab ID

    chrome.storage.local.get(['recordingState', 'recordingStartTime'], (result: RecordingStorageState) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting recording state from storage:", chrome.runtime.lastError);
        return;
      }
      if (result.recordingState === 'recording' && result.recordingStartTime) {
        // To accurately reflect the recording state, we should also consider which tab was being recorded.
        // For this extension, we assume recording is global or tied to the ShaderToy tab.
        // If the popup is reopened on the same tab that is being recorded, restore state.
        // A more complex check might involve storing the tabId with the recording state.
        setIsRecording(true);
        setStartTime(result.recordingStartTime);
      } else {
        // If state is 'stopped' or undefined, ensure UI reflects that.
        setIsRecording(false);
        setStartTime(null);
      }
    });
  }, [currentTabId]); // Rerun if currentTabId changes

  // Effect for updating the timer display
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    if (isRecording && startTime) {
      intervalId = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
        const seconds = String(elapsedSeconds % 60).padStart(2, "0");
        setDuration(`${minutes}:${seconds}`);
      }, 1000);
    } else {
      setDuration("00:00"); // Reset duration if not recording or startTime is null
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isRecording, startTime]);

  const handleStart = useCallback(async () => {
    if (!currentTabId) {
      console.error("No active tab ID found to start recording.");
      alert("Error: Could not identify the active tab to start recording.");
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: () => window.startRecording(), // This function is defined in content.ts
      });
      const now = Date.now();
      setIsRecording(true);
      setStartTime(now);
      chrome.storage.local.set({ recordingState: 'recording', recordingStartTime: now }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error setting recording state in storage:", chrome.runtime.lastError);
        }
      });
    } catch (error) {
      console.error("Error executing startRecording script or setting state:", error);
      alert("Failed to start recording. Check console for details.");
    }
  }, [currentTabId]);

  const handleStop = useCallback(async () => {
    if (!currentTabId) {
      console.error("No active tab ID found to stop recording.");
      // Although popup might close, good to log if this happens.
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: () => window.stopRecording(), // This function is defined in content.ts
      });
      setIsRecording(false);
      setStartTime(null); // Reset start time
      chrome.storage.local.set({ recordingState: 'stopped', recordingStartTime: null }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error setting recording state to 'stopped' in storage:", chrome.runtime.lastError);
        }
      });
      window.close(); // Close popup after stopping
    } catch (error) {
      console.error("Error executing stopRecording script or setting state:", error);
      // Don't alert here as popup is closing, but log it.
    }
  }, [currentTabId]);

  return (
    <div style={{ width: '220px', padding: '15px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
      <h3 style={{ marginTop: '0px', marginBottom: '15px' }}>Shader Recorder</h3>
      <button onClick={handleStart} disabled={isRecording || !currentTabId} style={{ width: '100%', padding: '10px', marginBottom: '10px', fontSize: '16px', cursor: 'pointer' }}>
        🎥 Start Recording
      </button>
      <button onClick={handleStop} disabled={!isRecording || !currentTabId} style={{ width: '100%', padding: '10px', marginBottom: '15px', fontSize: '16px', cursor: 'pointer' }}>
        🛑 Stop Recording
      </button>
      <p style={{ fontSize: '16px', margin: '0' }}>Duration: {duration}</p>
    </div>
  );
};

// Ensure the root element exists in popup.html
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.render(<Popup />, rootElement);
} else {
  console.error("Target 'root' element not found in popup.html for ReactDOM.render().");
}
