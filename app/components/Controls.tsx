'use client'

import { InteractionMode } from './CanvasViewer'

interface ControlsProps {
  yLevel: number
  onYLevelChange: (level: number) => void
  minY: number
  maxY: number
  zoom: number
  onZoomChange: (zoom: number) => void
  viewMode: '2d' | '3d'
  onViewModeChange: (mode: '2d' | '3d') => void
  interactionMode: InteractionMode
  onInteractionModeChange: (mode: InteractionMode) => void
}

export default function Controls({
  yLevel,
  onYLevelChange,
  minY,
  maxY,
  zoom,
  onZoomChange,
  viewMode,
  onViewModeChange,
  interactionMode,
  onInteractionModeChange,
}: ControlsProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">View Mode</label>
        <div className="flex gap-2">
          <button
            onClick={() => onViewModeChange('2d')}
            className={`flex-1 px-4 py-2 rounded ${
              viewMode === '2d'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            2D
          </button>
          <button
            onClick={() => onViewModeChange('3d')}
            className={`flex-1 px-4 py-2 rounded ${
              viewMode === '3d'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            3D
          </button>
        </div>
      </div>

      {viewMode === '2d' && (
        <div>
          <label className="block text-sm font-medium mb-2">Interaction Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => onInteractionModeChange('move')}
              className={`flex-1 px-4 py-2 rounded ${
                interactionMode === 'move'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Move
            </button>
            <button
              onClick={() => onInteractionModeChange('select')}
              className={`flex-1 px-4 py-2 rounded ${
                interactionMode === 'select'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Select
            </button>
          </div>
        </div>
      )}

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
          disabled={viewMode === '3d'}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0.5x</span>
          <span>4x</span>
        </div>
        {viewMode === '3d' && (
          <p className="text-xs text-gray-500 mt-1">Use mouse to zoom in 3D view</p>
        )}
      </div>

      <div className="text-sm text-gray-400 border-t border-gray-700 pt-4">
        <p className="mb-1">Controls:</p>
        {viewMode === '2d' ? (
          <ul className="text-xs space-y-1">
            {interactionMode === 'move' ? (
              <>
                <li>• Click and drag to pan</li>
                <li>• Mouse wheel to zoom</li>
                <li>• Slider to change Y-level</li>
              </>
            ) : (
              <>
                <li>• Click 4 points to create selection</li>
                <li>• Set Y range and export when done</li>
                <li>• Clear to start over</li>
              </>
            )}
          </ul>
        ) : (
          <ul className="text-xs space-y-1">
            <li>• Left click + drag to rotate</li>
            <li>• Right click + drag to pan</li>
            <li>• Mouse wheel to zoom</li>
            <li>• Slider to change Y-level</li>
          </ul>
        )}
      </div>
    </div>
  )
}
