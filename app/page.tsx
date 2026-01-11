'use client'

import { useState } from 'react'
import FileUpload from './components/FileUpload'
import CanvasViewer from './components/CanvasViewer'
import Controls from './components/Controls'
import { parseRegionFiles, RegionData } from './utils/mcaParser'

export default function Home() {
  const [regionData, setRegionData] = useState<RegionData | null>(null)
  const [yLevel, setYLevel] = useState(64)
  const [zoom, setZoom] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [useServer, setUseServer] = useState(true)

  const handleFilesLoad = async (files: { name: string; data: ArrayBuffer }[]) => {
    setIsLoading(true)
    try {
      const data = await parseRegionFiles(files)
      console.log('[CLIENT] Parsed data:', data)
      console.log('[CLIENT] First chunk topBlocks sample:', data.chunks[0]?.topBlocks)
      console.log('[CLIENT] First 5 blocks:', Array.from(data.chunks[0]?.topBlocks.entries() || []).slice(0, 5))
      
      // Debug: Check multiple chunks for block variety
      const allBlockTypes = new Set<string>()
      for (let i = 0; i < Math.min(10, data.chunks.length); i++) {
        for (const [key, blockName] of data.chunks[i].topBlocks.entries()) {
          allBlockTypes.add(blockName)
        }
      }
      console.log('[CLIENT] Unique block types in first 10 chunks:', Array.from(allBlockTypes))
      
      setRegionData(data)
      setYLevel(Math.floor((data.minY + data.maxY) / 2))
    } catch (error) {
      console.error('Error parsing region files:', error)
      alert('Error parsing region files. See console for details.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleServerLoad = async (file: File) => {
    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/parse-regions', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Server parsing failed')
      }

      const data = await response.json()
      
      console.log('[CLIENT] Sample chunk from server:', data.chunks[0])
      console.log('[CLIENT] Sample topBlocks array:', data.chunks[0]?.topBlocks)
      console.log('[CLIENT] Blocks entries sample:', data.chunks[0]?.topBlocks.slice(0, 5))
      
      // Convert topBlocks array back to Map
      const chunksWithMaps = data.chunks.map((chunk: any) => ({
        x: chunk.x,
        z: chunk.z,
        topBlocks: new Map(chunk.topBlocks)
      }))
      
      console.log('[CLIENT] Sample chunk after Map conversion:', chunksWithMaps[0])
      console.log('[CLIENT] Map size:', chunksWithMaps[0]?.topBlocks.size)
      console.log('[CLIENT] First 5 blocks from Map:', Array.from(chunksWithMaps[0]?.topBlocks.entries() || []).slice(0, 5))

      setRegionData({
        chunks: chunksWithMaps,
        minX: data.minX,
        maxX: data.maxX,
        minZ: data.minZ,
        maxZ: data.maxZ,
        minY: data.minY,
        maxY: data.maxY,
      })
      setYLevel(Math.floor((data.minY + data.maxY) / 2))
    } catch (error) {
      console.error('Error parsing region files:', error)
      alert('Error parsing region files. See console for details.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Minecraft 2D Viewer</h1>
        
        {!regionData ? (
          <div className="max-w-2xl mx-auto mt-20">
            <FileUpload 
              onFilesLoad={handleFilesLoad}
              onServerLoad={handleServerLoad}
              useServer={useServer}
              onToggleMode={setUseServer}
            />
            {isLoading && (
              <div className="text-center mt-4 text-gray-400">
                Loading and parsing region files...
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 h-[600px]">
              <CanvasViewer
                regionData={regionData}
                yLevel={yLevel}
                zoom={zoom}
                onZoomChange={setZoom}
              />
            </div>
            <div className="lg:col-span-1">
              <Controls
                yLevel={yLevel}
                onYLevelChange={setYLevel}
                minY={regionData.minY}
                maxY={regionData.maxY}
                zoom={zoom}
                onZoomChange={setZoom}
              />
              <button
                onClick={() => {
                  setRegionData(null)
                  setYLevel(64)
                  setZoom(1)
                }}
                className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded transition"
              >
                Load Different Files
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
