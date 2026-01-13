'use client'

import { useRef, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { RegionData } from '../utils/mcaParser'
import { getBlockColor } from '../utils/blockColors'
import * as THREE from 'three'

interface Viewer3DProps {
  regionData: RegionData | null
  yLevel: number
}

function MinecraftWorld({ regionData, yLevel }: { regionData: RegionData; yLevel: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const blocks = useMemo(() => {
    if (!regionData) return []
    
    const blockList: Array<{ position: [number, number, number]; color: string }> = []
    
    // Render blocks within a range of Y levels for better 3D visibility
    const yRange = 5 // Show 5 levels above and below selected Y level
    
    for (const chunk of regionData.chunks) {
      const chunkWorldX = chunk.x * 16
      const chunkWorldZ = chunk.z * 16
      
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          const key = `${x},${z}`
          const blockName = chunk.topBlocks.get(key)
          
          if (blockName) {
            const worldX = chunkWorldX + x - regionData.minX
            const worldZ = chunkWorldZ + z - regionData.minZ
            const color = getBlockColor(blockName)
            
            // Add blocks at multiple Y levels for 3D effect
            for (let y = Math.max(regionData.minY, yLevel - yRange); y <= Math.min(regionData.maxY, yLevel + yRange); y++) {
              blockList.push({
                position: [worldX, y - yLevel, worldZ],
                color
              })
            }
          }
        }
      }
    }
    
    return blockList
  }, [regionData, yLevel])

  // Create instanced mesh for better performance
  const { positions, colors } = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []
    
    blocks.forEach(block => {
      positions.push(...block.position)
      
      const color = new THREE.Color(block.color)
      colors.push(color.r, color.g, color.b)
    })
    
    return { positions, colors }
  }, [blocks])

  if (blocks.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors />
      {blocks.map((block, i) => {
        const matrix = new THREE.Matrix4()
        matrix.setPosition(...block.position)
        meshRef.current?.setMatrixAt(i, matrix)
        
        const color = new THREE.Color(block.color)
        meshRef.current?.setColorAt(i, color)
        
        return null
      })}
    </instancedMesh>
  )
}

export default function Viewer3D({ regionData, yLevel }: Viewer3DProps) {
  if (!regionData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500">
        No region data loaded
      </div>
    )
  }

  const centerX = (regionData.maxX - regionData.minX) / 2
  const centerZ = (regionData.maxZ - regionData.minZ) / 2
  const worldSize = Math.max(regionData.maxX - regionData.minX, regionData.maxZ - regionData.minZ)
  
  return (
    <Canvas>
      <PerspectiveCamera makeDefault position={[centerX + worldSize, worldSize * 0.8, centerZ + worldSize]} />
      <OrbitControls target={[centerX, 0, centerZ]} />
      
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[100, 100, 100]} intensity={0.8} />
      <directionalLight position={[-100, 50, -100]} intensity={0.3} />
      
      {/* World */}
      <MinecraftWorld regionData={regionData} yLevel={yLevel} />
      
      {/* Grid helper */}
      <gridHelper args={[worldSize * 2, 50]} position={[centerX, -5, centerZ]} />
    </Canvas>
  )
}
