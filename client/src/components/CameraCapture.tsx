import { useCallback, useEffect, useRef, useState } from "react";
import "./CameraCapture.css";

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setError(null);
    } catch {
      setError("Camera access denied or unavailable. Please allow camera permissions and try again.");
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode, startCamera]);

  const handleShutter = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    setSnapshot(canvas.toDataURL("image/jpeg", 0.92));
  };

  const handleUse = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        onClose();
      },
      "image/jpeg",
      0.92
    );
  };

  const handleRetake = () => {
    setSnapshot(null);
  };

  const toggleCamera = () => {
    setSnapshot(null);
    setFacingMode((f) => (f === "environment" ? "user" : "environment"));
  };

  return (
    <div className="camera-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="camera-modal">
        <button className="camera-close" onClick={onClose} aria-label="Close camera">✕</button>

        {error ? (
          <div className="camera-error">
            <span className="camera-error-icon">📷</span>
            <p>{error}</p>
            <button className="btn-retry" onClick={() => startCamera(facingMode)}>Try again</button>
          </div>
        ) : snapshot ? (
          <div className="camera-preview">
            <img src={snapshot} alt="Captured photo" className="camera-snapshot" />
            <div className="camera-actions">
              <button className="btn-retake" onClick={handleRetake}>↩ Retake</button>
              <button className="btn-use" onClick={handleUse}>Use this photo ✓</button>
            </div>
          </div>
        ) : (
          <div className="camera-live">
            <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
            <div className="camera-controls">
              <button className="btn-flip" onClick={toggleCamera} aria-label="Flip camera">⟳</button>
              <button className="btn-shutter" onClick={handleShutter} aria-label="Take photo" />
              <div className="btn-flip-spacer" />
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="camera-canvas" />
      </div>
    </div>
  );
}
