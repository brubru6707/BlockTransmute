import { NextRequest, NextResponse } from 'next/server'
import * as pako from 'pako'
import * as nbt from 'prismarine-nbt'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  console.log('[SERVER] === Starting region parsing ===')
  
  try {
    console.log('[SERVER] Reading form data...')
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log(`[SERVER] File received: ${file.name}, size: ${file.size} bytes`)
    console.log('[SERVER] Loading JSZip...')
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    
    console.log('[SERVER] Reading file as ArrayBuffer...')
    const arrayBuffer = await file.arrayBuffer()
    console.log(`[SERVER] ArrayBuffer size: ${arrayBuffer.byteLength} bytes`)
    
    console.log('[SERVER] Unzipping file...')
    const unzipStart = Date.now()
    const zipData = await zip.loadAsync(arrayBuffer)
    console.log(`[SERVER] Unzip took ${Date.now() - unzipStart}ms`)

    const allChunks: any[] = []
    let fileCount = 0
    let validFileCount = 0

    console.log('[SERVER] Processing .mca files in parallel...')
    const parsePromises: Promise<any[]>[] = []
    
    for (const [filename, zipEntry] of Object.entries(zipData.files)) {
      if (filename.endsWith('.mca') && !zipEntry.dir) {
        fileCount++
        
        const parseTask = (async () => {
          console.log(`[SERVER] Processing ${filename}...`)
          const fileStart = Date.now()
          
          const data = await zipEntry.async('arraybuffer')
          console.log(`[SERVER]   - File size: ${data.byteLength} bytes`)
          console.log(data)
          
          if (data.byteLength < 8192) {
            console.log(`[SERVER]   - File too small, skipping`)
            return []
          }

          const chunks = await parseMCAFile(data, filename)
          console.log(`[SERVER]   - Parsed ${chunks.length} chunks in ${Date.now() - fileStart}ms`)
          return chunks
        })()
        
        parsePromises.push(parseTask)
      }
    }

    const parallelStart = Date.now()
    const results = await Promise.all(parsePromises)
    console.log(`[SERVER] Parallel processing took ${Date.now() - parallelStart}ms`)
    
    for (const chunks of results) {
      if (chunks.length > 0) {
        validFileCount++
        allChunks.push(...chunks)
      }
    }

    console.log(`[SERVER] Processed ${validFileCount}/${fileCount} files, total chunks: ${allChunks.length}`)

    console.log(`[SERVER] Processed ${validFileCount}/${fileCount} files, total chunks: ${allChunks.length}`)

    // Calculate bounds
    console.log('[SERVER] Calculating bounds...')
    const boundsStart = Date.now()
    let minX = Infinity, maxX = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    let minY = -64, maxY = 320

    for (const chunk of allChunks) {
      minX = Math.min(minX, chunk.x * 16)
      maxX = Math.max(maxX, chunk.x * 16 + 16)
      minZ = Math.min(minZ, chunk.z * 16)
      maxZ = Math.max(maxZ, chunk.z * 16 + 16)
    }
    console.log(`[SERVER] Bounds calculated in ${Date.now() - boundsStart}ms`)

    // Convert Map to object for JSON serialization
    console.log('[SERVER] Converting data for JSON...')
    console.log('[SERVER] Sample chunk before conversion:', {
      x: allChunks[0]?.x,
      z: allChunks[0]?.z,
      topBlocksSize: allChunks[0]?.topBlocks.size,
      sampleBlocks: Array.from(allChunks[0]?.topBlocks.entries() || []).slice(0, 5)
    })
    const conversionStart = Date.now()
    const chunksData = allChunks.map(chunk => ({
      x: chunk.x,
      z: chunk.z,
      topBlocks: Array.from(chunk.topBlocks.entries())
    }))
    console.log('[SERVER] Sample chunk after conversion:', {
      x: chunksData[0]?.x,
      z: chunksData[0]?.z,
      blocksCount: chunksData[0]?.topBlocks.length,
      sampleBlocks: chunksData[0]?.topBlocks.slice(0, 5)
    })
    console.log(`[SERVER] Conversion took ${Date.now() - conversionStart}ms`)

    const totalTime = Date.now() - startTime
    console.log(`[SERVER] === Total processing time: ${totalTime}ms ===`)
    console.log(`[SERVER] Sending response with ${chunksData.length} chunks`)

    return NextResponse.json({
      chunks: chunksData,
      minX,
      maxX,
      minZ,
      maxZ,
      minY,
      maxY,
    })
  } catch (error: any) {
    console.error('[SERVER] ERROR:', error)
    console.error('[SERVER] Stack:', error.stack)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function parseMCAFile(data: ArrayBuffer, filename: string) {
  const parseStart = Date.now()
  const view = new DataView(data)
  const chunks: any[] = []

  const match = filename.match(/r\.(-?\d+)\.(-?\d+)\.mca/)
  const regionX = match ? parseInt(match[1]) : 0
  const regionZ = match ? parseInt(match[2]) : 0

  let validChunks = 0
  let parsedChunks = 0
  let nbtParseTime = 0
  let blockParseTime = 0

  // Process chunks in batches for better performance
  const batchSize = 50
  const chunkPromises: Promise<any>[] = []

  for (let chunkIndex = 0; chunkIndex < 1024; chunkIndex++) {
    try {
      const headerOffset = chunkIndex * 4
      if (headerOffset + 4 > data.byteLength) break

      const offset = view.getUint32(headerOffset, false)
      const sectorOffset = (offset >> 8) * 4096

      if (sectorOffset === 0) continue
      validChunks++
      
      if (sectorOffset + 5 > data.byteLength) continue

      const length = view.getUint32(sectorOffset, false)
      const compressionType = view.getUint8(sectorOffset + 4)

      if (compressionType !== 2) continue
      if (sectorOffset + 5 + length - 1 > data.byteLength) continue

      const compressedData = new Uint8Array(data, sectorOffset + 5, length - 1)
      
      const chunkX = (chunkIndex % 32) + regionX * 32
      const chunkZ = Math.floor(chunkIndex / 32) + regionZ * 32

      // Parse chunks in parallel batches
      const parsePromise = (async () => {
        try {
          const decompressed = pako.inflate(compressedData)
          const nbtStart = Date.now()
          const { parsed } = await nbt.parse(Buffer.from(decompressed))
          const nbtTime = Date.now() - nbtStart

          const blockStart = Date.now()
          const topBlocks = parseChunkTopBlocks(parsed, chunkX, chunkZ)
          const blockTime = Date.now() - blockStart

          return {
            chunk: { x: chunkX, z: chunkZ, topBlocks },
            nbtTime,
            blockTime
          }
        } catch (error) {
          return null
        }
      })()

      chunkPromises.push(parsePromise)

      // Process in batches to avoid overwhelming memory
      if (chunkPromises.length >= batchSize) {
        const batch = await Promise.all(chunkPromises)
        for (const result of batch) {
          if (result) {
            chunks.push(result.chunk)
            nbtParseTime += result.nbtTime
            blockParseTime += result.blockTime
            parsedChunks++
          }
        }
        chunkPromises.length = 0
      }
    } catch (error) {
      // Skip failed chunks
    }
  }

  // Process remaining chunks
  if (chunkPromises.length > 0) {
    const batch = await Promise.all(chunkPromises)
    for (const result of batch) {
      if (result) {
        chunks.push(result.chunk)
        nbtParseTime += result.nbtTime
        blockParseTime += result.blockTime
        parsedChunks++
      }
    }
  }

  const totalTime = Date.now() - parseStart
  console.log(`[SERVER]   - Valid: ${validChunks}, Parsed: ${parsedChunks}`)
  console.log(`[SERVER]   - NBT parse: ${nbtParseTime}ms, Block parse: ${blockParseTime}ms, Total: ${totalTime}ms`)

  return chunks
}

function parseChunkTopBlocks(chunkData: any, chunkX: number, chunkZ: number): Map<string, string> {
  const blocksByXZ = new Map<string, Array<{y: number, blockName: string}>>()
  
  let debugOnce = false

  try {
    const sections = chunkData?.value?.sections?.value?.value || chunkData?.value?.Level?.value?.Sections?.value?.value
    if (!sections || !Array.isArray(sections)) {
      if (!debugOnce) {
        console.log('[SERVER] DEBUG: No sections found. Keys:', Object.keys(chunkData?.value || {}))
        debugOnce = true
      }
      return new Map<string, string>() // Return empty Map instead of undefined "blocks"
    }

    for (const section of sections) {
      const sectionValue = section.value || section
      const yOffset = (sectionValue.Y?.value ?? sectionValue.y?.value ?? 0) * 16
      
      const blockStates = sectionValue.block_states?.value || sectionValue.BlockStates?.value
      if (!blockStates) {
        if (!debugOnce) {
          console.log('[SERVER] DEBUG: No blockStates. Section keys:', Object.keys(sectionValue))
          debugOnce = true
        }
        continue
      }

      const palette = blockStates.palette?.value?.value || blockStates.Palette?.value?.value
      if (!palette || !Array.isArray(palette)) {
        if (!debugOnce) {
          console.log('[SERVER] DEBUG: No palette. blockStates keys:', Object.keys(blockStates))
          debugOnce = true
        }
        continue
      }

      const paletteBlocks = palette.map((entry: any) => {
        return entry.value?.Name?.value || entry.Name?.value || 'minecraft:air'
      })

      if (paletteBlocks.length === 1) {
        const blockName = paletteBlocks[0]
        if (!blockName.includes('air')) {
          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
              for (let z = 0; z < 16; z++) {
                const worldY = yOffset + y
                const xzKey = `${x},${z}`
                if (!blocksByXZ.has(xzKey)) blocksByXZ.set(xzKey, [])
                blocksByXZ.get(xzKey)!.push({ y: worldY, blockName })
              }
            }
          }
        }
        continue
      }

      const dataArray = blockStates.data?.value?.value || blockStates.Data?.value?.value
      if (!dataArray || !Array.isArray(dataArray)) continue

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
                if (!blocksByXZ.has(xzKey)) blocksByXZ.set(xzKey, [])
                blocksByXZ.get(xzKey)!.push({ y: worldY, blockName })
              }
            }
          }
        }
      }
    }
  } catch (error) {
    // Skip
  }

  // Find topmost block at each X,Z position
  const topBlocks = new Map<string, string>()
  for (const [xzKey, blockList] of blocksByXZ.entries()) {
    let topBlock = blockList[0]
    for (const block of blockList) {
      if (block.y > topBlock.y) {
        topBlock = block
      }
    }
    topBlocks.set(xzKey, topBlock.blockName)
  }

  return topBlocks
}

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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
