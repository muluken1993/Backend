const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const pdfConverter = require('./pdfConverter');

class FileManager {
    constructor() {
        this.baseDir = path.join(__dirname, '..', 'classified_docs');
        this.categories = [
            'invoice', 
            'contract', 
            'report', 
            'id_card', 
            'educational', 
            'medical', 
            'license', 
            'other'
        ];
        this.init();
    }

    async init() {
        // Create base directory and category folders
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
            
            for (const category of this.categories) {
                const categoryPath = path.join(this.baseDir, category);
                await fs.mkdir(categoryPath, { recursive: true });
            }
            console.log('✅ Document directories created successfully');
        } catch (error) {
            console.error('❌ Directory creation failed:', error);
        }
    }

    async saveToCategory(filePath, category, text) {
        try {
            const fileName = path.basename(filePath);
            const categoryDir = path.join(this.baseDir, category);
            
            // Ensure category directory exists
            await fs.mkdir(categoryDir, { recursive: true });
            
            // Convert to PDF first
            console.log(`📄 Converting ${fileName} to PDF...`);
            const pdfPath = await pdfConverter.convertToSearchablePDF(filePath, text, category);
            
            // Create final filename
            const finalFileName = `${path.basename(fileName, path.extname(fileName))}_${category}.pdf`;
            const finalPath = path.join(categoryDir, finalFileName);
            
            // Move PDF to category directory
            await fs.rename(pdfPath, finalPath);

            // Save extracted text as metadata
            const metaPath = finalPath + '.meta.txt';
            await fs.writeFile(metaPath, text, 'utf8');

            console.log(`✅ Document classified and saved: ${finalPath}`);
            return {
                success: true,
                category: category,
                outputPath: finalPath,
                text: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
                fileName: fileName
            };
        } catch (error) {
            console.error('❌ Error saving to category:', error);
            throw error;
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async getFolders() {
        const folders = [];
        
        for (const category of this.categories) {
            const categoryPath = path.join(this.baseDir, category);
            try {
                const files = await fs.readdir(categoryPath);
                const validFiles = files.filter(file => 
                    file.endsWith('.pdf') && !file.endsWith('.meta.txt')
                );
                
                folders.push({
                    name: category,
                    displayName: this.getCategoryDisplayName(category),
                    path: categoryPath,
                    count: validFiles.length
                });
            } catch (error) {
                folders.push({
                    name: category,
                    displayName: this.getCategoryDisplayName(category),
                    path: categoryPath,
                    count: 0
                });
            }
        }
        
        return folders;
    }

    async getFilesInFolder(folderName) {
        const folderPath = path.join(this.baseDir, folderName);
        
        try {
            const files = await fs.readdir(folderPath);
            const fileList = [];
            
            for (const file of files) {
                if (file.endsWith('.meta.txt') || !file.endsWith('.pdf')) continue;
                
                const filePath = path.join(folderPath, file);
                const stats = await fs.stat(filePath);
                
                fileList.push({
                    name: file,
                    displayName: this.getDisplayFileName(file),
                    path: filePath,
                    size: this.formatFileSize(stats.size),
                    modified: stats.mtime
                });
            }
            
            return fileList;
        } catch (error) {
            console.error(`❌ Error getting files from ${folderName}:`, error);
            return [];
        }
    }

    getCategoryDisplayName(category) {
        const displayNames = {
            invoice: 'Invoice',
            contract: 'Contract',
            report: 'Report',
            id_card: 'ID Card',
            educational: 'Educational',
            medical: 'Medical',
            license: 'License',
            other: 'Other'
        };
        return displayNames[category] || category;
    }

    getDisplayFileName(fileName) {
        // Remove the category suffix and extension for display
        return fileName.replace(/_([^_]+)\.pdf$/, '').replace(/_/g, ' ');
    }

    async zipFolder(folderName) {
        return new Promise(async (resolve, reject) => {
            const folderPath = path.join(this.baseDir, folderName);
            const displayName = this.getCategoryDisplayName(folderName);
            const zipPath = path.join(this.baseDir, `${displayName}_${Date.now()}.zip`);
            
            try {
                const output = require('fs').createWriteStream(zipPath);
                const archive = archiver('zip', { 
                    zlib: { level: 9 },
                    comment: `${displayName} Documents - Ethiopian Document Classifier`
                });
                
                output.on('close', () => {
                    console.log(`✅ Folder zipped successfully: ${zipPath}`);
                    resolve(zipPath);
                });
                
                archive.on('error', (error) => {
                    console.error('❌ Zip error:', error);
                    reject(error);
                });
                
                archive.pipe(output);
                archive.directory(folderPath, false);
                await archive.finalize();
                
            } catch (error) {
                console.error('❌ Zip creation failed:', error);
                reject(error);
            }
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Method to simulate printer scan functionality
    async simulatePrinterScan() {
        return new Promise((resolve) => {
            // Simulate scanning delay
            setTimeout(() => {
                resolve({
                    success: true,
                    message: 'Document scanned successfully',
                    filePath: path.join(this.baseDir, 'scanned_document.pdf')
                });
            }, 3000);
        });
    }
}

// Create and export instance
const fileManager = new FileManager();
module.exports = fileManager;