let recordingStarted = false;
let startTime;

document.getElementById("start").onclick = async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Inject the script
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });

  // Start recording
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => startRecording(),
  });

  document.getElementById("stop").disabled = false;
  document.getElementById("start").disabled = true;

  startTime = Date.now();
  recordingStarted = true;
  updateTimer();
};

document.getElementById("stop").onclick = async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => stopRecording(),
  });

  recordingStarted = false;
  document.getElementById("stop").disabled = true;
  document.getElementById("start").disabled = false;

  // Close the popup window
  window.close();
};

function updateTimer() {
  const timerEl = document.getElementById("duration");
  const interval = setInterval(() => {
    if (!recordingStarted) {
      clearInterval(interval);
      timerEl.textContent = "Duration: 00:00";
      return;
    }
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    timerEl.textContent = `Duration: ${minutes}:${seconds}`;
  }, 1000);
}
