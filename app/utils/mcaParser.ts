import * as pako from 'pako'
import * as nbt from 'prismarine-nbt'

export interface ChunkData {
  x: number
  z: number
  topBlocks: Map<string, string> // key: "x,z", value: blockName (highest non-air block)
}

export interface RegionData {
  chunks: ChunkData[]
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  minY: number
  maxY: number
}

// Parse a single .mca file
export async function parseMCAFile(data: ArrayBuffer, filename: string): Promise<ChunkData[]> {
  console.log(`\n=== Parsing ${filename} ===`)
  console.log(`File size: ${data.byteLength} bytes`)
  
  if (data.byteLength < 8192) {
    console.error(`File too small: ${data.byteLength} bytes (need at least 8KB for headers)`)
    return []
  }

  const view = new DataView(data)
  const chunks: ChunkData[] = []

  // Extract region coordinates from filename (e.g., r.0.0.mca)
  const match = filename.match(/r\.(-?\d+)\.(-?\d+)\.mca/)
  const regionX = match ? parseInt(match[1]) : 0
  const regionZ = match ? parseInt(match[2]) : 0
  console.log(`Region coordinates: X=${regionX}, Z=${regionZ}`)

  let validChunks = 0
  let parsedChunks = 0

  // Read chunk locations from header (first 4KB)
  for (let chunkIndex = 0; chunkIndex < 1024; chunkIndex++) {
    try {
      const headerOffset = chunkIndex * 4
      if (headerOffset + 4 > data.byteLength) {
        console.error(`Header offset ${headerOffset} exceeds file size`)
        break
      }

      const offset = view.getUint32(headerOffset, false)
      const sectorOffset = (offset >> 8) * 4096
      const sectorCount = offset & 0xFF

      if (sectorOffset === 0) continue // Chunk doesn't exist
      
      validChunks++

      if (sectorOffset + 5 > data.byteLength) {
        console.warn(`Chunk ${chunkIndex}: sector offset ${sectorOffset} exceeds file size ${data.byteLength}`)
        continue
      }

      // Read chunk data
      const length = view.getUint32(sectorOffset, false)
      const compressionType = view.getUint8(sectorOffset + 4)

      if (sectorOffset + 5 + length - 1 > data.byteLength) {
        console.warn(`Chunk ${chunkIndex}: data extends beyond file (offset: ${sectorOffset}, length: ${length})`)
        continue
      }

      if (compressionType !== 2) {
        console.warn(`Chunk ${chunkIndex}: unsupported compression type ${compressionType}`)
        continue
      }

      // Decompress chunk data
      const compressedData = new Uint8Array(data, sectorOffset + 5, length - 1)
      const decompressed = pako.inflate(compressedData)

      // Parse NBT data
      const chunkX = (chunkIndex % 32) + regionX * 32
      const chunkZ = Math.floor(chunkIndex / 32) + regionZ * 32

      try {
        const { parsed } = await nbt.parse(Buffer.from(decompressed))
        const chunk: ChunkData = {
          x: chunkX,
          z: chunkZ,
          topBlocks: parseChunkTopBlocks(parsed, chunkX, chunkZ),
        }
        chunks.push(chunk)
        parsedChunks++
      } catch (nbtError) {
        console.warn(`Chunk ${chunkIndex}: NBT parse error`, nbtError)
      }
    } catch (error) {
      console.warn(`Failed to parse chunk ${chunkIndex}:`, error)
    }
  }

  console.log(`Valid chunks in header: ${validChunks}`)
  console.log(`Successfully parsed: ${parsedChunks}`)
  console.log(`=== End parsing ${filename} ===\n`)

  return chunks
}

