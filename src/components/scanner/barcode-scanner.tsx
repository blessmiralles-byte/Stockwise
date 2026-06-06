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

  useEffect(() => {
    Html5Qrcode.getCameras()
      .then(devices => {
        if (devices.length) setCameras(devices)
      })
      .catch(() => {})

    return () => {
      stopScanner()
    }
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
      scannerRef.current = null
    }
    setScanning(false)
    scannedRef.current = false
  }

  const startScanner = async () => {
    if (!cameras.length) {
      setError('No camera found. Please allow camera access.')
      return
    }

    setError(null)
    scannedRef.current = false

    const scanner = new Html5Qrcode(id)
    scannerRef.current = scanner

    try {
      await scanner.start(
        cameras[activeCameraIdx]?.id || { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 120 } },
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
    } catch (err: any) {
      setError(err?.message || 'Failed to start camera')
      onError?.(err?.message)
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
        <div
          id={id}
          className={cn(
            'w-full rounded-2xl overflow-hidden bg-slate-900',
            scanning ? 'min-h-[280px]' : 'min-h-[200px] flex items-center justify-center'
          )}
        >
          {!scanning && (
            <div className="flex flex-col items-center gap-3 text-slate-500 p-8">
              <CameraOff className="w-12 h-12 opacity-30" />
              <p className="text-sm">Camera inactive</p>
            </div>
          )}
        </div>

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
