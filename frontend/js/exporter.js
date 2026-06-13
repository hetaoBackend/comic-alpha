/**
 * Exporter Module - Handles image export functionality
 */

class ComicExporter {
    /**
     * Download single page as image
     * @param {HTMLElement} element - Element to export
     * @param {string} filename - Output filename
     * @returns {Promise<boolean>} Success status
     */
    static async downloadPage(element, filename = null) {
        try {
            if (!window.html2canvas) {
                throw new Error('html2canvas library not loaded');
            }

            const canvas = await html2canvas(element, {
                backgroundColor: '#ffffff',
                scale: 2, // Higher quality
                logging: false,
                useCORS: true
            });

            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    const timestamp = new Date().getTime();
                    link.download = filename || `comic_${timestamp}.png`;
                    link.href = url;
                    link.click();
                    URL.revokeObjectURL(url);
                    resolve(true);
                });
            });
        } catch (error) {
            console.error('Export failed:', error);
            return false;
        }
    }

    /**
     * Download multiple pages as images
     * @param {HTMLElement} element - Element to export
     * @param {Array} pages - Array of page data
     * @param {Function} renderCallback - Callback to render each page
     * @param {Function} progressCallback - Progress callback (optional)
     * @returns {Promise<boolean>} Success status
     */
    static async downloadAllPages(element, pages, renderCallback, progressCallback = null) {
        try {
            if (!window.html2canvas) {
                throw new Error('html2canvas library not loaded');
            }

            for (let i = 0; i < pages.length; i++) {
                // Update progress
                if (progressCallback) {
                    progressCallback(i + 1, pages.length);
                }

                // Render the page
                await renderCallback(i);

                // Wait for rendering to complete
                await this._delay(500);

                // Export the page
                const canvas = await html2canvas(element, {
                    backgroundColor: '#ffffff',
                    scale: 2,
                    logging: false,
                    useCORS: true
                });

                await new Promise((resolve) => {
                    canvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        const timestamp = new Date().getTime();
                        link.download = `comic_page_${i + 1}_${timestamp}.png`;
                        link.href = url;
                        link.click();
                        URL.revokeObjectURL(url);
                        resolve();
                    });
                });

                // Delay to avoid browser blocking multiple downloads
                await this._delay(300);
            }

            return true;
        } catch (error) {
            console.error('Batch export failed:', error);
            return false;
        }
    }

    /**
     * Get element as base64 data URL
     * @param {HTMLElement} element - Element to convert
     * @returns {Promise<string>} Base64 data URL
     */
    static async getBase64(element) {
        try {
            if (!window.html2canvas) {
                throw new Error('html2canvas library not loaded');
            }

            const canvas = await html2canvas(element, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true
            });

            return canvas.toDataURL('image/png');
        } catch (error) {
            console.error('Get base64 failed:', error);
            throw error;
        }
    }

    /**
     * Get element as base64 data URL without text content (layout only)
     * @param {HTMLElement} element - Element to convert
     * @returns {Promise<string>} Base64 data URL
     */
    static async getBase64WithoutText(element) {
        try {
            if (!window.html2canvas) {
                throw new Error('html2canvas library not loaded');
            }

            // Find all comic panels and temporarily hide their text
            const panels = element.querySelectorAll('.comic-panel');
            const originalTexts = [];
            
            // Store original text and clear it
            panels.forEach(panel => {
                originalTexts.push(panel.innerText);
                panel.innerText = '';
            });

            // Generate canvas without text
            const canvas = await html2canvas(element, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true
            });

            // Restore original text
            panels.forEach((panel, index) => {
                panel.innerText = originalTexts[index];
            });

            return canvas.toDataURL('image/png');
        } catch (error) {
            console.error('Get base64 without text failed:', error);
            throw error;
        }
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    static _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in other modules
window.ComicExporter = ComicExporter;
