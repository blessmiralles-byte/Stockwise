'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeScannerState, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, CameraOff, Flashlight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onError?: (error: string) => void
  className?: string
  id?: string
}

// Restrict decoding to the formats a contractor actually scans. Fewer formats
// = faster, more reliable reads (the decoder isn't guessing across everything).
const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
]

export function BarcodeScanner({ onScan, onError, className, id = 'qr-reader' }: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  // The camera the user explicitly picked via the switch button. When null we
  // always target the rear camera by facingMode (so re-scans never drift to the
  // front camera just because it happens to be first in the device list).
  const [preferredCamId, setPreferredCamId] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannedRef = useRef(false)

  // Don't enumerate cameras on mount — on mobile that prompts for permission
  // before the user asks to scan, and often returns an empty list until
  // permission is granted anyway. We enumerate *after* a successful start.
  useEffect(() => {
    return () => { stopScanner() }
  }, [])

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState()
        if (state === Html5QrcodeScannerState.SCANNING ||
            state === Html5QrcodeScannerState.PAUSED) {
          await scannerRef.current.stop()
        }
      } catch {}
      // Remove any DOM html5-qrcode injected so React can own the empty div again
      try { scannerRef.current.clear() } catch {}
      scannerRef.current = null
    }
    setScanning(false)
    setTorchOn(false)
    setTorchAvailable(false)
    scannedRef.current = false
  }

  // Wide, short scan window suits 1D barcodes (which are much wider than tall).
  const qrbox = (vw: number, vh: number) => {
    const edge = Math.floor(Math.min(vw, vh) * 0.85)
    return { width: edge, height: Math.floor(edge * 0.5) }
  }

  const startScanner = async (overrideCamId?: string) => {
    if (!window.isSecureContext) {
      setError('Camera scanning needs a secure (https) connection.')
      return
    }

    setError(null)
    scannedRef.current = false

    const scanner = new Html5Qrcode(id, {
      formatsToSupport: BARCODE_FORMATS,
      // Use the browser's native, hardware-accelerated barcode detector where
      // available (Android Chrome) — far faster and more reliable than the
      // bundled decoder. Falls back automatically when unsupported (iOS Safari).
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    })
    scannerRef.current = scanner

    const onSuccess = (decodedText: string) => {
      if (!scannedRef.current) {
        scannedRef.current = true
        try { navigator.vibrate?.(60) } catch {}
        onScan(decodedText)
        stopScanner()
      }
    }

    // Best-effort continuous autofocus — sharper frames mean fewer retries.
    const focus = { advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints

    // If the user explicitly picked a camera, honour it. Otherwise force the
    // rear camera, then soft-prefer it for devices (laptops) with no rear cam.
    const camId = overrideCamId ?? preferredCamId ?? undefined
    const chain: MediaTrackConstraints[] = camId
      ? [{ deviceId: { exact: camId } }]
      : [{ facingMode: { exact: 'environment' } }, { facingMode: 'environment' }]

    let lastErr: any = null
    for (const base of chain) {
      const videoConstraints: MediaTrackConstraints = { ...base, ...focus }
      try {
        await scanner.start(
          { facingMode: 'environment' }, // ignored — videoConstraints below wins
          { fps: 15, qrbox, videoConstraints },
          onSuccess,
          () => {},
        )
        setScanning(true)

        // Surface a torch toggle when the running camera supports it.
        try {
          const caps = scanner.getRunningTrackCapabilities() as any
          setTorchAvailable(!!caps?.torch)
        } catch { setTorchAvailable(false) }

        // Permission is granted now — enumerate so the switch button can appear.
        if (!cameras.length) {
          Html5Qrcode.getCameras().then(d => { if (d.length) setCameras(d) }).catch(() => {})
        }
        return
      } catch (err) {
        lastErr = err
        try { await scanner.stop() } catch {}
      }
    }

    // Every attempt failed — surface a helpful message.
    const raw = String(lastErr?.name || lastErr?.message || '')
    const msg = /NotAllowed|Permission|denied/i.test(raw)
      ? 'Camera permission denied. Enable camera access for this site in your browser settings, then try again.'
      : /NotFound|no camera|OverconstrainedError/i.test(raw)
      ? 'No camera available on this device. You can type the barcode instead.'
      : (lastErr?.message || 'Could not start the camera. You can type the barcode instead.')
    setError(msg)
    onError?.(msg)
    scannerRef.current = null
    setScanning(false)
  }

  const switchCamera = async () => {
    if (cameras.length < 2) return
    const curIdx = preferredCamId ? cameras.findIndex(c => c.id === preferredCamId) : -1
    const next   = cameras[(curIdx + 1) % cameras.length]
    setPreferredCamId(next.id)
    await stopScanner()
    startScanner(next.id)
  }

  const toggleTorch = async () => {
    if (!scannerRef.current) return
    const next = !torchOn
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative w-full max-w-sm">
        {/* html5-qrcode injects a <video> into this node and manages its DOM.
            It MUST have no React-rendered children, or React's reconciliation
            (e.g. removing a conditional placeholder) collides with the library
            and throws removeChild — crashing the page. Keep it empty. */}
        <div
          id={id}
          className={cn(
            'w-full rounded-2xl overflow-hidden bg-slate-900',
            scanning ? 'min-h-[280px]' : 'min-h-[200px]'
          )}
        />

        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 p-8 pointer-events-none">
            <CameraOff className="w-12 h-12 opacity-30" />
            <p className="text-sm">Camera inactive</p>
          </div>
        )}

        {scanning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-64 h-28">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-indigo-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-indigo-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-indigo-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-indigo-400 rounded-br" />
              <div className="absolute inset-x-4 top-1/2 h-0.5 bg-indigo-400/60 animate-pulse" />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      <div className="flex gap-2">
        {!scanning ? (
          <Button onClick={() => startScanner()} className="gap-2">
            <Camera className="w-4 h-4" />
            Start Scanner
          </Button>
        ) : (
          <>
            <Button onClick={stopScanner} variant="outline" className="gap-2">
              <CameraOff className="w-4 h-4" />
              Stop
            </Button>
            {torchAvailable && (
              <Button
                onClick={toggleTorch}
                variant={torchOn ? 'default' : 'outline'}
                size="icon"
                aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
              >
                <Flashlight className="w-4 h-4" />
              </Button>
            )}
            {cameras.length > 1 && (
              <Button onClick={switchCamera} variant="outline" size="icon" aria-label="Switch camera">
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Point the rear camera at a barcode — hold steady about 15–20&nbsp;cm away
      </p>
    </div>
  )
}
