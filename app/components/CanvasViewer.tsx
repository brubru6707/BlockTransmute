'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { RegionData } from '../utils/mcaParser'
import { getBlockColor } from '../utils/blockColors'

export type InteractionMode = 'move' | 'select'

interface CanvasViewerProps {
  regionData: RegionData | null
  yLevel: number
  zoom: number
  onZoomChange: (zoom: number) => void
  onBlocksFound?: (blocks: Set<string>) => void
  interactionMode: InteractionMode
}

export default function CanvasViewer({
  regionData,
  yLevel,
  zoom,
  onZoomChange,
  onBlocksFound,
  interactionMode,
}: CanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [selectionPoints, setSelectionPoints] = useState<{ x: number; y: number }[]>([])
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number } | null>(null)
  const [minYExport, setMinYExport] = useState<number>(0)
  const [maxYExport, setMaxYExport] = useState<number>(0)

  // Update Y export range when regionData changes
  useEffect(() => {
    if (regionData) {
      setMinYExport(regionData.minY)
      setMaxYExport(regionData.maxY)
    }
  }, [regionData])

  useEffect(() => {
    const renderStart = performance.now()
    console.log('[CANVAS] === Starting render ===')
    console.log(`[CANVAS] Y-level: ${yLevel}, Zoom: ${zoom.toFixed(2)}, Pan: (${pan.x}, ${pan.y})`)
    
    if (!regionData || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
    console.log(`[CANVAS] Canvas size: ${canvas.width}x${canvas.height}`)

    // Clear canvas
    const clearStart = performance.now()
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    console.log(`[CANVAS] Clear took ${(performance.now() - clearStart).toFixed(2)}ms`)

    // Calculate world dimensions
    const worldWidth = regionData.maxX - regionData.minX
    const worldHeight = regionData.maxZ - regionData.minZ
    console.log(`[CANVAS] World size: ${worldWidth}x${worldHeight}`)

    // Calculate scale to fit the world in the canvas
    const scaleX = (canvas.width * 0.8) / worldWidth
    const scaleY = (canvas.height * 0.8) / worldHeight
    const baseScale = Math.min(scaleX, scaleY)
    const scale = baseScale * zoom
    console.log(`[CANVAS] Scale: ${scale.toFixed(4)}`)

    // Center the world
    const offsetX = canvas.width / 2 - (worldWidth * scale) / 2 + pan.x
    const offsetY = canvas.height / 2 - (worldHeight * scale) / 2 + pan.y

    let blocksRendered = 0
    let blocksSkipped = 0
    let chunksRendered = 0
    let chunksSkipped = 0
    const renderBlocksStart = performance.now()
    
    // Track all unique blocks found
    const uniqueBlocks = new Set<string>()
    
    // Debug: Sample some block names
    let blockNameSamples = new Set<string>()
    let sampleCount = 0

    // Render chunks
    for (const chunk of regionData.chunks) {
      // Chunk-level culling: calculate chunk screen bounds
      const chunkWorldX = chunk.x * 16
      const chunkWorldZ = chunk.z * 16
      const chunkScreenX = (chunkWorldX - regionData.minX) * scale + offsetX
      const chunkScreenY = (chunkWorldZ - regionData.minZ) * scale + offsetY
      const chunkScreenSize = 16 * scale

      // Skip entire chunk if it's completely outside viewport
      if (chunkScreenX + chunkScreenSize < 0 || chunkScreenX > canvas.width ||
          chunkScreenY + chunkScreenSize < 0 || chunkScreenY > canvas.height) {
        chunksSkipped++
        blocksSkipped += 256 // All blocks in chunk
        continue
      }

      chunksRendered++

      // Render each block in the chunk - use pre-computed top blocks
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          const xzKey = `${x},${z}`
          const blockName = chunk.topBlocks.get(xzKey)
          
          // Skip if no block found
          if (!blockName) {
            blocksSkipped++
            continue
          }
          
          // Track unique blocks
          uniqueBlocks.add(blockName)
          
          // Sample block names for debugging
          if (sampleCount < 20) {
            blockNameSamples.add(blockName)
            sampleCount++
          }

          const worldX = chunk.x * 16 + x
          const worldZ = chunk.z * 16 + z
          const screenX = (worldX - regionData.minX) * scale + offsetX
          const screenY = (worldZ - regionData.minZ) * scale + offsetY

          // Skip blocks outside viewport (fine-grained culling)
          if (screenX + scale < 0 || screenX > canvas.width ||
              screenY + scale < 0 || screenY > canvas.height) {
            blocksSkipped++
            continue
          }

          const color = getBlockColor(blockName)

          ctx.fillStyle = color
          ctx.fillRect(
            Math.floor(screenX),
            Math.floor(screenY),
            Math.ceil(scale) || 1,
            Math.ceil(scale) || 1
          )
          blocksRendered++
        }
      }
    }

    const renderBlocksTime = performance.now() - renderBlocksStart
    console.log(`[CANVAS] Sample block names:`, Array.from(blockNameSamples))
    console.log(`[CANVAS] Chunks: ${chunksRendered} rendered, ${chunksSkipped} skipped`)
    console.log(`[CANVAS] Blocks: ${blocksRendered} rendered, ${blocksSkipped} skipped`)
    console.log(`[CANVAS] Block rendering took ${renderBlocksTime.toFixed(2)}ms`)
    
    // Notify parent of blocks found
    if (onBlocksFound && uniqueBlocks.size > 0) {
      onBlocksFound(uniqueBlocks)
    }

    // Draw loading message if no chunks
    if (regionData.chunks.length === 0) {
      ctx.fillStyle = '#666666'
      ctx.font = '20px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('No chunks loaded', canvas.width / 2, canvas.height / 2)
    }

    // Calculate and display center coordinates
    const centerScreenX = canvas.width / 2
    const centerScreenY = canvas.height / 2
    const centerWorldX = Math.floor((centerScreenX - offsetX) / scale + regionData.minX)
    const centerWorldZ = Math.floor((centerScreenY - offsetY) / scale + regionData.minZ)

    // Draw coordinates overlay at center
    const coordText = `X: ${centerWorldX}, Z: ${centerWorldZ}`
    ctx.font = '14px "Press Start 2P", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Draw background for text
    const textMetrics = ctx.measureText(coordText)
    const padding = 8
    const bgX = centerScreenX - textMetrics.width / 2 - padding
    const bgY = centerScreenY - 14 - padding
    const bgWidth = textMetrics.width + padding * 2
    const bgHeight = 28 + padding * 2
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight)
    
    // Draw text
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(coordText, centerScreenX, centerScreenY)

    // Draw selection quadrilateral if in select mode
    if (interactionMode === 'select') {
      // Draw completed quadrilateral
      if (selectionPoints.length === 4) {
        ctx.strokeStyle = '#00FF00'
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'
        ctx.lineWidth = 2
        
        ctx.beginPath()
        ctx.moveTo(selectionPoints[0].x, selectionPoints[0].y)
        ctx.lineTo(selectionPoints[1].x, selectionPoints[1].y)
        ctx.lineTo(selectionPoints[2].x, selectionPoints[2].y)
        ctx.lineTo(selectionPoints[3].x, selectionPoints[3].y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else if (selectionPoints.length > 0) {
        // Draw partial selection
        ctx.strokeStyle = '#FFFF00'
        ctx.lineWidth = 2
        
        ctx.beginPath()
        ctx.moveTo(selectionPoints[0].x, selectionPoints[0].y)
        for (let i = 1; i < selectionPoints.length; i++) {
          ctx.lineTo(selectionPoints[i].x, selectionPoints[i].y)
        }
        if (hoveredPoint) {
          ctx.lineTo(hoveredPoint.x, hoveredPoint.y)
        }
        ctx.stroke()
      }
      
      // Draw selection points
      selectionPoints.forEach((point, index) => {
        ctx.fillStyle = '#FFFF00'
        ctx.beginPath()
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 1
        ctx.stroke()
        
        // Draw point label
        ctx.fillStyle = '#FFFFFF'
        ctx.font = '12px Arial'
        ctx.fillText(`${index + 1}`, point.x + 8, point.y - 8)
      })
    }

    const totalRenderTime = performance.now() - renderStart
    console.log(`[CANVAS] === Total render time: ${totalRenderTime.toFixed(2)}ms ===\n`)
  }, [regionData, yLevel, zoom, pan, interactionMode, selectionPoints, hoveredPoint])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (interactionMode === 'move') {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    } else if (interactionMode === 'select') {
      const canvas = canvasRef.current
      if (!canvas) return
      
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      
      if (selectionPoints.length < 4) {
        setSelectionPoints([...selectionPoints, { x, y }])
      } else {
        // Reset selection if clicking after completing quadrilateral
        setSelectionPoints([{ x, y }])
      }
    }
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (interactionMode === 'move' && isDragging) {
      e.preventDefault()
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    } else if (interactionMode === 'select') {
      const canvas = canvasRef.current
      if (!canvas) return
      
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      
      if (selectionPoints.length > 0 && selectionPoints.length < 4) {
        setHoveredPoint({ x, y })
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsDragging(false)
    e.preventDefault()
  }

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newZoom = Math.max(0.5, Math.min(4, zoom + delta))
    onZoomChange(newZoom)
  }, [zoom, onZoomChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  const exportSelection = useCallback(() => {
    if (!regionData || selectionPoints.length !== 4 || !canvasRef.current) {
      alert('Please complete a quadrilateral selection first')
      return
    }

    if (minYExport > maxYExport) {
      alert('Min Y level cannot be greater than Max Y level')
      return
    }

    const canvas = canvasRef.current
    const worldWidth = regionData.maxX - regionData.minX
    const worldHeight = regionData.maxZ - regionData.minZ
    const scaleX = (canvas.width * 0.8) / worldWidth
    const scaleY = (canvas.height * 0.8) / worldHeight
    const baseScale = Math.min(scaleX, scaleY)
    const scale = baseScale * zoom
    const offsetX = canvas.width / 2 - (worldWidth * scale) / 2 + pan.x
    const offsetY = canvas.height / 2 - (worldHeight * scale) / 2 + pan.y

    // Convert screen coordinates to world coordinates
    const worldPoints = selectionPoints.map(point => ({
      x: Math.floor((point.x - offsetX) / scale + regionData.minX),
      z: Math.floor((point.y - offsetY) / scale + regionData.minZ)
    }))

    // Find blocks within quadrilateral
    const selectedBlocks: Array<{ x: number, z: number, y: number, block: string }> = []
    
    // Get bounds of quadrilateral
    const minX = Math.min(...worldPoints.map(p => p.x))
    const maxX = Math.max(...worldPoints.map(p => p.x))
    const minZ = Math.min(...worldPoints.map(p => p.z))
    const maxZ = Math.max(...worldPoints.map(p => p.z))

    // Check each block in bounds if it's inside quadrilateral
    for (const chunk of regionData.chunks) {
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          const worldX = chunk.x * 16 + x
          const worldZ = chunk.z * 16 + z
          
          if (worldX < minX || worldX > maxX || worldZ < minZ || worldZ > maxZ) continue
          
          // Check if point is inside quadrilateral
          if (isPointInPolygon(
            { x: worldX, z: worldZ },
            worldPoints
          )) {
            const xzKey = `${x},${z}`
            const blockName = chunk.topBlocks.get(xzKey)
            if (blockName) {
              // Add blocks for each Y level in range
              for (let y = minYExport; y <= maxYExport; y++) {
                selectedBlocks.push({
                  x: worldX,
                  z: worldZ,
                  y: y,
                  block: blockName // Note: This is the top block, not actual block at each Y
                })
              }
            }
          }
        }
      }
    }

    // Export data as JSON
    const exportData = {
      selection: {
        type: 'quadrilateral',
        worldCoordinates: worldPoints,
        yRange: {
          min: minYExport,
          max: maxYExport
        }
      },
      blocks: selectedBlocks,
      summary: {
        totalBlocks: selectedBlocks.length,
        uniqueBlockTypes: new Set(selectedBlocks.map(b => b.block)).size,
        yLevels: maxYExport - minYExport + 1
      }
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `selection_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [regionData, selectionPoints, zoom, pan, minYExport, maxYExport])

  // Helper function to check if point is inside polygon using ray casting
  const isPointInPolygon = (
    point: { x: number; z: number },
    vertices: { x: number; z: number }[]
  ): boolean => {
    let inside = false
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x
      const zi = vertices[i].z
      const xj = vertices[j].x
      const zj = vertices[j].z
      
      const intersect = ((zi > point.z) !== (zj > point.z)) &&
        (point.x < (xj - xi) * (point.z - zi) / (zj - zi) + xi)
      
      if (intersect) inside = !inside
    }
    return inside
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${
          interactionMode === 'move' ? 'cursor-move' : 'cursor-crosshair'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ touchAction: 'none' }}
      />
      {interactionMode === 'select' && (
        <div className="absolute top-4 right-4 flex flex-col gap-2 max-w-xs">
          <div className="bg-gray-800 px-3 py-2 rounded text-sm">
            {selectionPoints.length === 0 && 'Click 4 points to create a quadrilateral'}
            {selectionPoints.length === 1 && 'Click 3 more points'}
            {selectionPoints.length === 2 && 'Click 2 more points'}
            {selectionPoints.length === 3 && 'Click 1 more point'}
            {selectionPoints.length === 4 && 'Selection complete!'}
          </div>
          {selectionPoints.length > 0 && (
            <button
              onClick={() => setSelectionPoints([])}
              className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm transition"
            >
              Clear Selection
            </button>
          )}
          {selectionPoints.length === 4 && regionData && (
            <div className="bg-gray-800 px-3 py-2 rounded space-y-2">
              <div className="text-xs font-medium text-gray-300">Export Y Range:</div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Min:</label>
                <input
                  type="number"
                  value={minYExport}
                  onChange={(e) => setMinYExport(Number(e.target.value))}
                  min={regionData.minY}
                  max={regionData.maxY}
                  className="w-20 bg-gray-700 text-white px-2 py-1 rounded text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Max:</label>
                <input
                  type="number"
                  value={maxYExport}
                  onChange={(e) => setMaxYExport(Number(e.target.value))}
                  min={regionData.minY}
                  max={regionData.maxY}
                  className="w-20 bg-gray-700 text-white px-2 py-1 rounded text-xs"
                />
              </div>
              <button
                onClick={exportSelection}
                className="w-full bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm transition"
              >
                Export Selection
              </button>
            </div>
          )}
        </div>
      )}
      {!regionData && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          No region data loaded
        </div>
      )}
    </div>
  )
}
