let mediaRecorder;
let recordedBlobs = [];

function startRecording() {
  const canvas = document.getElementById("demogl");
  if (!canvas) {
    alert("Canvas not found!");
    return;
  }

  const stream = canvas.captureStream(60);
  recordedBlobs = [];

  // Try different MIME types in order of preference
  const mimeTypes = [
    'video/mp4',
    'video/webm;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm'
  ];

  let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
  console.log('Using MIME type:', selectedMimeType);

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: selectedMimeType,
    videoBitsPerSecond: 5000000 // 5 Mbps
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedBlobs.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    if (recordedBlobs.length === 0) {
      console.error("No data was recorded");
      return;
    }

    try {
      const blob = new Blob(recordedBlobs, { type: selectedMimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;

      // Create timestamp string
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19);

      // Use .mp4 extension regardless of actual format for better compatibility
      a.download = `shadertoy-recording_${timestamp}.mp4`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        stream.getTracks().forEach(track => track.stop());
      }, 100);
    } catch (error) {
      console.error("Error saving video:", error);
      alert("Error saving video. Please try again.");
    }
  };

  // Request data every 100ms for smoother recording
  mediaRecorder.start(100);
  console.log("Recording started...");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    console.log("Recording stopped.");
  }
}
