const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations (existing)
  uploadFile: (filePath) => ipcRenderer.invoke('upload-file', filePath),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  getFilesInFolder: (folderName) => ipcRenderer.invoke('get-files-in-folder', folderName),
  downloadFile: (filePath) => ipcRenderer.invoke('download-file', filePath),
  zipFolder: (folderName) => ipcRenderer.invoke('zip-folder', folderName),
  showSaveDialog: (defaultPath) => ipcRenderer.invoke('show-save-dialog', defaultPath),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  
  // ADD THESE SCANNER METHODS:
  checkScannerAvailability: () => ipcRenderer.invoke('check-scanner-availability'),
  openScannerDialog: () => ipcRenderer.invoke('open-scanner-dialog'),
  simulateScanner: () => ipcRenderer.invoke('simulate-scanner'),
  
  // ADD THESE UTILITY METHODS (optional but useful):
  exportAllDocuments: () => ipcRenderer.invoke('export-all-documents'),
  openDocumentsFolder: () => ipcRenderer.invoke('open-documents-folder'),
  getAppVersion: () => ipcRenderer.invoke('get-app-info'),
  openFileLocation: (filePath) => ipcRenderer.invoke('open-file-location', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  getFileContent: (filePath) => ipcRenderer.invoke('get-file-content', filePath)
});