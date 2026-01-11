'use client'

interface ControlsProps {
  yLevel: number
  onYLevelChange: (level: number) => void
  minY: number
  maxY: number
  zoom: number
  onZoomChange: (zoom: number) => void
}

export default function Controls({
  yLevel,
  onYLevelChange,
  minY,
  maxY,
  zoom,
  onZoomChange,
}: ControlsProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">
          Y-Level: {yLevel}
        </label>
        <input
          type="range"
          min={minY}
          max={maxY}
          value={yLevel}
          onChange={(e) => onYLevelChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{minY}</span>
          <span>{maxY}</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Zoom: {zoom.toFixed(1)}x
        </label>
        <input
          type="range"
          min="0.5"
          max="4"
          step="0.1"
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0.5x</span>
          <span>4x</span>
        </div>
      </div>

      <div className="text-sm text-gray-400 border-t border-gray-700 pt-4">
        <p className="mb-1">Controls:</p>
        <ul className="text-xs space-y-1">
          <li>• Click and drag to pan</li>
          <li>• Mouse wheel to zoom</li>
          <li>• Slider to change Y-level</li>
        </ul>
      </div>
    </div>
  )
}
