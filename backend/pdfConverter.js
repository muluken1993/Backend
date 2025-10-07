const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

class PDFConverter {
    constructor() {
        console.log('✅ PDFConverter initialized');
    }

    async convertToSearchablePDF(originalPath, extractedText, category) {
        try {
            console.log('📄 Converting to searchable PDF...');
            
            const fileExtension = path.extname(originalPath).toLowerCase();
            const baseName = path.basename(originalPath, fileExtension);
            const outputPath = path.join(path.dirname(originalPath), `${baseName}_${category}.pdf`);
            
            if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp'].includes(fileExtension)) {
                // For images, create a text-only PDF
                return await this.createTextPDF(extractedText, outputPath, category, originalPath);
            } else if (fileExtension === '.pdf') {
                return await this.enhancePDFWithText(originalPath, extractedText, outputPath);
            } else {
                return await this.createTextPDF(extractedText, outputPath, category, originalPath);
            }
        } catch (error) {
            console.error('❌ PDF conversion failed:', error);
            // Fallback: return original path
            return originalPath;
        }
    }

    async createTextPDF(text, outputPath, category, originalPath = null) {
        try {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([600, 800]);
            
            const displayCategory = this.getCategoryDisplayName(category);
            const fileName = originalPath ? path.basename(originalPath) : 'Unknown';
            
            // Clean text to remove or replace unsupported Unicode characters
            const safeText = this.cleanTextForPDF(text);
            
            // Add title and header (English only to avoid encoding issues)
            page.drawText(`Ethiopian Document Classification System`, {
                x: 50,
                y: 770,
                size: 16,
                color: rgb(0, 0, 0),
            });

            page.drawText(`Document Type: ${displayCategory}`, {
                x: 50,
                y: 740,
                size: 12,
                color: rgb(0.2, 0.2, 0.2),
            });

            page.drawText(`Original File: ${fileName}`, {
                x: 50,
                y: 720,
                size: 10,
                color: rgb(0.4, 0.4, 0.4),
            });

            page.drawText(`Created Date: ${new Date().toLocaleDateString()}`, {
                x: 50,
                y: 700,
                size: 10,
                color: rgb(0.4, 0.4, 0.4),
            });

            // Add separator line
            page.drawLine({
                start: { x: 50, y: 690 },
                end: { x: 550, y: 690 },
                thickness: 1,
                color: rgb(0.8, 0.8, 0.8),
            });

            // Add extracted text (using cleaned text)
            if (safeText && safeText.trim().length > 0) {
                const lines = this.splitTextIntoLines(safeText, 500, 10);
                
                let yPosition = 660;
                for (const line of lines) {
                    if (yPosition < 50) break; // Stop if we reach bottom of page
                    
                    try {
                        page.drawText(line, {
                            x: 50,
                            y: yPosition,
                            size: 10,
                            color: rgb(0, 0, 0),
                            maxWidth: 500,
                        });
                    } catch (textError) {
                        console.log('⚠️ Text drawing error, skipping line:', textError.message);
                        // Skip problematic lines but continue with others
                        page.drawText(`[Text contains unsupported characters]`, {
                            x: 50,
                            y: yPosition,
                            size: 10,
                            color: rgb(0.5, 0.5, 0.5),
                        });
                    }
                    
                    yPosition -= 12;
                }
            } else {
                page.drawText('No text extracted from document', {
                    x: 50,
                    y: 650,
                    size: 12,
                    color: rgb(0.5, 0.5, 0.5),
                });
            }

            // Add footer
            page.drawText(`Classified by: Ethiopian Document Classification System`, {
                x: 50,
                y: 30,
                size: 8,
                color: rgb(0.5, 0.5, 0.5),
            });

            // Set PDF metadata
            pdfDoc.setTitle(`Classified Document - ${displayCategory}`);
            pdfDoc.setAuthor('Ethiopian Document System');
            pdfDoc.setSubject(`${displayCategory} Document`);
            pdfDoc.setKeywords(['Ethiopia', 'Document', 'Classification', 'PDF', category]);
            pdfDoc.setCreationDate(new Date());
            pdfDoc.setModificationDate(new Date());

            const pdfBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, pdfBytes);
            
            console.log(`✅ PDF created successfully: ${outputPath}`);
            return outputPath;
        } catch (error) {
            console.error('❌ Error creating text PDF:', error);
            // Create a minimal PDF as fallback
            return await this.createMinimalPDF(outputPath, category, originalPath);
        }
    }

    async createMinimalPDF(outputPath, category, originalPath = null) {
        try {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([600, 400]);
            
            const displayCategory = this.getCategoryDisplayName(category);
            const fileName = originalPath ? path.basename(originalPath) : 'Unknown';
            
            // Only use ASCII characters to ensure no encoding issues
            page.drawText(`Document Classification System`, {
                x: 50,
                y: 350,
                size: 14,
            });

            page.drawText(`Category: ${displayCategory}`, {
                x: 50,
                y: 320,
                size: 12,
            });

            page.drawText(`File: ${fileName}`, {
                x: 50,
                y: 300,
                size: 10,
            });

            page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
                x: 50,
                y: 280,
                size: 10,
            });

            page.drawText(`Note: Original document converted to PDF format.`, {
                x: 50,
                y: 250,
                size: 10,
            });

            page.drawText(`Amharic text preserved in original OCR results.`, {
                x: 50,
                y: 230,
                size: 10,
            });

            const pdfBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, pdfBytes);
            
            console.log(`✅ Minimal PDF created as fallback: ${outputPath}`);
            return outputPath;
        } catch (error) {
            console.error('❌ Error creating minimal PDF:', error);
            throw error;
        }
    }

    cleanTextForPDF(text) {
        if (!text) return '';
        
        try {
            // Remove or replace problematic Unicode characters
            // Keep basic ASCII and common symbols, replace Amharic with placeholders
            return text
                // Replace Amharic characters with descriptive text
                .replace(/[\u1200-\u137F]/g, '[Amharic]')
                // Replace other non-ASCII characters
                .replace(/[^\x00-\x7F]/g, '')
                // Clean up multiple spaces
                .replace(/\s+/g, ' ')
                .trim();
        } catch (error) {
            console.log('⚠️ Text cleaning failed, using empty string');
            return 'Text contains unsupported characters';
        }
    }

    async enhancePDFWithText(pdfPath, extractedText, outputPath) {
        try {
            // For existing PDFs, we'll create a new PDF with the extracted text
            return await this.createTextPDF(extractedText, outputPath, 'enhanced', pdfPath);
        } catch (error) {
            console.error('❌ Error enhancing PDF:', error);
            // If enhancement fails, copy the original
            try {
                await fs.copyFile(pdfPath, outputPath);
                console.log(`✅ PDF copied as fallback: ${outputPath}`);
                return outputPath;
            } catch (copyError) {
                console.error('❌ PDF copy also failed:', copyError);
                // Final fallback: create minimal PDF
                return await this.createMinimalPDF(outputPath, 'enhanced', pdfPath);
            }
        }
    }

    async createSearchablePDF(originalPath, extractedText) {
        // Legacy method for backward compatibility
        console.log('📄 Using legacy createSearchablePDF method');
        return await this.convertToSearchablePDF(originalPath, extractedText, 'classified');
    }

    splitTextIntoLines(text, maxWidth, fontSize) {
        // Simple text wrapping algorithm using only safe characters
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            // Simple character count-based wrapping
            if (testLine.length * (fontSize * 0.6) <= maxWidth) {
                currentLine = testLine;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }

        if (currentLine) lines.push(currentLine);
        return lines;
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

    getCategoryAmharicName(category) {
        const amharicNames = {
            invoice: 'የገቢዎች መግለጫ',
            contract: 'ውል',
            report: 'ሪፖርት',
            id_card: 'መታወቂያ ካርድ',
            educational: 'የትምህርት ሰነድ',
            medical: 'የጤና ሰነድ',
            license: 'ፍቃድ',
            other: 'ሌላ'
        };
        return amharicNames[category] || category;
    }

    // Method to create a simple image placeholder PDF
    async createImagePlaceholderPDF(imagePath, text, outputPath, category) {
        try {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([600, 800]);
            
            const displayCategory = this.getCategoryDisplayName(category);
            
            // Add title (English only)
            page.drawText(`Image Document - ${displayCategory}`, {
                x: 50,
                y: 750,
                size: 16,
                color: rgb(0, 0, 0),
            });

            // Add image placeholder
            page.drawRectangle({
                x: 50,
                y: 600,
                width: 500,
                height: 100,
                color: rgb(0.9, 0.9, 0.9),
                borderColor: rgb(0.7, 0.7, 0.7),
                borderWidth: 1,
            });

            page.drawText(`[Image: ${path.basename(imagePath)}]`, {
                x: 70,
                y: 650,
                size: 12,
                color: rgb(0.5, 0.5, 0.5),
            });

            // Add extracted text (cleaned)
            if (text && text.trim().length > 0) {
                const safeText = this.cleanTextForPDF(text);
                page.drawText(`Extracted Text: ${safeText}`, {
                    x: 50,
                    y: 500,
                    size: 10,
                    color: rgb(0, 0, 0),
                    maxWidth: 500,
                });
            }

            // Add metadata
            pdfDoc.setTitle(`Classified Image - ${displayCategory}`);
            pdfDoc.setAuthor('Ethiopian Document System');

            const pdfBytes = await pdfDoc.save();
            await fs.writeFile(outputPath, pdfBytes);
            
            console.log(`✅ Image placeholder PDF created: ${outputPath}`);
            return outputPath;
        } catch (error) {
            console.error('❌ Error creating image placeholder PDF:', error);
            // Fallback to minimal PDF
            return await this.createMinimalPDF(outputPath, category, imagePath);
        }
    }

    // Test method to verify the converter works
    async testConverter() {
        try {
            console.log('🧪 Testing PDF converter...');
            
            // Use only ASCII text for testing to avoid encoding issues
            const testText = 'This is a test document for the Ethiopian Document Classification System.';
            const testPath = path.join(__dirname, '..', 'test_output.pdf');
            
            const result = await this.createTextPDF(testText, testPath, 'test', '/fake/path/test.jpg');
            
            // Verify the PDF was created
            await fs.access(testPath);
            const stats = await fs.stat(testPath);
            
            if (stats.size > 0) {
                console.log('✅ PDF converter test completed');
                
                // Clean up test file
                await fs.unlink(testPath).catch(() => {});
                return true;
            } else {
                throw new Error('PDF file is empty');
            }
        } catch (error) {
            console.error('❌ PDF converter test failed:', error);
            return false;
        }
    }

    // New method: Convert multiple files
    async convertMultipleFiles(fileDataArray) {
        try {
            console.log(`🔄 Converting ${fileDataArray.length} files to PDF...`);
            
            const results = [];
            
            for (const fileData of fileDataArray) {
                try {
                    const { originalPath, extractedText, category } = fileData;
                    const outputPath = await this.convertToSearchablePDF(originalPath, extractedText, category);
                    
                    results.push({
                        originalPath,
                        outputPath,
                        success: true,
                        error: null
                    });
                    
                } catch (error) {
                    console.error(`Failed to convert ${fileData.originalPath}:`, error);
                    results.push({
                        originalPath: fileData.originalPath,
                        outputPath: null,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            console.log(`✅ Conversion completed: ${results.filter(r => r.success).length}/${fileDataArray.length} successful`);
            return results;
            
        } catch (error) {
            console.error('Batch conversion failed:', error);
            throw error;
        }
    }
}

// Create and export instance
const pdfConverter = new PDFConverter();

// Test the converter on module load
console.log('🧪 Testing PDF converter on startup...');
pdfConverter.testConverter().then(success => {
    console.log(`🎯 PDF Converter test: ${success ? 'PASSED' : 'FAILED'}`);
}).catch(error => {
    console.error('❌ PDF Converter test error:', error);
});

module.exports = pdfConverter;