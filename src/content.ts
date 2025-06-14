// Declare a global interface to define what we expect on the window object.
// This helps with type safety if these functions were ever called from within the same content script context,
// or if other scripts in the same context needed to interact with them.
// For chrome.scripting.executeScript, this mainly serves as a clear definition of the contract.
declare global {
  interface Window {
    startRecording: () => Promise<void>;
    stopRecording: () => void;
  }
}

let mediaRecorder: MediaRecorder | null = null;
let recordedBlobs: Blob[] = [];

async function startRecording(): Promise<void> {
  const canvas = document.getElementById("demogl") as HTMLCanvasElement | null;
  if (!canvas) {
    alert("Canvas element with ID 'demogl' not found!");
    console.error("Canvas element with ID 'demogl' not found!");
    return;
  }

  let audioStream: MediaStream | null = null;
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Audio stream obtained successfully.");
  } catch (err) {
    console.error("Could not get audio stream:", err);
    alert(
      "Could not get audio stream. Recording video only. Error: " +
        (err instanceof Error ? err.message : String(err))
    );
    // Proceeding with video-only recording.
  }

  const videoStream: MediaStream = canvas.captureStream(60); // FPS
  console.log("Video stream captured from canvas.");
  recordedBlobs = []; // Resetting blobs for new recording

  const tracksToCombine: MediaStreamTrack[] = [...videoStream.getTracks()];
  if (audioStream) {
    tracksToCombine.push(...audioStream.getTracks());
    console.log("Audio tracks added to combined stream.");
  } else {
    console.warn(
      "Proceeding with video-only recording as audio stream was not available or permission denied."
    );
  }

  if (tracksToCombine.length === 0) {
    alert("No tracks available for recording. Cannot start MediaRecorder.");
    console.error("No tracks available for recording.");
    // Ensure any obtained streams are stopped if we can't proceed
    videoStream.getTracks().forEach(track => track.stop());
    if (audioStream) audioStream.getTracks().forEach(track => track.stop());
    return;
  }

  const combinedStream = new MediaStream(tracksToCombine);

  const mimeTypes = [
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', // H.264 video, AAC audio
    'video/webm; codecs="vp9, opus"',             // VP9 video, Opus audio
    'video/webm; codecs="vp8, opus"',             // VP8 video, Opus audio
    'video/webm; codecs="h264, opus"',           // H.264 video, Opus audio (less common for webm)
    'video/mp4',                                  // MP4 with default codecs (browser dependent)
    'video/webm',                                 // WebM with default codecs (browser dependent)
  ];

  const selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
  if (!selectedMimeType) {
    alert("No suitable MIME type found for MediaRecorder.");
    console.error("No suitable MIME type found from the preferred list.");
    // Stop tracks as MediaRecorder cannot be initialized
    combinedStream.getTracks().forEach(track => track.stop());
    return;
  }
  console.log('Using MIME type:', selectedMimeType);

  try {
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 5000000, // 5 Mbps for video
      audioBitsPerSecond: audioStream ? 128000 : undefined, // 128 kbps for audio if present
    });
  } catch (e) {
    alert("Failed to create MediaRecorder: " + (e instanceof Error ? e.message : String(e)));
    console.error("Failed to create MediaRecorder:", e);
    combinedStream.getTracks().forEach(track => track.stop());
    return;
  }


  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      recordedBlobs.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    console.log("MediaRecorder stopped.");
    if (recordedBlobs.length === 0) {
      console.warn("No data was recorded.");
      // Tracks are stopped in the finally block below or if saving is attempted
    } else {
      try {
        const blob = new Blob(recordedBlobs, { type: selectedMimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;

        const now = new Date();
        const timestamp = now.toISOString()
          .replace(/[:.]/g, '-') // Replace colons and periods
          .replace('T', '_')      // Replace T with underscore
          .slice(0, 19);        // Get YYYY-MM-DD_HH-MM-SS

        // Prefer .mp4 extension for broader compatibility, even if it's a WebM file.
        // Some systems handle .webm in .mp4 container better, or users expect .mp4.
        // Alternatively, use selectedMimeType to determine extension.
        let fileExtension = ".mp4";
        if (selectedMimeType.startsWith('video/webm')) {
            fileExtension = ".webm";
        }
        a.download = `shadertoy-recording_${timestamp}${fileExtension}`;

        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log("Download link revoked and element removed.");
        }, 100); // Delay to ensure download initiation
      } catch (error) {
        console.error("Error saving video:", error);
        alert("Error saving video. Please try again. Check console for details.");
      }
    }
    // Regardless of saving success or failure, or if there were no blobs, stop tracks.
    // This was moved from a finally block to ensure it happens after all blob processing.
    combinedStream.getTracks().forEach(track => track.stop());
    console.log("All tracks stopped (onstop).");
    mediaRecorder = null; // Reset mediaRecorder instance
  };

  mediaRecorder.onerror = (event: Event) => { // MediaRecorderErrorEvent is not standard
    const errorEvent = event as any; // Cast to any to access potential 'error' property
    console.error('MediaRecorder error:', errorEvent.error || event);
    alert('MediaRecorder error. Recording cannot continue. Check console for details.');
    combinedStream.getTracks().forEach(track => track.stop());
    console.log("All tracks stopped (MediaRecorder error).");
    mediaRecorder = null; // Reset mediaRecorder instance
  };

  mediaRecorder.start(100); // Request data every 100ms for smoother recording
  console.log("Recording started (attempting audio and video)...");
}

function stopRecording(): void {
  if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
    mediaRecorder.stop();
    console.log("Stop recording signal sent to MediaRecorder.");
    // Actual track stopping and cleanup is handled in mediaRecorder.onstop or .onerror
  } else {
    console.warn("stopRecording called but mediaRecorder not active or not initialized properly.");
  }
}

// Expose functions to the window object for access from popup
window.startRecording = startRecording;
window.stopRecording = stopRecording;
console.log("startRecording and stopRecording functions exposed to window object.");
