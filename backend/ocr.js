const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');

class OCRProcessor {
    constructor() {
        this.supportedLanguages = ['amh', 'eng'];
        this.worker = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            console.log('Initializing OCR processor for Amharic and English...');
            this.worker = await Tesseract.createWorker('amh+eng', 1, {
                logger: progress => {
                    if (progress.status === 'recognizing text') {
                        console.log(`OCR Progress: ${Math.round(progress.progress * 100)}%`);
                    }
                },
                tessedit_pageseg_mode: '6', // Uniform block of text
                tessedit_ocr_engine_mode: '1', // Neural nets LSTM engine
                preserve_interword_spaces: '1',
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?@#$%&*()_+-=[]{}|;:\'"<>/\\፩፪፫፬፭፮፯፰፱፲፳፴፵፶፷፸፹፺፻፼\u1200-\u137F'
            });
            
            this.initialized = true;
            console.log('OCR processor initialized successfully for Amharic + English');
        } catch (error) {
            console.error('Failed to initialize OCR processor:', error);
            throw error;
        }
    }

    async extractText(filePath) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            console.log(`Starting text extraction for: ${filePath}`);
            
            await fs.access(filePath);
            
            const fileExtension = path.extname(filePath).toLowerCase();
            const fileName = path.basename(filePath);
            
            console.log(`Processing file: ${fileName} (${fileExtension})`);
            
            let extractedText = '';
            
            if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.tif'].includes(fileExtension)) {
                extractedText = await this.processImageFile(filePath);
            } else if (fileExtension === '.pdf') {
                extractedText = await this.processPDFFile(filePath);
            } else {
                throw new Error(`Unsupported file format: ${fileExtension}`);
            }
            
            extractedText = this.cleanExtractedText(extractedText);
            
            // Analyze the extracted text
            this.analyzeExtractedText(extractedText, fileName);
            
            console.log(`Text extraction completed for: ${fileName}`);
            console.log(`Extracted ${extractedText.length} characters`);
            
            return extractedText;
            
        } catch (error) {
            console.error('Text extraction failed:', error);
            throw new Error(`Failed to extract text from ${path.basename(filePath)}: ${error.message}`);
        }
    }

    async processPDFFile(pdfPath) {
        console.log('Processing PDF file for Amharic and English text...');
        
        try {
            // Strategy 1: Extract embedded text (for digital PDFs)
            console.log('📖 Attempting to extract embedded text...');
            const embeddedText = await this.extractEmbeddedPDFText(pdfPath);
            
            if (this.isValidText(embeddedText)) {
                const analysis = this.analyzeLanguage(embeddedText);
                console.log(`✅ Using embedded text: ${analysis.englishWords} English words, ${analysis.amharicWords} Amharic words`);
                return embeddedText;
            }
            
            // Strategy 2: Convert PDF to high-quality images and OCR
            console.log('🖼️ Converting PDF pages to images for OCR...');
            const ocrText = await this.extractTextFromPDFWithOCR(pdfPath);
            
            if (this.isValidText(ocrText)) {
                const analysis = this.analyzeLanguage(ocrText);
                console.log(`✅ Using OCR text: ${analysis.englishWords} English words, ${analysis.amharicWords} Amharic words`);
                return ocrText;
            }
            
            // Strategy 3: Fallback methods
            console.log('🔧 Using fallback extraction methods...');
            const fallbackText = await this.fallbackPDFExtraction(pdfPath);
            
            return fallbackText || 'No text could be extracted from the PDF document.';
            
        } catch (error) {
            console.error('PDF processing failed:', error);
            return await this.fallbackPDFExtraction(pdfPath);
        }
    }

    async extractEmbeddedPDFText(pdfPath) {
        try {
            const dataBuffer = await fs.readFile(pdfPath);
            
            // Method 1: Use pdf-parse for better text extraction
            try {
                const pdfData = await pdfParse(dataBuffer);
                if (pdfData.text && this.isValidText(pdfData.text)) {
                    return pdfData.text;
                }
            } catch (parseError) {
                console.log('pdf-parse failed, trying alternative methods...');
            }
            
            // Method 2: Extract from PDF metadata and content
            const extractedText = await this.extractPDFTextAdvanced(dataBuffer);
            if (this.isValidText(extractedText)) {
                return extractedText;
            }
            
            return '';
            
        } catch (error) {
            console.log('Embedded PDF text extraction failed:', error.message);
            return '';
        }
    }

    async extractPDFTextAdvanced(dataBuffer) {
        try {
            let fullText = '';
            
            // Method 1: Extract from PDF metadata using pdf-lib
            try {
                const pdfDoc = await PDFDocument.load(dataBuffer);
                const metadata = [
                    pdfDoc.getTitle(),
                    pdfDoc.getAuthor(),
                    pdfDoc.getSubject(),
                    pdfDoc.getKeywords(),
                    pdfDoc.getCreator(),
                    pdfDoc.getProducer()
                ].filter(Boolean).join(' ');
                
                if (metadata) fullText += metadata + ' ';
            } catch (error) {
                console.log('PDF metadata extraction failed');
            }
            
            // Method 2: Binary text extraction for Amharic and English
            const bufferString = dataBuffer.toString('binary');
            
            // Extract English text patterns
            const englishPatterns = [
                /[A-Za-z][A-Za-z0-9 ,\.!?;:\(\)]{10,}/g,
                /[A-Za-z]{3,}/g
            ];
            
            for (const pattern of englishPatterns) {
                const matches = bufferString.match(pattern) || [];
                fullText += matches.join(' ') + ' ';
            }
            
            // Extract Amharic Unicode characters
            const amharicRegex = /[\u1200-\u137F]{2,}/g;
            const amharicMatches = bufferString.match(amharicRegex) || [];
            if (amharicMatches.length > 0) {
                fullText += 'Amharic Text: ' + amharicMatches.join(' ') + ' ';
            }
            
            return fullText.trim();
            
        } catch (error) {
            console.log('Advanced PDF text extraction failed:', error.message);
            return '';
        }
    }

    async extractTextFromPDFWithOCR(pdfPath) {
        try {
            console.log('Converting PDF to high-resolution images for OCR...');
            
            // Create temporary directory
            const tempDir = path.join(path.dirname(pdfPath), `temp_pdf_${Date.now()}`);
            await fs.mkdir(tempDir, { recursive: true });
            
            let fullText = '';
            
            try {
                // Convert PDF pages to high-quality images
                const imagePaths = await this.convertPDFToImages(pdfPath, tempDir);
                
                console.log(`🔄 OCR processing ${imagePaths.length} pages...`);
                
                // Process each page with enhanced OCR
                for (let i = 0; i < Math.min(imagePaths.length, 5); i++) { // Limit to first 5 pages
                    console.log(`📄 Processing page ${i + 1}/${imagePaths.length}...`);
                    
                    const pageText = await this.processImageWithEnhancedOCR(imagePaths[i]);
                    if (pageText && pageText.trim().length > 10) {
                        fullText += `\n--- Page ${i + 1} ---\n${pageText}\n`;
                    }
                    
                    // Clean up page image
                    await fs.unlink(imagePaths[i]).catch(() => {});
                }
                
            } finally {
                // Cleanup temp directory
                await this.cleanupTempDir(tempDir);
            }
            
            return fullText;
            
        } catch (error) {
            console.error('PDF OCR extraction failed:', error);
            throw error;
        }
    }

    async convertPDFToImages(pdfPath, outputDir) {
        const imagePaths = [];
        
        try {
            // Use sharp to convert PDF pages to high-quality images
            console.log('Using sharp for PDF to image conversion...');
            
            // Get PDF metadata to determine number of pages
            const metadata = await sharp(pdfPath).metadata();
            const pageCount = metadata.pages || 1;
            
            console.log(`📄 PDF has ${pageCount} pages`);
            
            // Convert each page to high-resolution image
            for (let page = 0; page < pageCount; page++) {
                const outputPath = path.join(outputDir, `page_${page + 1}.png`);
                
                try {
                    await sharp(pdfPath, { 
                        density: 300, // High DPI for better OCR
                        page: page 
                    })
                    .png()
                    .toFile(outputPath);
                    
                    imagePaths.push(outputPath);
                    console.log(`✅ Converted page ${page + 1} to image`);
                    
                } catch (pageError) {
                    console.log(`⚠️ Failed to convert page ${page + 1}:`, pageError.message);
                }
            }
            
        } catch (error) {
            console.log('Sharp PDF conversion failed, trying alternative...');
            // Fallback: Try to process the first page directly
            try {
                const firstPagePath = path.join(outputDir, 'page_1.png');
                await sharp(pdfPath, { density: 300 })
                    .png()
                    .toFile(firstPagePath);
                imagePaths.push(firstPagePath);
            } catch (fallbackError) {
                console.log('Fallback conversion also failed');
            }
        }
        
        return imagePaths;
    }

    async processImageWithEnhancedOCR(imagePath) {
        try {
            console.log('🔄 Running enhanced OCR on image...');
            
            // Preprocess image for better Amharic and English recognition
            const processedImage = await this.preprocessImageForOCR(imagePath);
            
            const { data } = await this.worker.recognize(processedImage, 'amh+eng', {
                tessedit_pageseg_mode: '6',
                tessedit_ocr_engine_mode: '1'
            });
            
            // Clean up processed image if different from original
            if (processedImage !== imagePath) {
                await fs.unlink(processedImage).catch(() => {});
            }
            
            return data.text || '';
            
        } catch (error) {
            console.error('Enhanced OCR failed:', error);
            return '';
        }
    }

    async preprocessImageForOCR(imagePath) {
        try {
            const processedPath = path.join(
                path.dirname(imagePath),
                `enhanced_${path.basename(imagePath)}`
            );
            
            // Enhanced preprocessing for both Amharic and English
            await sharp(imagePath)
                .grayscale() // Better for text recognition
                .linear(1.3, 0) // Increase contrast
                .sharpen({ 
                    sigma: 1.5,
                    m1: 1,
                    m2: 3
                })
                .normalize() // Normalize brightness
                .median(3) // Noise reduction
                .threshold(128, { 
                    grayscale: true 
                }) // Binarization for clean text
                .toFile(processedPath);
            
            return processedPath;
            
        } catch (error) {
            console.log('Image preprocessing failed, using original:', error.message);
            return imagePath;
        }
    }

    async processImageFile(imagePath) {
        console.log('Processing image file with enhanced OCR...');
        
        try {
            const processedImage = await this.preprocessImageForOCR(imagePath);
            const { data } = await this.worker.recognize(processedImage);
            
            if (processedImage !== imagePath) {
                await fs.unlink(processedImage).catch(() => {});
            }
            
            return data.text || 'No text found in image.';
            
        } catch (error) {
            console.error('Image OCR processing failed:', error);
            throw error;
        }
    }

    async fallbackPDFExtraction(pdfPath) {
        try {
            console.log('Using comprehensive fallback extraction...');
            const dataBuffer = await fs.readFile(pdfPath);
            
            let fallbackText = '';
            
            // Method 1: Binary text extraction
            const bufferString = dataBuffer.toString('binary');
            
            // Extract meaningful English phrases
            const englishPhrases = bufferString.match(/[A-Za-z][A-Za-z0-9 ,\.!?;:\(\)\-]{10,200}/g) || [];
            fallbackText += englishPhrases.join(' ') + ' ';
            
            // Extract Amharic characters
            const amharicChars = bufferString.match(/[\u1200-\u137F]{2,}/g) || [];
            if (amharicChars.length > 0) {
                fallbackText += 'Amharic Text: ' + amharicChars.join(' ') + ' ';
            }
            
            // Extract numbers and dates
            const numbers = bufferString.match(/\b\d{1,4}\b/g) || [];
            fallbackText += numbers.join(' ') + ' ';
            
            if (this.isValidText(fallbackText)) {
                return fallbackText;
            }
            
            return 'Limited text extracted. This may be a scanned document or image-based PDF.';
            
        } catch (error) {
            console.error('Fallback extraction failed:', error);
            return 'Unable to extract text from this PDF file.';
        }
    }

    analyzeLanguage(text) {
        const englishWordCount = (text.match(/[A-Za-z]{2,}/g) || []).length;
        const amharicWordCount = (text.match(/[\u1200-\u137F]{2,}/g) || []).length;
        const totalWords = (text.match(/\S+/g) || []).length;
        
        return {
            englishWords: englishWordCount,
            amharicWords: amharicWordCount,
            totalWords: totalWords,
            englishPercentage: totalWords > 0 ? Math.round((englishWordCount / totalWords) * 100) : 0,
            amharicPercentage: totalWords > 0 ? Math.round((amharicWordCount / totalWords) * 100) : 0
        };
    }

    analyzeExtractedText(text, fileName) {
        if (!text) return;
        
        const analysis = this.analyzeLanguage(text);
        
        console.log(`📊 Text Analysis for ${fileName}:`);
        console.log(`   Total characters: ${text.length}`);
        console.log(`   Total words: ${analysis.totalWords}`);
        console.log(`   English words: ${analysis.englishWords} (${analysis.englishPercentage}%)`);
        console.log(`   Amharic words: ${analysis.amharicWords} (${analysis.amharicPercentage}%)`);
        console.log(`   Language: ${analysis.englishPercentage > analysis.amharicPercentage ? 'Primarily English' : 'Primarily Amharic'}`);
        
        // Show text samples
        const sampleLength = Math.min(200, text.length);
        console.log(`   Sample: ${text.substring(0, sampleLength)}...`);
    }

    isValidText(text) {
        if (!text) return false;
        
        const cleanText = text.trim();
        if (cleanText.length < 20) return false;
        
        // Check for meaningful content in either language
        const hasEnglish = /[A-Za-z]{3,}/.test(cleanText);
        const hasAmharic = /[\u1200-\u137F]{2,}/.test(cleanText);
        const wordCount = (cleanText.match(/\S+/g) || []).length;
        
        return (hasEnglish || hasAmharic) && wordCount >= 5;
    }

    cleanExtractedText(text) {
        if (!text) return 'No text could be extracted from the document.';
        
        return text
            .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines
            .replace(/[^\S\n]+/g, ' ') // Replace multiple spaces
            .replace(/\s+\./g, '.') // Fix spaces before periods
            .replace(/([.!?])\s*/g, '$1 ') // Normalize punctuation spacing
            .trim();
    }

    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.initialized = false;
            console.log('OCR worker terminated');
        }
    }

    // Utility methods
    isSupportedFormat(filePath) {
        const extension = path.extname(filePath).toLowerCase();
        return ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.tif'].includes(extension);
    }

    getSupportedFormats() {
        return ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.tif'];
    }

    // Method to get text statistics
    getTextStatistics(text) {
        if (!text) {
            return {
                totalCharacters: 0,
                totalWords: 0,
                englishWords: 0,
                amharicWords: 0,
                language: 'Unknown'
            };
        }
        
        const analysis = this.analyzeLanguage(text);
        
        return {
            totalCharacters: text.length,
            totalWords: analysis.totalWords,
            englishWords: analysis.englishWords,
            amharicWords: analysis.amharicWords,
            englishPercentage: analysis.englishPercentage,
            amharicPercentage: analysis.amharicPercentage,
            language: analysis.englishPercentage > analysis.amharicPercentage ? 'English' : 
                     analysis.amharicPercentage > analysis.englishPercentage ? 'Amharic' : 'Mixed'
        };
    }
}

// Create singleton instance
const ocrProcessor = new OCRProcessor();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down OCR processor...');
    await ocrProcessor.terminate();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Terminating OCR processor...');
    await ocrProcessor.terminate();
    process.exit(0);
});

module.exports = ocrProcessor;