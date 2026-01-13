'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { RegionData } from '../utils/mcaParser'
import { getBlockColor } from '../utils/blockColors'

interface CanvasViewerProps {
  regionData: RegionData | null
  yLevel: number
  zoom: number
  onZoomChange: (zoom: number) => void
  onBlocksFound?: (blocks: Set<string>) => void
}

export default function CanvasViewer({
  regionData,
  yLevel,
  zoom,
  onZoomChange,
  onBlocksFound,
}: CanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

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

    const totalRenderTime = performance.now() - renderStart
    console.log(`[CANVAS] === Total render time: ${totalRenderTime.toFixed(2)}ms ===\n`)
  }, [regionData, yLevel, zoom, pan])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
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

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ touchAction: 'none' }}
      />
      {!regionData && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          No region data loaded
        </div>
      )}
    </div>
  )
}