// Parse top blocks from NBT chunk data (highest non-air block at each X,Z)
function parseChunkTopBlocks(chunkData: any, chunkX: number, chunkZ: number): Map<string, string> {
  const topBlockMap = new Map<string, {y: number, blockName: string}>()
  
  // Navigate to sections array
  const sections = chunkData?.value?.sections?.value?.value || chunkData?.value?.Level?.value?.Sections?.value?.value
  
  if (!sections || !Array.isArray(sections)) {
    return new Map<string, string>()
  }
  
  for (const section of sections) {
    const sectionValue = section.value || section
    
    // Robust Y-parsing: Handle object wrappers and primitive values
    let sectionY = sectionValue.Y?.value ?? sectionValue.y?.value ?? sectionValue.Y ?? sectionValue.y ?? 0
    if (typeof sectionY === 'object') sectionY = 0 

    const yOffset = sectionY * 16
    
    // Get block states (Support both 1.16+ naming 'block_states' and older 'BlockStates')
    const blockStates = sectionValue.block_states?.value || sectionValue.BlockStates?.value
    if (!blockStates) continue

    // Get palette
    const palette = blockStates.palette?.value?.value || blockStates.Palette?.value?.value
    if (!palette || !Array.isArray(palette)) continue

    // Extract block names from palette
    const paletteBlocks = palette.map((entry: any) => {
      return entry.value?.Name?.value || entry.Name?.value || 'minecraft:air'
    })

    // === CASE 1: UNIFORM SECTION (Single Block) ===
    // If only 1 block type exists, the whole 16x16x16 chunk is filled with it.
    if (paletteBlocks.length === 1) {
      const blockName = paletteBlocks[0]
      if (!blockName.includes('air')) {
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
              const worldY = yOffset + y
              const xzKey = `${x},${z}`
              const currentTop = topBlockMap.get(xzKey)
              
              if (!currentTop || worldY > currentTop.y) {
                topBlockMap.set(xzKey, { y: worldY, blockName })
              }
            }
          }
        }
      }
      continue
    }

    // === CASE 2: COMPLEX SECTION (Mixed Blocks) ===
    // FIX: Robustly find the data array. Try ALL known locations.
    const dataTag = blockStates.data || blockStates.Data
    const dataArray = dataTag?.value?.value || dataTag?.value
    
    if (!dataArray || !Array.isArray(dataArray)) {
        // If we have a complex palette but no data, we cannot parse this section.
        // This log will help us confirm if we are still missing data.
        // console.warn(`[DEBUG] Skipped complex section at Y=${sectionY} (Palette=${paletteBlocks.length}, No Data Found)`)
        continue
    }

    // Calculate bits per block
    const bitsPerBlock = Math.max(4, Math.ceil(Math.log2(paletteBlocks.length)))
    
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          const blockIndex = (y * 16 * 16) + (z * 16) + x
          const paletteIndex = getBlockStateIndex(dataArray, blockIndex, bitsPerBlock)
          
          if (paletteIndex >= 0 && paletteIndex < paletteBlocks.length) {
            const blockName = paletteBlocks[paletteIndex]
            if (!blockName.includes('air')) {
              const worldY = yOffset + y
              const xzKey = `${x},${z}`
              const currentTop = topBlockMap.get(xzKey)
              
              if (!currentTop || worldY > currentTop.y) {
                topBlockMap.set(xzKey, { y: worldY, blockName })
              }
            }
          }
        }
      }
    }
  }

  const topBlocks = new Map<string, string>()
  for (const [xzKey, blockData] of topBlockMap.entries()) {
    topBlocks.set(xzKey, blockData.blockName)
  }
  
  return topBlocks
}

// Extract palette index from packed long array
function getBlockStateIndex(data: any[], blockIndex: number, bitsPerBlock: number): number {
  const blocksPerLong = Math.floor(64 / bitsPerBlock)
  const longIndex = Math.floor(blockIndex / blocksPerLong)
  const localIndex = blockIndex % blocksPerLong
  
  if (longIndex >= data.length) return 0
  
  const longValue = typeof data[longIndex] === 'bigint' 
    ? data[longIndex] 
    : BigInt(data[longIndex]?.value ?? data[longIndex] ?? 0)
  
  const shift = BigInt(localIndex * bitsPerBlock)
  const mask = (BigInt(1) << BigInt(bitsPerBlock)) - BigInt(1)
  
  return Number((longValue >> shift) & mask)
}

// Parse multiple region files
export async function parseRegionFiles(
  files: { name: string; data: ArrayBuffer }[]
): Promise<RegionData> {
  console.log(`\n========================================`)
  console.log(`Parsing ${files.length} region file(s)`)
  console.log(`========================================`)
  
  const allChunks: ChunkData[] = []

  for (const file of files) {
    const chunks = await parseMCAFile(file.data, file.name)
    allChunks.push(...chunks)
  }

  console.log(`\nTotal chunks parsed: ${allChunks.length}`)
  
  // Debug: Check all unique blocks across all chunks
  const allBlockTypes = new Set<string>()
  for (const chunk of allChunks) {
    for (const blockName of chunk.topBlocks.values()) {
      allBlockTypes.add(blockName)
    }
  }
  console.log(`Unique block types found: ${allBlockTypes.size}`)
  console.log(`Block types:`, Array.from(allBlockTypes).sort())

  // Calculate bounds
  let minX = Infinity, maxX = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  let minY = -64, maxY = 320

  for (const chunk of allChunks) {
    minX = Math.min(minX, chunk.x * 16)
    maxX = Math.max(maxX, chunk.x * 16 + 16)
    minZ = Math.min(minZ, chunk.z * 16)
    maxZ = Math.max(maxZ, chunk.z * 16 + 16)
  }

  console.log(`World bounds: X=${minX} to ${maxX}, Z=${minZ} to ${maxZ}`)
  console.log(`Y range: ${minY} to ${maxY}`)
  console.log(`========================================\n`)

  return {
    chunks: allChunks,
    minX,
    maxX,
    minZ,
    maxZ,
    minY,
    maxY,
  }
}