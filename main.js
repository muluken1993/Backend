const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fileManager = require('./backend/fileManager');
const ocrProcessor = require('./backend/ocr');
const classifier = require('./backend/classifier');
const pdfConverter = require('./backend/pdfConverter');

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Ethiopian Document Classifier',
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'), 
    show: false
  });

  mainWindow.loadFile('renderer/index.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

ipcMain.handle('open-file', async (event, filePath) => {
  try {
    console.log('Opening file:', filePath);
    
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found: ' + filePath };
    }

    await shell.openPath(filePath);
    console.log('File opened successfully:', filePath);
    return { success: true };
  } catch (error) {
    console.error('Error opening file:', error);
    return { success: false, error: 'Failed to open file: ' + error.message };
  }
});

ipcMain.handle('upload-file', async (event, filePath) => {
  try {
    console.log('Processing Amharic document:', filePath);    
    if (!fs.existsSync(filePath)) {
      throw new Error('No File Found: ' + filePath);
    }
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    if (fileSizeInMB > 50) {
      throw new Error('File is Greater Than 50MB:');
    }
    
    const text = await ocrProcessor.extractText(filePath);
    console.log('Amharic text extracted, length:', text.length);
    
    const category = classifier.classify(text);
    const displayCategory = classifier.getCategoryDisplayName(category);
    console.log('Document classified as:', displayCategory);
    
    const fileExtension = path.extname(filePath).toLowerCase();
    
    let outputPath;
    if (fileExtension === '.pdf') {
      outputPath = await fileManager.saveToCategoryWithOriginalContent(filePath, category);
    } else {
      outputPath = await fileManager.saveImageAsSearchablePDF(filePath, category, text);
    }
    
    console.log('File saved:', outputPath);
    
    return {
      success: true,
      category: displayCategory,
      englishCategory: category, 
      outputPath,
      text: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
      fileSize: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
      originalName: path.basename(filePath)
    };
  } catch (error) {
    console.error('Error in upload-file handler:', error);
    return { 
      success: false, 
      error: `Error: ${error.message}` 
    };
  }
});

ipcMain.handle('get-folders', async () => {
  try {
    const folders = await fileManager.getFolders();
    console.log('Loaded folders:', folders.length);
    return folders;
  } catch (error) {
    console.error('Error getting folders:', error);
    return [];
  }
});

ipcMain.handle('get-files-in-folder', async (event, folderName) => {
  try {
    const files = await fileManager.getFilesInFolder(folderName);
    console.log(`Loaded ${files.length} files from ${folderName}`);
    return files;
  } catch (error) {
    console.error('Error getting files:', error);
    return [];
  }
});

ipcMain.handle('download-file', async (event, filePath) => {
  try {
    const fileName = path.basename(filePath);
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Download File'
    });
    
    if (!result.canceled && result.filePath) {
      await fs.promises.copyFile(filePath, result.filePath);
      console.log('File downloaded to:', result.filePath);
      return { success: true, path: result.filePath };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    console.error('Download error:', error);
    return { 
      success: false, 
      error: `Error in Download: ${error.message}` 
    };
  }
});

ipcMain.handle('zip-folder', async (event, folderName) => {
  try {
    console.log(`Zipping folder: ${folderName}`);
    const result = await fileManager.zipFolder(folderName);
    
    if (result.success) {
      const displayName = fileManager.getCategoryDisplayName(folderName);
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `${displayName}_${new Date().toISOString().split('T')[0]}.zip`,
        filters: [
          { name: 'ZIP Files', extensions: ['zip'] }
        ],
        title: 'Download Folder Archive'
      });
      
      if (!saveResult.canceled && saveResult.filePath) {
        await fs.promises.rename(result.zipPath, saveResult.filePath);
        return { 
          success: true, 
          path: saveResult.filePath,
          message: `የ${displayName}` 
        };
      } else {
        await fs.promises.unlink(result.zipPath).catch(console.error);
        return { success: false, canceled: true };
      }
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Zip error:', error);
    return { 
      success: false, 
      error: `: ${error.message}` 
    };
  }
});

ipcMain.handle('show-save-dialog', async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath,
    filters: [
      { name: 'ZIP Files', extensions: ['zip'] }
    ],
    title: 'Save File'
  });
  return result;
});

ipcMain.handle('open-file-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { 
          name: 'All Supported Files', 
          extensions: ['docx','pdf', 'doc','ppt','jpg', 'jpeg', 'png', 'tiff', 'bmp', 'tif'] 
        },
        { 
          name: 'Image Files', 
          extensions: ['jpg', 'jpeg', 'png', 'tiff', 'bmp', 'tif'] 
        },
        { 
          name: 'Document Files', 
          extensions: ['pdf','docx','doc','ppt'] 
        },
        { 
          name: 'All Files', 
          extensions: ['*'] 
        }
      ],
      title: 'Select Documents'
    });
    
    console.log('Files selected:', result.filePaths.length);
    return result;
  } catch (error) {
    console.error('File dialog error:', error);
    return { canceled: true, filePaths: [] };
  }
});

