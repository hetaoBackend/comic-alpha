/**
 * Renderer Module - Handles comic panel rendering
 */

class ComicRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id '${containerId}' not found`);
        }
        this.currentData = null;
        this.onChange = null; // Callback for data changes
    }

    /**
     * Render comic page from JSON data
     * @param {Object} data - Comic page data
     * @returns {boolean} Success status
     */
    render(data) {
        try {
            this.currentData = data;
            this.container.innerHTML = ''; // Clear current content
            const canvas = data && data.canvas;
            const hasFixedCanvas = !!(
                canvas
                && Number(canvas.width) > 0
                && Number(canvas.height) > 0
            );
            this.container.classList.toggle('mobile-comic-canvas', hasFixedCanvas);
            if (hasFixedCanvas) {
                this.container.style.setProperty(
                    '--comic-canvas-ratio',
                    `${Number(canvas.width)} / ${Number(canvas.height)}`
                );
            } else {
                this.container.style.removeProperty('--comic-canvas-ratio');
            }

            // Render rows
            if (data.rows && Array.isArray(data.rows)) {
                data.rows.forEach(row => {
                    const rowDiv = this._createRow(row);
                    this.container.appendChild(rowDiv);
                });
            }

            return true;
        } catch (e) {
            console.error('Render failed:', e);
            return false;
        }
    }

    /**
     * Create a row element
     * @param {Object} row - Row data
     * @returns {HTMLElement} Row element
     */
    _createRow(row) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'comic-row';
        if (this.container.classList.contains('mobile-comic-canvas')) {
            const weight = Number(row.weight);
            rowDiv.style.flex = `${Number.isFinite(weight) && weight > 0 ? weight : 1} 1 0`;
            rowDiv.style.minHeight = '0';
        } else {
            rowDiv.style.height = row.height || '150px';
        }

        if (row.panels && Array.isArray(row.panels)) {
            row.panels.forEach(panel => {
                const panelDiv = this._createPanel(panel);
                rowDiv.appendChild(panelDiv);
            });
        }

        return rowDiv;
    }

    /**
     * Create a panel element
     * @param {Object} panel - Panel data
     * @returns {HTMLElement} Panel element
     */
    _createPanel(panel) {
        const panelDiv = document.createElement('div');
        panelDiv.className = 'comic-panel';
        panelDiv.contentEditable = 'true';
        panelDiv.innerText = panel.text || '';

        // Optional background color
        if (panel.bg) {
            panelDiv.style.backgroundColor = panel.bg;
        }

        // Store reference to panel data
        panelDiv._panelData = panel;

        // Update panel data when content changes
        panelDiv.addEventListener('input', () => {
            panel.text = panelDiv.innerText;
            this._notifyDataChange();
        });

        // Handle Enter key to prevent line breaks
        panelDiv.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
        }, { passive: false });

        return panelDiv;
    }

    /**
     * Clear the container
     */
    clear() {
        this.container.innerHTML = '';
        this.container.classList.remove('mobile-comic-canvas');
        this.container.style.removeProperty('--comic-canvas-ratio');
    }

    /**
     * Get the container element
     * @returns {HTMLElement} Container element
     */
    getContainer() {
        return this.container;
    }

    /**
     * Set callback for data changes
     * @param {Function} callback - Callback function
     */
    setOnChange(callback) {
        this.onChange = callback;
    }

    /**
     * Notify that data has changed
     */
    _notifyDataChange() {
        if (this.onChange && this.currentData) {
            this.onChange(this.currentData);
        }
    }
}

// Export for use in other modules
window.ComicRenderer = ComicRenderer;
