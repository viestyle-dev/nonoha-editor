"use client"

import { Divider, Drawer, IconButton, Typography } from "@mui/material"
import CloseIcon from "@mui/icons-material/Close"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { css } from "@emotion/react"
import { enqueueSnackbar } from "notistack"
import { DataClient, graphDataClient } from "nonoha-client-js"
import { useThemeStore } from "@/src/stores/theme-store"
import { MAX_PREVIEW_SIZE } from "@/src/api/data-api"
import type {
  DataDirectoryResponse,
  DataEntry,
  DataFileResponse,
  PreviewContent,
  SortDirection,
  SortField,
} from "@/src/components/data-browser/types"
import { DataBrowserBreadcrumb } from "./DataBrowserBreadcrumb"
import { DataDirectoryView } from "./DataDirectoryView"
import { DataFilePreview } from "./DataFilePreview"
import { DeleteConfirmDialog } from "./DeleteConfirmDialog"
import { NewFolderDialog } from "./NewFolderDialog"
import {
  DataUploadDialog,
  type UploadConflict,
  type UploadProgress,
} from "./DataUploadDialog"
import { DataDropZone } from "./DataDropZone"

const DEFAULT_WIDTH = 480
const MIN_WIDTH = 320
const MAX_WIDTH = 960
const HANDLE_WIDTH = 6
const STORAGE_KEY = "dataBrowserDrawerWidth"

export interface DataBrowserDrawerProps {
  open: boolean
  onClose: () => void
  engineGatewayUrl: string | undefined
  graphName: string
}

