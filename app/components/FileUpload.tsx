'use client'

import { ChangeEvent, useState } from 'react'

interface FileUploadProps {
  onFilesLoad: (files: { name: string; data: ArrayBuffer }[]) => void
  onServerLoad: (file: File) => void
  useServer: boolean
  onToggleMode: (useServer: boolean) => void
}

export default function FileUpload({ onFilesLoad, onServerLoad, useServer, onToggleMode }: FileUploadProps) {
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (useServer) {
      // Use server-side processing
      onServerLoad(file)
    } else {
      // Use client-side processing
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      
      try {
        const zipData = await zip.loadAsync(file)
        const mcaFiles: { name: string; data: ArrayBuffer }[] = []

        for (const [filename, zipEntry] of Object.entries(zipData.files)) {
          if (filename.endsWith('.mca') && !zipEntry.dir) {
            const data = await zipEntry.async('arraybuffer')
            mcaFiles.push({ name: filename, data })
          }
        }

        if (mcaFiles.length === 0) {
          alert('No .mca files found in the zip')
          return
        }

        onFilesLoad(mcaFiles)
      } catch (error) {
        console.error('Error loading zip:', error)
        alert('Error loading zip file')
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={!useServer}
            onChange={() => onToggleMode(false)}
            className="w-4 h-4"
          />
          <span>Client-side (slower, works offline)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            checked={useServer}
            onChange={() => onToggleMode(true)}
            className="w-4 h-4"
          />
          <span>Server-side (faster)</span>
        </label>
      </div>
      <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-gray-500 transition">
      <input
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        className="hidden"
        id="file-upload"
      />
      <label
        htmlFor="file-upload"
        className="cursor-pointer block"
      >
        <div className="text-gray-400 mb-2">
          <svg
            className="mx-auto h-12 w-12 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <p className="text-lg mb-2">Click to upload region folder</p>
        <p className="text-sm text-gray-500">ZIP file containing .mca files</p>
        <p className="text-xs text-gray-600 mt-2">
          {useServer ? 'Processing on server (faster)' : 'Processing in browser (slower)'}
        </p>
      </label>
    </div>
    </div>
  )
}
