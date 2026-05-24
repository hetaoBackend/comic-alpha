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

        const metadata = this._getPanelMetadata(panel);
        if (metadata.length > 0) {
            panelDiv.classList.add('has-panel-meta');
            const metaEl = document.createElement('div');
            metaEl.className = 'panel-meta';
            metaEl.contentEditable = 'false';
            metadata.forEach((item) => {
                const chip = document.createElement('span');
                chip.className = 'panel-meta-chip';
                chip.title = `${item.label}: ${item.rawValue || item.value}`;
                chip.innerText = `${item.label} ${item.value}`;
                metaEl.appendChild(chip);
            });
            panelDiv.appendChild(metaEl);
        }

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

        // Keep the in-memory script current while the user edits. Generation
        // can start before a contenteditable blur event has finished.
        const persistPanelText = () => {
            if (panel.text !== textEl.innerText) {
                panel.text = textEl.innerText;
                this._notifyDataChange();
            }
        };
        textEl.addEventListener('input', persistPanelText);
        textEl.addEventListener('blur', persistPanelText);

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

        if (panel.text) {
            const readableText = this._getReadableTextFromRaw(panel.text);
            if (readableText) return readableText;
        }

        const parts = [];
        if (panel.action) parts.push(panel.action);
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
     * Extract production metadata for compact badges.
     * @param {Object} panel Panel data
     * @returns {Array<{label: string, value: string, rawValue: string}>}
     */
    _getPanelMetadata(panel) {
        if (!panel) return [];

        const items = [];
        const addItem = (label, rawValue) => {
            const value = this._formatMetaValue(rawValue);
            if (value) items.push({ label, value, rawValue: String(rawValue) });
        };

        if (panel.shot) addItem('镜头', panel.shot);
        if (panel.location_id) addItem('场景', panel.location_id);
        if (panel.characters && panel.characters.length) addItem('角色', panel.characters.join('、'));
        if (panel.emotion) addItem('情绪', panel.emotion);

        if (items.length === 0 && panel.text) {
            this._splitPanelText(panel.text).forEach((segment) => {
                const parsed = this._parseMetadataSegment(segment);
                if (parsed && ['镜头', '场景', '角色', '情绪'].includes(parsed.label)) {
                    addItem(parsed.label, parsed.value);
                }
            });
        }

        return items;
    }

    /**
     * Strip technical fields from auto-composed panel text.
     * @param {string} rawText Raw panel text
     * @returns {string}
     */
    _getReadableTextFromRaw(rawText) {
        return this._splitPanelText(rawText)
            .map((segment) => this._cleanPanelTextSegment(segment))
            .filter(Boolean)
            .join('；');
    }

    _splitPanelText(text) {
        if (!text || typeof text !== 'string') return [];
        return text
            .replace(/\n+/g, '；')
            .split(/[；;]/)
            .map(part => part.trim())
            .filter(Boolean);
    }

    _parseMetadataSegment(segment) {
        const match = segment.match(/^([^:=：]+)\s*[:=：]\s*(.+)$/);
        if (!match) return null;

        const label = match[1].trim().toLowerCase();
        const value = match[2].trim();
        const labelMap = {
            '镜头': '镜头',
            'shot': '镜头',
            '场景': '场景',
            'location': '场景',
            'location_id': '场景',
            '角色': '角色',
            'characters': '角色',
            'character': '角色',
            '情绪': '情绪',
            'emotion': '情绪'
        };

        if (!labelMap[label]) return null;
        return { label: labelMap[label], value };
    }

    _cleanPanelTextSegment(segment) {
        const parsed = this._parseMetadataSegment(segment);
        if (parsed) return '';

        const fieldMatch = segment.match(/^([^:=：]+)\s*[:=：]\s*(.+)$/);
        if (!fieldMatch) return segment;

        const label = fieldMatch[1].trim().toLowerCase();
        const value = fieldMatch[2].trim();
        if (['action', 'visual_notes', 'dialogue'].includes(label)) {
            return value;
        }
        if (['negative_notes', 'forbidden', 'forbidden_changes'].includes(label)) {
            return '';
        }

        return segment;
    }

    _formatMetaValue(value) {
        if (!value) return '';
        return String(value)
            .replace(/_/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
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
     * Flush any active contenteditable panel text into currentData.
     * @returns {boolean} Whether any panel data changed
     */
    syncEdits() {
        let changed = false;
        const textElements = this.container.querySelectorAll('.panel-text');
        textElements.forEach((textEl) => {
            const panelDiv = textEl.closest('.comic-panel');
            const panel = panelDiv ? panelDiv._panelData : null;
            if (panel && panel.text !== textEl.innerText) {
                panel.text = textEl.innerText;
                changed = true;
            }
        });

        if (changed) {
            this._notifyDataChange();
        }

        return changed;
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
