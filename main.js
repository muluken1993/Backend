const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

ipcMain.handle('upload-file', async (event, filePath) => {
  try {
    console.log('🔍 Processing Amharic document:', filePath);    
    if (!fs.existsSync(filePath)) {
      throw new Error('No File Found: ' + filePath);
    }
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    if (fileSizeInMB > 50) {
      throw new Error('Faile is Greater Than 50MB:');
    }
    const text = await ocrProcessor.extractText(filePath);
    console.log('Amharic text extracted, length:', text.length);
    
    const category = classifier.classify(text);
    const displayCategory = classifier.getCategoryDisplayName(category);
    console.log('Document classified as:', displayCategory);
    const outputPath = await fileManager.saveToCategory(filePath, category, text);
    console.log('File saved to PDF:', outputPath);
    
    return {
      success: true,
      category: displayCategory,
      englishCategory: category, 
      outputPath,
      text: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
      fileSize: (stats.size / (1024 * 1024)).toFixed(2) + ' MB'
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
    console.log(`📁 Loaded ${files.length} files from ${folderName}`);
    return files;
  } catch (error) {
    console.error('Error getting files:', error);
    return [];
  }
});

ipcMain.handle('download-file', async (event, filePath) => {
  try {
    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.basename(filePath),
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Download File'
    });
    
    if (!result.canceled && result.filePath) {
      // Copy file to selected location
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
      // Show save dialog for the zip file
      const displayName = fileManager.getCategoryDisplayName(folderName);
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `${displayName}_${new Date().toISOString().split('T')[0]}.zip`,
        filters: [
          { name: 'ZIP Files', extensions: ['zip'] }
        ],
        title: 'Download Folder Archive'
      });
      
      if (!saveResult.canceled && saveResult.filePath) {
        // Move the zip file to the selected location
        await fs.promises.rename(result.zipPath, saveResult.filePath);
        return { 
          success: true, 
          path: saveResult.filePath,
          message: `የ${displayName}` 
        };
      } else {
        // Delete the temporary zip file if user canceled
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
    const { shell } = require('electron');
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
      buttons: ['አትስረዝ', 'ስረዝ'],
      defaultId: 0,
      cancelId: 0,
      title: 'ፋይል ስረዝ',
      message: 'ይህን ፋይል ለማስወገድ እርግጠኛ ነዎት?',
      detail: `ፋይል: ${path.basename(filePath)}`
    });
    
    if (result.response === 1) { // User clicked "Delete"
      await fs.promises.unlink(filePath);
      
      // Also delete metadata file if exists
      const metaPath = filePath + '.meta.txt';
      try {
        await fs.promises.unlink(metaPath);
      } catch (metaError) {
        // Metadata file might not exist, which is fine
      }
      
      console.log('✅ File deleted:', filePath);
      return { success: true, message: 'ፋይሉ በተሳካ ሁኔታ ተሰርዟል!' };
    }
    
    return { success: false, canceled: true };
  } catch (error) {
    console.error('Delete error:', error);
    return { 
      success: false, 
      error: `የመሰረዝ ስህተት: ${error.message}` 
    };
  }
});

ipcMain.handle('get-file-content', async (event, filePath) => {
  try {
    // Read the content of text-based files or metadata
    if (filePath.endsWith('.meta.txt')) {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return { success: true, content, type: 'metadata' };
    } else if (filePath.endsWith('.pdf')) {
      // For PDFs, return the extracted text from metadata
      const metaPath = filePath + '.meta.txt';
      try {
        const content = await fs.promises.readFile(metaPath, 'utf8');
        return { success: true, content, type: 'extracted_text' };
      } catch {
        return { success: true, content: 'አልተገኘ ጽሑፍ የለም', type: 'no_text' };
      }
    }
  } catch (error) {
    console.error('❌ Error reading file content:', error);
    return { success: false, error: error.message };
  }
});

// Handle app activation (macOS)
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
      console.warn('🚫 Blocked navigation to external URL:', navigationUrl);
    }
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🔥 Uncaught Exception:', error);
  
  // Show error dialog to user
  dialog.showErrorBox(
    'ስርአት ስህተት - System Error',
    `ያልተጠበቀ ስህተት ተከስቷል:\n${error.message}`
  );
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

console.log('🚀 Ethiopian Document Classifier started successfully!');
console.log('📝 Features: Amharic OCR, Ethiopian Document Classification, PDF Conversion');