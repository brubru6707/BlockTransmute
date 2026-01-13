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

// Optimized: Scan from Sky to Bedrock with Early Exit
function parseChunkTopBlocks(chunkData: any, chunkX: number, chunkZ: number): Map<string, string> {
  const topBlocks = new Map<string, string>() // Final results stored here immediately
  
  // 1. Get Sections safely
  const sections = chunkData?.value?.sections?.value?.value || chunkData?.value?.Level?.value?.Sections?.value?.value
  if (!sections || !Array.isArray(sections)) return topBlocks

  // 2. Sort Sections Descending (Highest Y first)
  // We scan from the sky down so we can stop searching as soon as we hit a block.
  const sortedSections = sections.slice().sort((a: any, b: any) => {
    const aY = (a.value || a).Y?.value ?? (a.value || a).y?.value ?? 0
    const bY = (b.value || b).Y?.value ?? (b.value || b).y?.value ?? 0
    return bY - aY // Descending sort (e.g., 15, 14, ... -4)
  })

  // 3. Track columns we have already solved (0-255 linear index for 16x16 chunk)
  // A simple integer array is much faster than checking a Set or Map repeatedly.
  // 0 = empty/air so far, 1 = found a top block
  const completedColumns = new Uint8Array(256) 
  let columnsFound = 0

  for (const section of sortedSections) {
    // Optimization: If we have found a top block for every single X,Z pixel, 
    // we can stop parsing this chunk entirely! No need to read bedrock/caves.
    if (columnsFound === 256) break 

    const sectionValue = section.value || section
    let sectionY = sectionValue.Y?.value ?? sectionValue.y?.value ?? 0
    if (typeof sectionY === 'object') sectionY = 0
    const yOffset = sectionY * 16

    // Get Palette/States
    const blockStates = sectionValue.block_states?.value || sectionValue.BlockStates?.value
    if (!blockStates) continue

    const palette = blockStates.palette?.value?.value || blockStates.Palette?.value?.value
    if (!palette || !Array.isArray(palette)) continue

    const paletteBlocks = palette.map((entry: any) => 
      entry.value?.Name?.value || entry.Name?.value || 'minecraft:air'
    )

    // === CASE 1: UNIFORM SECTION (Single Block Type) ===
    if (paletteBlocks.length === 1) {
      const blockName = paletteBlocks[0]
      if (blockName.includes('air')) continue // Whole section is air, skip it

      // Whole section is solid. Fill in any gaps in our map.
      // We assume the highest point in this solid section is the top (y=15).
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const colIndex = (z * 16) + x
          
          // SPEED CHECK: Only process if we haven't found this column yet
          if (completedColumns[colIndex] === 0) {
            const worldY = yOffset + 15 
            const xzKey = `${x},${z}`
            
            topBlocks.set(xzKey, blockName)
            completedColumns[colIndex] = 1
            columnsFound++
          }
        }
      }
      continue
    }

    // === CASE 2: COMPLEX SECTION (Mixed Blocks) ===
    const dataTag = blockStates.data || blockStates.Data
    // Use the robust accessor that fixed your bug:
    const dataArray = dataTag?.value?.value || dataTag?.value
    if (!dataArray) continue

    const bitsPerBlock = Math.max(4, Math.ceil(Math.log2(paletteBlocks.length)))
    
    // Iterate Y from 15 down to 0 (Top of section to bottom)
    for (let y = 15; y >= 0; y--) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          
          const colIndex = (z * 16) + x
          
          // SPEED CHECK: Skip expensive bitwise math if we already know this column
          if (completedColumns[colIndex] === 1) continue 

          const blockIndex = (y * 16 * 16) + (z * 16) + x
          const paletteIndex = getBlockStateIndex(dataArray, blockIndex, bitsPerBlock)
          
          if (paletteIndex >= 0 && paletteIndex < paletteBlocks.length) {
            const blockName = paletteBlocks[paletteIndex]
            
            if (!blockName.includes('air')) {
              const worldY = yOffset + y
              const xzKey = `${x},${z}`
              
              topBlocks.set(xzKey, blockName)
              completedColumns[colIndex] = 1
              columnsFound++
            }
          }
        }
      }
    }
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