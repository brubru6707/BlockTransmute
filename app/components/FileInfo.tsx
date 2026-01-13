'use client'

import { RegionData } from '../utils/mcaParser'

interface FileInfoProps {
  regionData: RegionData
  fileNames?: string[]
}

export default function FileInfo({ regionData, fileNames }: FileInfoProps) {
  // Gather block type statistics
  const blockTypes = new Map<string, number>()
  regionData.chunks.forEach(chunk => {
    chunk.topBlocks.forEach((blockName) => {
      blockTypes.set(blockName, (blockTypes.get(blockName) || 0) + 1)
    })
  })

  const sortedBlocks = Array.from(blockTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20) // Top 20 block types

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <h2 className="text-xl font-bold border-b border-gray-700 pb-2">File Information</h2>
      
      {/* File Names */}
      {fileNames && fileNames.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-300 mb-2">Uploaded Files ({fileNames.length})</h3>
          <div className="max-h-32 overflow-y-auto bg-gray-900 rounded p-2 text-sm">
            {fileNames.map((name, idx) => (
              <div key={idx} className="text-gray-400 font-mono">{name}</div>
            ))}
          </div>
        </div>
      )}

      {/* Region Stats */}
      <div>
        <h3 className="font-semibold text-gray-300 mb-2">Region Statistics</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-gray-900 rounded p-2">
            <div className="text-gray-400">Chunks Loaded</div>
            <div className="text-xl font-bold text-blue-400">{regionData.chunks.length}</div>
          </div>
          <div className="bg-gray-900 rounded p-2">
            <div className="text-gray-400">Total Blocks</div>
            <div className="text-xl font-bold text-green-400">
              {regionData.chunks.reduce((sum, c) => sum + c.topBlocks.size, 0)}
            </div>
          </div>
          <div className="bg-gray-900 rounded p-2">
            <div className="text-gray-400">X Range</div>
            <div className="text-lg font-mono">{regionData.minX} → {regionData.maxX}</div>
          </div>
          <div className="bg-gray-900 rounded p-2">
            <div className="text-gray-400">Z Range</div>
            <div className="text-lg font-mono">{regionData.minZ} → {regionData.maxZ}</div>
          </div>
          <div className="bg-gray-900 rounded p-2">
            <div className="text-gray-400">Y Range</div>
            <div className="text-lg font-mono">{regionData.minY} → {regionData.maxY}</div>
          </div>
          <div className="bg-gray-900 rounded p-2">
            <div className="text-gray-400">Block Types</div>
            <div className="text-xl font-bold text-purple-400">{blockTypes.size}</div>
          </div>
        </div>
      </div>

      {/* Top Blocks */}
      <div>
        <h3 className="font-semibold text-gray-300 mb-2">Top Block Types</h3>
        <div className="max-h-64 overflow-y-auto bg-gray-900 rounded p-2">
          {sortedBlocks.map(([blockName, count], idx) => (
            <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-800 last:border-0">
              <span className="text-sm font-mono text-gray-300">{blockName}</span>
              <span className="text-sm text-gray-400">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