ipcMain.handle('get-app-info', async () => {
  return {
    name: 'Ethiopian Document Classification System',
    version: '1.0.0',
    description: 'Ethiopian Document Classification System with Amharic OCR',
    features: [
      'Amharic Text Extraction',
      'Ethiopian Document Classification',
      'PDF Conversion',
      'Automatic Organization'
    ]
  };
});

ipcMain.handle('open-file-location', async (event, filePath) => {
  try {
    await shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error opening file location:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['undelete', 'delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'delete the file',
      message: 'Do you want delete this file?',
      detail: `File: ${path.basename(filePath)}`
    });
    
    if (result.response === 1) { 
      await fs.promises.unlink(filePath);
      
      const metaPath = filePath + '.meta.txt';
      try {
        await fs.promises.unlink(metaPath);
      } catch (metaError) {
      }
      
      console.log('File deleted:', filePath);
      return { success: true, message: 'deleted the file' };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    console.error('Delete error:', error);
    return { 
      success: false, 
      error: `: ${error.message}` 
    };
  }
});

ipcMain.handle('get-file-content', async (event, filePath) => {
  try {
    if (filePath.endsWith('.meta.txt')) {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return { success: true, content, type: 'metadata' };
    } else {
      return { success: true, content: 'Original file content preserved', type: 'original_file' };
    }
  } catch (error) {
    console.error('Error reading file content:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-all-documents', async () => {
  try {
    const result = await fileManager.exportAllDocuments();
    
    if (result.success) {
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `all_documents_${new Date().toISOString().split('T')[0]}.zip`,
        filters: [
          { name: 'ZIP Files', extensions: ['zip'] }
        ],
        title: 'Export All Documents'
      });
      
      if (!saveResult.canceled && saveResult.filePath) {
        await fs.promises.rename(result.zipPath, saveResult.filePath);
        return { success: true, path: saveResult.filePath };
      } else {
        await fs.promises.unlink(result.zipPath).catch(console.error);
        return { success: false, canceled: true };
      }
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Export all error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-documents-folder', async () => {
  try {
    const docsPath = path.join(process.cwd(), 'classified_docs');
    if (fs.existsSync(docsPath)) {
      await shell.openPath(docsPath);
      return { success: true };
    } else {
      return { success: false, error: 'Documents folder not found' };
    }
  } catch (error) {
    console.error('Error opening documents folder:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-scanner-availability', async () => {
  try {
    const available = Math.random() > 0.3; 
    if (available) {
      return { available: true };
    } else {
      return { 
        available: false, 
        reason: 'No scanner devices detected. Please check your scanner connection and drivers.' 
      };
    }
  } catch (error) {
    return { available: false, reason: error.message };
  }
});

ipcMain.handle('open-scanner-dialog', async () => {
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Scan', 'Cancel'],
      defaultId: 0,
      title: 'Scanner Dialog',
      message: 'Scanner Simulation',
      detail: 'scanner interface. Click  scan or "Cancel" to abort.'
    });
    
    if (result.response === 0) {
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const scanFile = path.join(tempDir, `scanned_document_${Date.now()}.pdf`);
      fs.writeFileSync(scanFile, '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Resources <<\n/Font <<\n/F1 4 0 R\n>>\n>>\n/Contents 5 0 R\n>>\nendobj\n4 0 obj\n<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\nendobj\n5 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n72 720 Td\n(Scanned Document) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000255 00000 n \n0000000307 00000 n \ntrailer\n<<\n/Size 6\n/Root 1 0 R\n>>\nstartxref\n395\n%%EOF');
      
      return { success: true, filePaths: [scanFile] };
    } else {
      return { success: false, error: 'Scan cancelled by user' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('simulate-scanner', async () => {
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const scanFile = path.join(tempDir, `simulated_scan_${Date.now()}.pdf`);
    fs.writeFileSync(scanFile, '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Resources <<\n/Font <<\n/F1 4 0 R\n>>\n>>\n/Contents 5 0 R\n>>\nendobj\n4 0 obj\n<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\nendobj\n5 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n72 720 Td\n(Simulated Scan) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000255 00000 n \n0000000307 00000 n \ntrailer\n<<\n/Size 6\n/Root 1 0 R\n>>\nstartxref\n395\n%%EOF');
    
    return { success: true, filePaths: [scanFile] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
      console.warn('Blocked navigation to external URL:', navigationUrl);
    }
  });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox(
    'System Error',
    `error:\n${error.message}`
  );
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});
