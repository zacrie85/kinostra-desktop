/* ================================================================
   KINOSTRA DESKTOP — Preload (bridge aman renderer <-> main)
   ================================================================ */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kinostra', {
  /* dialogs */
  openMedia: () => ipcRenderer.invoke('dialog:openMedia'),
  pickWatermark: () => ipcRenderer.invoke('dialog:openWatermark'),
  pickCover: () => ipcRenderer.invoke('dialog:openCover'),
  pickSrt: () => ipcRenderer.invoke('dialog:openSrt'),
  pickOutputDir: (def) => ipcRenderer.invoke('dialog:pickOutputDir', def),

  /* stream writer */
  beginWrite: (dir, fileName) => ipcRenderer.invoke('fs:beginWrite', { dir, fileName }),
  writeChunk: (id, chunk) => ipcRenderer.invoke('fs:writeChunk', { id, chunk: new Uint8Array(chunk) }),
  /* v2.15: tulis pada POSISI tertentu (pwrite acak) — dipakai muxer streaming
     mp4-muxer StreamTarget yang mem-patch header mdat di posisi lama saat finalize */
  writeChunkAt: (id, chunk, position) => ipcRenderer.invoke('fs:writeChunkAt', { id, chunk: new Uint8Array(chunk), position }),
  endWrite: (id) => ipcRenderer.invoke('fs:endWrite', { id }),
  abortWrite: (id) => ipcRenderer.invoke('fs:abortWrite', { id }),

  /* batch read */
  readMediaFiles: (paths) => ipcRenderer.invoke('fs:readMediaFiles', paths),
  stat: (p) => ipcRenderer.invoke('fs:stat', p),
  /* v3.0: stat folder+nama (LANJUTKAN EKSPOR) */
  statJoin: (dir, name) => ipcRenderer.invoke('fs:statJoin', { dir, name }),
  /* v3.0: BATCH PRO — matikan PC setelah batch (dgn pembatalan) */
  shutdownPC: () => ipcRenderer.invoke('sys:shutdown'),
  abortShutdown: () => ipcRenderer.invoke('sys:shutdownAbort'),

  /* model AI */
  ensureModel: (modelId, files) => ipcRenderer.invoke('models:ensure', { modelId, files }),
  modelStatus: () => ipcRenderer.invoke('models:status'),
  openModelsFolder: () => ipcRenderer.invoke('models:openFolder'),
  onModelProgress: (cb) => {
    ipcRenderer.on('models:progress', (e, info) => cb(info));
  },

  /* v2.4: mesin subtitel native (whisper.cpp) */
  whisperStatus: () => ipcRenderer.invoke('whisper:status'),
  whisperEnsure: (engine) => ipcRenderer.invoke('whisper:ensure', { engine }),
  whisperTranscribe: (payload) => ipcRenderer.invoke('whisper:transcribe', payload),
  whisperCancel: () => ipcRenderer.invoke('whisper:cancel'),
  onWhisperProgress: (cb) => {
    ipcRenderer.on('whisper:progress', (e, info) => cb(info));
  },

  /* v2.4: info sistem (RAM asli) */
  sysInfo: () => ipcRenderer.invoke('sys:info'),
  /* v2.14: deteksi GPU terpasang (Win32_VideoController) */
  gpuInfo: () => ipcRenderer.invoke('sys:gpu'),

  /* shell */
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),

  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});
