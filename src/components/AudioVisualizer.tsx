import React, { useEffect, useRef, useState } from "react";
import { AudioVisualizerProps } from "../types/components";
import "./AudioVisualizer.css";

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioStream,
  isActive,
  width = 200,
  height = 60,
  barCount = 20,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Initialize audio analysis
  useEffect(() => {
    if (!audioStream || !isActive) {
      stopAnalyzing();
      return;
    }

    startAnalyzing();
    return () => stopAnalyzing();
  }, [audioStream, isActive]);

  const startAnalyzing = async () => {
    try {
      if (!audioStream) return;

      // Create audio context
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const audioContext = audioContextRef.current;

      // Create analyzer node
      analyzerRef.current = audioContext.createAnalyser();
      analyzerRef.current.fftSize = 256;
      analyzerRef.current.smoothingTimeConstant = 0.8;

      // Create source from stream
      sourceRef.current = audioContext.createMediaStreamSource(audioStream);
      sourceRef.current.connect(analyzerRef.current);

      // Small delay to show loading state, then start analyzing
      setTimeout(() => {
        setIsAnalyzing(true);
        animate();
      }, 100);
    } catch (error) {
      console.error("Failed to start audio analysis:", error);
      setIsAnalyzing(false);
    }
  };

  const stopAnalyzing = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyzerRef.current = null;
    setIsAnalyzing(false);

    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const animate = () => {
    if (!analyzerRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const analyzer = analyzerRef.current;
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyzer.getByteFrequencyData(dataArray);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw frequency bars
    const barWidth = canvas.width / barCount;
    const barSpacing = 1;
    const actualBarWidth = barWidth - barSpacing;

    for (let i = 0; i < barCount; i++) {
      // Sample frequency data
      const dataIndex = Math.floor((i / barCount) * bufferLength);
      const barHeight = (dataArray[dataIndex] / 255) * canvas.height;

      // Calculate color based on frequency intensity
      const intensity = dataArray[dataIndex] / 255;
      const hue = 120 - intensity * 120; // Green to red
      const saturation = 70 + intensity * 30; // 70% to 100%
      const lightness = 40 + intensity * 20; // 40% to 60%

      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

      const x = i * barWidth;
      const y = canvas.height - barHeight;

      ctx.fillRect(x, y, actualBarWidth, barHeight);
    }

    // Continue animation
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  }, [width, height]);

  const getVisualizerClass = () => {
    const baseClass = "audio-visualizer";
    const activeClass =
      isActive && isAnalyzing
        ? "audio-visualizer--active"
        : "audio-visualizer--inactive";
    return `${baseClass} ${activeClass} ${className}`.trim();
  };

  return (
    <div className={getVisualizerClass()} data-testid="audio-visualizer">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="audio-visualizer__canvas"
        data-testid="audio-visualizer-canvas"
        aria-label={
          isActive && isAnalyzing
            ? "Audio level visualization"
            : "Audio visualization inactive"
        }
      />

      {!isActive && (
        <div
          className="audio-visualizer__placeholder"
          data-testid="audio-visualizer-placeholder"
        >
          <span className="audio-visualizer__placeholder-icon">🔇</span>
          <span className="audio-visualizer__placeholder-text">No Audio</span>
        </div>
      )}

      {isActive && !isAnalyzing && (
        <div
          className="audio-visualizer__loading"
          data-testid="audio-visualizer-loading"
        >
          <span className="audio-visualizer__loading-icon">⏳</span>
          <span className="audio-visualizer__loading-text">
            Initializing...
          </span>
        </div>
      )}
    </div>
  );
};

export default AudioVisualizer;