export const DataBrowserDrawer = memo((props: DataBrowserDrawerProps) => {
  const { open, onClose, engineGatewayUrl, graphName } = props
  const [{ colors }] = useThemeStore()

  const dataClient = useMemo(() => {
    if (!engineGatewayUrl || !graphName) return null
    return graphDataClient(engineGatewayUrl, graphName)
  }, [engineGatewayUrl, graphName])

  const [pathSegments, setPathSegments] = useState<string[]>([])
  const [directoryData, setDirectoryData] =
    useState<DataDirectoryResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<{
    meta: DataFileResponse
    preview: PreviewContent | null
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sortField, setSortField] = useState<SortField>("name")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  const fetchIdRef = useRef(0)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const savedScrollTopRef = useRef<number>(0)

  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = Number(saved)
      if (!Number.isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
        return parsed
      }
    }
    return DEFAULT_WIDTH
  })
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const fetchDirectory = useCallback(
    async (segments: string[]) => {
      if (!dataClient) return
      const id = ++fetchIdRef.current
      setLoading(true)
      try {
        const path = segments.join("/")
        const data = await dataClient.fetchPath(path)
        if (fetchIdRef.current !== id) return
        if (data.type === "directory") {
          setDirectoryData(data)
        }
      } catch (error) {
        if (fetchIdRef.current !== id) return
        enqueueSnackbar(
          `Failed to load directory: ${error instanceof Error ? error.message : error}`,
          { variant: "error" },
        )
        setDirectoryData({ type: "directory", path: "", entries: [] })
      } finally {
        if (fetchIdRef.current === id) {
          setLoading(false)
        }
      }
    },
    [dataClient],
  )

  // Fetch root on open
  useEffect(() => {
    if (open && engineGatewayUrl && graphName) {
      setPathSegments([])
      setSelectedFile(null)
      fetchDirectory([])
    }
  }, [open, engineGatewayUrl, graphName, fetchDirectory])

  const handleDirectoryClick = useCallback(
    (name: string) => {
      const next = [...pathSegments, name]
      setPathSegments(next)
      setSelectedFile(null)
      fetchDirectory(next)
    },
    [pathSegments, fetchDirectory],
  )

  const handleFileClick = useCallback(
    async (name: string) => {
      if (!dataClient) return
      const filePath = [...pathSegments, name].join("/")
      try {
        const data = await dataClient.fetchPath(filePath)
        if (data.type !== "file") return
        setSelectedFile({ meta: data, preview: null })
      } catch (error) {
        enqueueSnackbar(
          `Failed to load file: ${error instanceof Error ? error.message : error}`,
          { variant: "error" },
        )
      }
    },
    [dataClient, pathSegments],
  )

  const handleBreadcrumbNavigate = useCallback(
    (segmentIndex: number) => {
      setSelectedFile(null)
      if (segmentIndex < 0) {
        setPathSegments([])
        fetchDirectory([])
      } else {
        const next = pathSegments.slice(0, segmentIndex + 1)
        setPathSegments(next)
        fetchDirectory(next)
      }
    },
    [pathSegments, fetchDirectory],
  )

  const handleSortChange = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDirection(prev => (prev === "asc" ? "desc" : "asc"))
      } else {
        setSortField(field)
        setSortDirection("asc")
      }
    },
    [sortField],
  )

  const handleDownload = useCallback(() => {
    if (!selectedFile || !engineGatewayUrl) return
    const url = `http://${engineGatewayUrl}${selectedFile.meta.download_url}`
    window.open(url, "_blank")
  }, [selectedFile, engineGatewayUrl])

  const handlePreview = useCallback(async () => {
    if (!selectedFile || !dataClient) return
    if (selectedFile.meta.size > MAX_PREVIEW_SIZE) return
    const filePath = [...pathSegments, selectedFile.meta.name].join("/")
    setPreviewLoading(true)
    try {
      const raw = await dataClient.fetchFileRaw(filePath)
      setSelectedFile(prev =>
        prev
          ? { ...prev, preview: { text: raw.text, blob: raw.blob } }
          : null,
      )
    } catch (error) {
      enqueueSnackbar(
        `Failed to load preview: ${error instanceof Error ? error.message : error}`,
        { variant: "error" },
      )
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedFile, dataClient, pathSegments])

  const handleRefresh = useCallback(async () => {
    savedScrollTopRef.current = previewScrollRef.current?.scrollTop ?? 0
    if (!selectedFile || !dataClient) return
    if (selectedFile.meta.size > MAX_PREVIEW_SIZE) return
    const filePath = [...pathSegments, selectedFile.meta.name].join("/")
    setPreviewLoading(true)
    try {
      const raw = await dataClient.fetchFileRaw(filePath)
      setSelectedFile(prev =>
        prev
          ? { ...prev, preview: { text: raw.text, blob: raw.blob } }
          : null,
      )
      requestAnimationFrame(() => {
        if (previewScrollRef.current) {
          previewScrollRef.current.scrollTop = savedScrollTopRef.current
        }
      })
    } catch (error) {
      enqueueSnackbar(
        `Failed to load preview: ${error instanceof Error ? error.message : error}`,
        { variant: "error" },
      )
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedFile, dataClient, pathSegments])

  const handleBack = useCallback(() => {
    setSelectedFile(null)
  }, [])

  const handleDirectoryRefresh = useCallback(() => {
    fetchDirectory(pathSegments)
  }, [fetchDirectory, pathSegments])

  // -- Delete --
  const [deleteTarget, setDeleteTarget] = useState<DataEntry | null>(null)
  const [deleteItemCount, setDeleteItemCount] = useState<number | undefined>()

  const handleDeleteRequest = useCallback(
    async (entry: DataEntry) => {
      if (entry.type === "directory" && dataClient) {
        try {
          const dirPath = [...pathSegments, entry.name].join("/")
          const data = await dataClient.fetchPath(dirPath)
          if (data.type === "directory") {
            setDeleteItemCount(data.entries.length)
          }
        } catch {
          setDeleteItemCount(undefined)
        }
      } else {
        setDeleteItemCount(undefined)
      }
      setDeleteTarget(entry)
    },
    [dataClient, pathSegments],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || !dataClient) return
    const path = [...pathSegments, deleteTarget.name].join("/")
    try {
      await dataClient.deletePath(path, {
        recursive: deleteTarget.type === "directory",
      })
      enqueueSnackbar(`Deleted "${deleteTarget.name}"`)
      fetchDirectory(pathSegments)
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to delete"
      enqueueSnackbar(msg, { variant: "error" })
    }
    setDeleteTarget(null)
  }, [deleteTarget, dataClient, pathSegments, fetchDirectory])

  // -- New Folder --
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  const handleNewFolderConfirm = useCallback(
    async (name: string) => {
      if (!dataClient) return
      const path = [...pathSegments, name].join("/")
      try {
        await dataClient.createDirectory(path)
        enqueueSnackbar(`Created folder "${name}"`)
        fetchDirectory(pathSegments)
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Failed to create folder"
        enqueueSnackbar(msg, { variant: "error" })
      }
      setNewFolderOpen(false)
    },
    [dataClient, pathSegments, fetchDirectory],
  )

  // -- Upload --
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadConflicts, setUploadConflicts] = useState<UploadConflict[]>([])
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  )
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const pendingFilesRef = useRef<File[]>([])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const startUploadFlow = useCallback(
    (files: File[]) => {
      if (!directoryData) return
      const existingNames = new Set(
        directoryData.entries.map((e) => e.name),
      )
      const conflicts: UploadConflict[] = files.map((f) => ({
        file: f,
        exists: existingNames.has(f.name),
      }))
      const hasConflicts = conflicts.some((c) => c.exists)

      if (hasConflicts) {
        pendingFilesRef.current = files
        setUploadConflicts(conflicts)
        setUploadDialogOpen(true)
      } else {
        doUpload(files, false)
      }
    },
    [directoryData],
  )

  const handleFilesSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length > 0) startUploadFlow(files)
      e.target.value = ""
    },
    [startUploadFlow],
  )

  const handleDrop = useCallback(
    (files: File[]) => {
      startUploadFlow(files)
    },
    [startUploadFlow],
  )

  const doUpload = useCallback(
    async (files: File[], overwrite: boolean) => {
      if (!dataClient) return
      setUploadDialogOpen(true)
      let successCount = 0
      let failCount = 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const filePath = [...pathSegments, file.name].join("/")
        setUploadProgress({
          currentFile: file.name,
          fileIndex: i,
          fileCount: files.length,
          loaded: 0,
          total: file.size,
        })
        try {
          const uploadOpts = {
            overwrite,
            onProgress: (loaded: number, total: number) =>
              setUploadProgress((prev) =>
                prev ? { ...prev, loaded, total } : prev,
              ),
          }
          if (file.size >= DataClient.RESUMABLE_THRESHOLD) {
            await dataClient.uploadFileResumable(filePath, file, uploadOpts)
          } else {
            await dataClient.uploadFile(filePath, file, uploadOpts)
          }
          successCount++
        } catch (error) {
          failCount++
          const msg =
            error instanceof Error ? error.message : "Upload failed"
          enqueueSnackbar(`Failed to upload "${file.name}": ${msg}`, {
            variant: "error",
          })
        }
      }

      setUploadProgress(null)
      setUploadDialogOpen(false)
      setUploadConflicts([])
      pendingFilesRef.current = []

      if (successCount > 0) {
        const summary =
          failCount > 0
            ? `Uploaded ${successCount} of ${successCount + failCount} files`
            : `Uploaded ${successCount} file${successCount !== 1 ? "s" : ""}`
        enqueueSnackbar(summary)
        fetchDirectory(pathSegments)
      }
    },
    [dataClient, pathSegments, fetchDirectory],
  )

  const handleUploadOverwrite = useCallback(() => {
    doUpload(pendingFilesRef.current, true)
  }, [doUpload])

  // -- Download from context menu --
  const handleEntryDownload = useCallback(
    (entry: DataEntry) => {
      if (!engineGatewayUrl || entry.type !== "file") return
      const filePath = [...pathSegments, entry.name].join("/")
      const url = `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/data/${filePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}?raw`
      window.open(url, "_blank")
    },
    [engineGatewayUrl, graphName, pathSegments],
  )

  const handleDragMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return
    const delta = startXRef.current - e.clientX
    const newWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, startWidthRef.current + delta),
    )
    setDrawerWidth(newWidth)
  }, [])

  const handleDragMouseUp = useCallback(() => {
    isDraggingRef.current = false
    setIsDragging(false)
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    document.removeEventListener("mousemove", handleDragMouseMove)
    document.removeEventListener("mouseup", handleDragMouseUp)
    setDrawerWidth(prev => {
      localStorage.setItem(STORAGE_KEY, String(prev))
      return prev
    })
  }, [handleDragMouseMove])

  const handleDragMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDraggingRef.current = true
      startXRef.current = e.clientX
      startWidthRef.current = drawerWidth
      setIsDragging(true)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", handleDragMouseMove)
      document.addEventListener("mouseup", handleDragMouseUp)
    },
    [drawerWidth, handleDragMouseMove, handleDragMouseUp],
  )

  const handleDragDoubleClick = useCallback(() => {
    setDrawerWidth(DEFAULT_WIDTH)
    localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH))
  }, [])

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleDragMouseMove)
      document.removeEventListener("mouseup", handleDragMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [handleDragMouseMove, handleDragMouseUp])

  return (
    <Drawer
      anchor="right"
      open={open}
      variant="persistent"
      sx={{
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          backgroundColor: colors.surfaceContainerLow,
        },
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleDragMouseDown}
        onDoubleClick={handleDragDoubleClick}
        css={css({
          position: "absolute",
          top: 0,
          left: 0,
          width: HANDLE_WIDTH,
          height: "100%",
          cursor: "col-resize",
          zIndex: 1,
          "&::after": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            width: isDragging ? 3 : 1,
            height: "100%",
            backgroundColor: isDragging
              ? colors.primary
              : colors.outlineVariant,
            transition: isDragging
              ? "none"
              : "width 150ms ease, background-color 150ms ease",
          },
          "&:hover::after": {
            width: 3,
            backgroundColor: colors.primary,
          },
        })}
      />
      <div
        css={css({
          display: "flex",
          flexDirection: "column",
          height: "100%",
        })}
      >
        {/* Header */}
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            flexShrink: 0,
          })}
        >
          <Typography
            css={css({
              fontSize: 16,
              fontWeight: 500,
              color: colors.onSurface,
            })}
          >
            Data Browser
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon css={css({ fontSize: 20, color: colors.onSurface })} />
          </IconButton>
        </div>

        <Divider />

        {/* Breadcrumb */}
        <DataBrowserBreadcrumb
          pathSegments={pathSegments}
          onNavigate={handleBreadcrumbNavigate}
        />

        <Divider />

        {/* Content */}
        <DataDropZone onDrop={handleDrop} disabled={!!selectedFile}>
          <div
            css={css({
              flexGrow: 1,
              overflow: "auto",
              minHeight: 0,
              height: "100%",
            })}
          >
            {selectedFile ? (
              <DataFilePreview
                file={selectedFile.meta}
                previewContent={selectedFile.preview}
                loading={previewLoading}
                onBack={handleBack}
                onDownload={handleDownload}
                onPreview={handlePreview}
                onRefresh={handleRefresh}
                scrollContainerRef={previewScrollRef}
              />
            ) : (
              <DataDirectoryView
                entries={directoryData?.entries ?? []}
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={handleSortChange}
                onDirectoryClick={handleDirectoryClick}
                onFileClick={handleFileClick}
                onRefresh={handleDirectoryRefresh}
                onUploadClick={handleUploadClick}
                onNewFolderClick={() => setNewFolderOpen(true)}
                onDownload={handleEntryDownload}
                onDelete={handleDeleteRequest}
                loading={loading}
              />
            )}
          </div>
        </DataDropZone>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFilesSelected}
      />

      {/* Dialogs */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        entry={deleteTarget}
        itemCount={deleteItemCount}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
      <NewFolderDialog
        open={newFolderOpen}
        onConfirm={handleNewFolderConfirm}
        onCancel={() => setNewFolderOpen(false)}
      />
      <DataUploadDialog
        open={uploadDialogOpen}
        conflicts={uploadConflicts}
        progress={uploadProgress}
        onConfirmOverwrite={handleUploadOverwrite}
        onCancel={() => {
          setUploadDialogOpen(false)
          setUploadConflicts([])
          pendingFilesRef.current = []
        }}
      />
    </Drawer>
  )
})
