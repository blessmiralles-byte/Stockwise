'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'
import { Camera, CameraOff, Flashlight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onError?: (error: string) => void
  className?: string
  id?: string
}

export function BarcodeScanner({ onScan, onError, className, id = 'qr-reader' }: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [activeCameraIdx, setActiveCameraIdx] = useState(0)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
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
    scannedRef.current = false
  }

  const startScanner = async () => {
    if (!window.isSecureContext) {
      setError('Camera scanning needs a secure (https) connection.')
      return
    }

    setError(null)
    scannedRef.current = false

    const scanner = new Html5Qrcode(id)
    scannerRef.current = scanner

    // Prefer a known camera id (after we've enumerated), else ask the browser
    // for the rear camera directly — this triggers the permission prompt on
    // mobile and works without a prior getCameras() call.
    const camConfig = cameras[activeCameraIdx]?.id ?? { facingMode: 'environment' as const }

    // Size the scan box to the viewfinder so small phone screens don't throw
    // "qrbox dimensions greater than the video".
    const qrbox = (vw: number, vh: number) => {
      const edge = Math.floor(Math.min(vw, vh) * 0.8)
      return { width: edge, height: Math.floor(edge * 0.55) }
    }

    try {
      await scanner.start(
        camConfig,
        { fps: 10, qrbox },
        (decodedText) => {
          if (!scannedRef.current) {
            scannedRef.current = true
            onScan(decodedText)
            stopScanner()
          }
        },
        () => {}
      )
      setScanning(true)

      // Permission is now granted — enumerate cameras so the switch button can
      // appear if there's more than one.
      if (!cameras.length) {
        Html5Qrcode.getCameras().then(d => { if (d.length) setCameras(d) }).catch(() => {})
      }
    } catch (err: any) {
      const raw = String(err?.name || err?.message || '')
      const msg = /NotAllowed|Permission|denied/i.test(raw)
        ? 'Camera permission denied. Enable camera access for this site in your browser settings, then try again.'
        : /NotFound|no camera|OverconstrainedError/i.test(raw)
        ? 'No camera available on this device. You can type the barcode instead.'
        : (err?.message || 'Could not start the camera. You can type the barcode instead.')
      setError(msg)
      onError?.(msg)
      scannerRef.current = null
    }
  }

  const switchCamera = async () => {
    await stopScanner()
    setActiveCameraIdx(prev => (prev + 1) % cameras.length)
    setTimeout(startScanner, 300)
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
          <Button onClick={startScanner} className="gap-2">
            <Camera className="w-4 h-4" />
            Start Scanner
          </Button>
        ) : (
          <>
            <Button onClick={stopScanner} variant="outline" className="gap-2">
              <CameraOff className="w-4 h-4" />
              Stop
            </Button>
            {cameras.length > 1 && (
              <Button onClick={switchCamera} variant="outline" size="icon">
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Point camera at a barcode or QR code
      </p>
    </div>
  )
}
