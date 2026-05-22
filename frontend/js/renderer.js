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
        this.onRewrite = null;
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

            // Render rows
            if (data.rows && Array.isArray(data.rows)) {
                data.rows.forEach((row, rowIndex) => {
                    const rowDiv = this._createRow(row, rowIndex);
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
    _createRow(row, rowIndex) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'comic-row';
        rowDiv.style.height = row.height || '150px';

        if (row.panels && Array.isArray(row.panels)) {
            row.panels.forEach((panel, panelIndex) => {
                const panelDiv = this._createPanel(panel, rowIndex, panelIndex);
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
    _createPanel(panel, rowIndex, panelIndex) {
        const panelDiv = document.createElement('div');
        panelDiv.className = 'comic-panel';
        panelDiv.contentEditable = 'false';

        const textEl = document.createElement('div');
        textEl.className = 'panel-text';
        textEl.contentEditable = 'true';
        textEl.innerText = this._getPanelDisplayText(panel);
        panelDiv.appendChild(textEl);

        const controls = document.createElement('div');
        controls.className = 'panel-controls';
        controls.contentEditable = 'false';
        const rewriteBtn = document.createElement('button');
        rewriteBtn.className = 'panel-tool-btn';
        rewriteBtn.type = 'button';
        rewriteBtn.title = 'Rewrite panel';
        rewriteBtn.innerText = 'AI';
        rewriteBtn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.onRewrite) {
                this.onRewrite(panel, { rowIndex, panelIndex });
            }
        };
        controls.appendChild(rewriteBtn);
        panelDiv.appendChild(controls);

        // Optional background color
        if (panel.bg) {
            panelDiv.style.backgroundColor = panel.bg;
        }

        // Store reference to panel data
        panelDiv._panelData = panel;

        // Update panel data when content changes
        textEl.addEventListener('blur', () => {
            panel.text = textEl.innerText;
            this._notifyDataChange();
        });

        // Handle Enter key to prevent line breaks
        textEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
        }, { passive: false });

        return panelDiv;
    }

    /**
     * Make structured panel data readable in the sketch editor.
     * @param {Object} panel Panel data
     * @returns {string} Display text
     */
    _getPanelDisplayText(panel) {
        if (!panel) return '';
        if (panel.text) return panel.text;
        const parts = [];
        if (panel.shot) parts.push(`镜头: ${panel.shot}`);
        if (panel.location_id) parts.push(`场景: ${panel.location_id}`);
        if (panel.characters && panel.characters.length) parts.push(`角色: ${panel.characters.join(', ')}`);
        if (panel.action) parts.push(panel.action);
        if (panel.emotion) parts.push(`情绪: ${panel.emotion}`);
        if (panel.visual_notes) parts.push(panel.visual_notes);
        if (panel.dialogue && panel.dialogue.length) {
            panel.dialogue.forEach(line => {
                if (line.text) {
                    parts.push(line.speaker ? `${line.speaker}: "${line.text}"` : `"${line.text}"`);
                }
            });
        }
        return parts.join('；');
    }

    /**
     * Clear the container
     */
    clear() {
        this.container.innerHTML = '';
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
     * Set callback for AI rewrite requests.
     * @param {Function} callback Rewrite callback
     */
    setRewriteHandler(callback) {
        this.onRewrite = callback;
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
