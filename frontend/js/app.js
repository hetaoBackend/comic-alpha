/**
 * UI Controller Module - Main application controller
 */

class UIController {
    constructor() {
        this.pageManager = new PageManager();
        this.renderer = new ComicRenderer('comic-page');
        this.isGenerating = false;
        this.isViewingImage = false;
        this.generatedPagesImages = {}; // Store generated images by page index for reference

        // Initialize reference image state
        this.referenceImage = null;

        // Initialize session manager
        this.sessionManager = new SessionManager();

        // Initialize i18n
        if (window.i18n) {
            window.i18n.init();
        }

        this.initElements();
        this.initEventListeners();
        this.loadInitialConfig();
        this.initLanguage();

        // Load current session state
        this.loadSessionState();

        // Update session selector UI
        this.updateSessionSelector();

        // Initialize button state
        this.updateGenerateButtonState();
    }

    /**
     * Initialize DOM element references
     */
    initElements() {
        // Input elements
        this.apiKeyInput = document.getElementById('api-key');
        this.googleApiKeyInput = document.getElementById('google-api-key');
        this.promptInput = document.getElementById('prompt-input');
        this.pageCountInput = document.getElementById('page-count');
        this.rowsPerPageSelect = document.getElementById('rows-per-page');
        this.comicStyleSelect = document.getElementById('comic-style');
        this.comicLanguageSelect = document.getElementById('comic-language');
        this.jsonInput = document.getElementById('json-input');

        // Config elements
        this.baseUrlInput = document.getElementById('base-url');
        this.modelSelect = document.getElementById('model-select');
        this.customModelInput = document.getElementById('custom-model');
        this.configPanel = document.getElementById('config-panel');

        // Button elements
        this.generateBtn = document.querySelector('button[onclick="generateWithAI()"]');
        this.renderBtn = document.querySelector('button[onclick="renderComic()"]');
        this.downloadBtn = document.querySelector('.download-btn');
        this.generateAllBtn = document.getElementById('generate-all-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.optimizeBtn = document.getElementById('optimize-btn');

        // Status elements
        this.aiStatus = document.getElementById('ai-status');
        this.errorMsg = document.getElementById('error-msg');
        this.pageIndicator = document.getElementById('page-indicator');
        this.pageNav = document.getElementById('page-nav');
        this.renderCurrentBtn = document.getElementById('render-current-btn');
        this.toggleViewBtn = document.getElementById('toggle-view-btn');

        // Reference Image elements
        this.imagePreviewContainer = document.getElementById('image-preview-container');
        this.referenceImagePreview = document.getElementById('reference-image-preview');

        console.log('UIController elements initialized:', {
            renderCurrentBtn: !!this.renderCurrentBtn,
            toggleViewBtn: !!this.toggleViewBtn,
            optimizeBtn: !!this.optimizeBtn
        });
    }

    /**
     * Initialize event listeners
     */
    initEventListeners() {
        // API key auto-save
        this.apiKeyInput.addEventListener('blur', () => {
            ConfigManager.saveApiKey(this.apiKeyInput.value);
        });

        // Google API key auto-save
        this.googleApiKeyInput.addEventListener('blur', () => {
            ConfigManager.saveGoogleApiKey(this.googleApiKeyInput.value);
        });

        // Model select change
        this.modelSelect.addEventListener('change', () => {
            const customInput = document.getElementById('custom-model-input');
            if (this.modelSelect.value === 'custom') {
                customInput.style.display = 'block';
            } else {
                customInput.style.display = 'none';
            }
        });

        // Listen for language change events
        window.addEventListener('languageChanged', (e) => {
            this.onLanguageChanged(e.detail.lang);
        });

        // Add keyboard shortcut for Command+Enter (or Ctrl+Enter on Windows/Linux)
        this.promptInput.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                this.generateWithAI();
            }
        });

        // Input validation for generate button
        this.promptInput.addEventListener('input', () => {
            this.updateGenerateButtonState();
        });

        // Save session state when style or language changes
        if (this.comicStyleSelect) {
            this.comicStyleSelect.addEventListener('change', () => {
                this.saveCurrentSessionState();
            });
        }

        if (this.comicLanguageSelect) {
            this.comicLanguageSelect.addEventListener('change', () => {
                this.saveCurrentSessionState();
            });
        }

        // Save session state for prompt and page count
        if (this.promptInput) {
            this.promptInput.addEventListener('blur', () => {
                this.saveCurrentSessionState();
            });

            // Handle image paste
            this.promptInput.addEventListener('paste', (e) => {
                this.handleImagePaste(e);
            });
        }

        if (this.pageCountInput) {
            this.pageCountInput.addEventListener('change', () => {
                this.saveCurrentSessionState();
            });
        }

        if (this.rowsPerPageSelect) {
            this.rowsPerPageSelect.addEventListener('change', () => {
                this.saveCurrentSessionState();
            });
        }
    }

    /**
     * Update generate button state based on input
     */
    updateGenerateButtonState() {
        if (!this.generateBtn || !this.promptInput) return;

        // Don't change state if currently generating
        if (this.isGenerating) return;

        const prompt = this.promptInput.value.trim();
        this.generateBtn.disabled = prompt === '';
    }

    /**
     * Initialize language selector
     */
    initLanguage() {
        const languageSelect = document.getElementById('language-select');
        if (languageSelect && window.i18n) {
            const currentLang = window.i18n.getLanguage();
            languageSelect.value = currentLang;

            // Sync comic language with interface language on page load
            const comicLanguageSelect = document.getElementById('comic-language');
            if (comicLanguageSelect) {
                comicLanguageSelect.value = currentLang;
            }
        }
    }

    /**
     * Handle language change
     * @param {string} lang - New language code
     */
    onLanguageChanged(lang) {
        // Update page indicator if visible
        if (this.pageManager.getPageCount() > 0) {
            const current = this.pageManager.getCurrentPageIndex() + 1;
            const total = this.pageManager.getPageCount();
            this.pageIndicator.innerText = ' (' + window.i18n.t('pageIndicator', { current, total }) + ')';
        }
    }

    /**
     * Load initial configuration
     */
    loadInitialConfig() {
        const config = ConfigManager.loadConfig();
        this.baseUrlInput.value = config.baseUrl;
        this.modelSelect.value = config.model;

        if (config.customModel) {
            this.customModelInput.value = config.customModel;
        }

        if (config.model === 'custom') {
            document.getElementById('custom-model-input').style.display = 'block';
        }

        // Load saved API key
        this.apiKeyInput.value = ConfigManager.loadApiKey();

        // Load saved Google API key
        this.googleApiKeyInput.value = ConfigManager.loadGoogleApiKey();

        // Set up renderer onChange callback
        this.renderer.setOnChange((data) => {
            this.onComicDataChange(data);
        });

        // Render initial comic
        this.renderComic();
    }

    /**
     * Toggle configuration panel
     */
    toggleConfig() {
        if (this.configPanel.style.display === 'none') {
            this.configPanel.style.display = 'block';
        } else {
            this.configPanel.style.display = 'none';
        }
    }

    /**
     * Save configuration
     */
    saveConfig() {
        const baseUrl = this.baseUrlInput.value.trim();
        const model = this.modelSelect.value;
        const customModel = this.customModelInput.value.trim();
        const apiKey = this.apiKeyInput.value.trim();
        const googleApiKey = this.googleApiKeyInput.value.trim();

        const config = {
            baseUrl: baseUrl,
            model: model,
            customModel: customModel
        };

        const configSaved = ConfigManager.saveConfig(config);
        const apiKeySaved = ConfigManager.saveApiKey(apiKey);
        const googleApiKeySaved = ConfigManager.saveGoogleApiKey(googleApiKey);

        if (configSaved && apiKeySaved && googleApiKeySaved) {
            alert(window.i18n.t('alertConfigSaved'));
        } else {
            alert(window.i18n.t('alertConfigFailed'));
        }
    }

    /**
     * Toggle advanced configuration section
     */
    toggleAdvancedSettings() {
        const advancedConfig = document.getElementById('advanced-config');
        const chevron = document.getElementById('advanced-chevron');
        if (advancedConfig.style.display === 'none') {
            advancedConfig.style.display = 'block';
            chevron.style.transform = 'rotate(90deg)';
        } else {
            advancedConfig.style.display = 'none';
            chevron.style.transform = 'rotate(0deg)';
        }
    }

    /**
     * Handle image paste into prompt input
     * @param {ClipboardEvent} event - Paste event
     */
    handleImagePaste(event) {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;

        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                this._processImageFile(file);
                // Prevent default paste if it's an image
                // event.preventDefault(); // Don't prevent default, user might be pasting text AND image (rare) or just text
            }
        }
    }

    /**
     * Process an image file (from paste or upload)
     * @param {File} file 
     */
    _processImageFile(file) {
        if (!file) return;

        // Check file size (e.g., limit to 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert(window.i18n.t('alertFileTooLarge') || 'File is too large. Please upload an image smaller than 5MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64Image = e.target.result;
            this.referenceImage = base64Image;

            // Update UI
            if (this.referenceImagePreview) {
                this.referenceImagePreview.src = base64Image;
            }
            if (this.imagePreviewContainer) {
                this.imagePreviewContainer.style.display = 'flex';
            }

            // Save to session state
            this.saveCurrentSessionState();
        };
        reader.readAsDataURL(file);
    }

    /**
     * Remove the uploaded reference image
     */
    removeReferenceImage() {
        this.referenceImage = null;
        if (this.referenceImageInput) {
            this.referenceImageInput.value = '';
        }
        if (this.imagePreviewContainer) {
            this.imagePreviewContainer.style.display = 'none';
        }
        if (this.referenceImagePreview) {
            this.referenceImagePreview.src = '';
        }

        // Save to session state
        this.saveCurrentSessionState();
    }

    /**
     * Optimize user's prompt using AI
     */
    async optimizePrompt() {
        const apiKey = this.apiKeyInput.value.trim();
        const googleApiKey = this.googleApiKeyInput.value.trim();
        const prompt = this.promptInput.value.trim();
        const comicStyle = this.comicStyleSelect.value;
        const language = this.comicLanguageSelect.value;

        // Validate inputs
        if (!apiKey && !googleApiKey) {
            alert(window.i18n.t('alertNoApiKey') || 'Please enter OpenAI API Key or Google API Key');
            return;
        }

        if (!prompt) {
            alert(window.i18n.t('alertEmptyPrompt') || 'Please enter content first');
            return;
        }

        try {
            // Update button state
            this.optimizeBtn.disabled = true;
            this.optimizeBtn.classList.add('loading');

            const config = ConfigManager.getCurrentConfig();

            // Call API
            const result = await ComicAPI.optimizePrompt(
                apiKey,
                googleApiKey,
                prompt,
                config.baseUrl,
                config.model,
                comicStyle,
                language
            );

            if (result.success && result.optimized_prompt) {
                // Replace prompt with optimized version
                this.promptInput.value = result.optimized_prompt;
                
                // Show success message (optional)
                this.showStatus(window.i18n.t('statusOptimizeSuccess') || 'Prompt optimized', 'success');
                setTimeout(() => this.hideStatus(), 2000);
            } else {
                throw new Error('Optimization failed');
            }

        } catch (error) {
            console.error('Prompt optimization failed:', error);
            this.showStatus(window.i18n.t('statusError', { error: error.message }), 'error');
            alert(window.i18n.t('alertOptimizeFailed', { error: error.message }) || `Optimization failed: ${error.message}`);
        } finally {
            // Restore button state
            this.optimizeBtn.disabled = false;
            this.optimizeBtn.classList.remove('loading');
        }
    }

    /**
     * Generate comic with AI
     */
    async generateWithAI() {
        if (this.isGenerating) return;

        const apiKey = this.apiKeyInput.value.trim();
        const googleApiKey = this.googleApiKeyInput.value.trim();
        const prompt = this.promptInput.value.trim();
        const pageCount = parseInt(this.pageCountInput.value) || 3;
        const rowsPerPage = parseInt(this.rowsPerPageSelect.value) || 4;
        const comicStyle = this.comicStyleSelect.value;
        const language = this.comicLanguageSelect.value;

        // Validate inputs
        if (!apiKey && !googleApiKey) {
            alert(window.i18n.t('alertNoApiKey') || 'Please enter OpenAI API Key or Google API Key');
            return;
        }

        if (!prompt) {
            alert(window.i18n.t('alertNoPrompt'));
            return;
        }

        const originalBtnContent = this.generateBtn.innerHTML;

        try {
            this.isGenerating = true;
            const config = ConfigManager.getCurrentConfig();

            // Update UI with spinner
            this.generateBtn.disabled = true;
            this.generateBtn.classList.add('loading');
            this.generateBtn.innerHTML = '<span class="spinner" style="margin-right: 0;"></span>';
            // this.showStatus(window.i18n.t('statusGenerating', { model: config.model }), 'info');

            // Call API
            const result = await ComicAPI.generateComic(
                apiKey,
                prompt,
                pageCount,
                config.baseUrl,
                config.model,
                comicStyle,
                language,
                rowsPerPage,
                googleApiKey
            );

            // Reset generated images when loading new JSON
            this.generatedPagesImages = {};

            // Hide cover generation button
            const coverBtn = document.getElementById('generate-cover-btn');
            if (coverBtn) {
                coverBtn.style.display = 'none';
            }

            // Update page manager
            this.pageManager.setPages(result.pages);

            // Show render current page button
            if (this.renderCurrentBtn) {
                this.renderCurrentBtn.style.display = 'inline-flex';
            }

            // Show navigation and generate all button if multiple pages
            if (result.page_count > 1) {
                this.pageNav.style.display = 'flex';
                this.generateAllBtn.style.display = 'inline-flex';
            } else {
                this.pageNav.style.display = 'none';
                this.generateAllBtn.style.display = 'none';
            }

            // Load first page
            this.loadCurrentPage();

            // Show success
            this.showStatus(window.i18n.t('statusSuccess', { count: result.page_count }), 'success');
            setTimeout(() => this.hideStatus(), 3000);

            // Auto-generate session title (non-blocking)
            this.generateSessionTitle(prompt, result, apiKey, googleApiKey, language);

        } catch (error) {
            console.error('AI generation failed:', error);
            this.showStatus(window.i18n.t('statusError', { error: error.message }), 'error');

            let errorMsg = window.i18n.t('errorGenerationFailed', { error: error.message });
            alert(errorMsg);
        } finally {
            this.isGenerating = false;
            this.updateGenerateButtonState();
            this.generateBtn.classList.remove('loading');
            if (typeof originalBtnContent !== 'undefined') {
                this.generateBtn.innerHTML = originalBtnContent;
            }

            // Save session state
            this.saveCurrentSessionState();
        }
    }

    /**
     * Auto-generate session title based on prompt and comic data
     * This runs in the background and won't block the UI
     * @param {string} prompt - User's prompt
     * @param {Object} comicData - Generated comic data
     * @param {string} apiKey - OpenAI API key
     * @param {string} googleApiKey - Google API key
     * @param {string} language - Comic language
     */
    async generateSessionTitle(prompt, comicData, apiKey, googleApiKey, language) {
        try {
            // Check if current session already has a custom name (not default "session X")
            const currentSession = this.sessionManager.getCurrentSession();
            if (!currentSession) return;

            // Only auto-generate if the session has a default name like "session 1", "session 2", etc.
            const defaultNamePattern = /^session \d+$/i;
            if (!defaultNamePattern.test(currentSession.name)) {
                console.log('Session already has a custom name, skipping auto-generation');
                return;
            }

            const config = ConfigManager.getCurrentConfig();

            // Call API to generate title
            const result = await ComicAPI.generateSessionTitle(
                apiKey,
                googleApiKey,
                prompt,
                comicData,
                config.baseUrl,
                config.model,
                language
            );

            if (result.success && result.title) {
                // Update session name
                this.sessionManager.updateCurrentSession({ name: result.title });

                // Update UI
                this.updateSessionSelector();

                console.log(`Session title auto-generated: ${result.title}`);
            }
        } catch (error) {
            // Title generation failure should not affect the main workflow
            console.error('Session title auto-generation failed:', error);
            // Silently fail - user can still use the session with default name
        }
    }

    /**
     * Render comic from JSON input
     */
    renderComic() {
        const input = this.jsonInput.value;

        // Skip rendering if input is empty
        if (!input || input.trim() === '') {
            return;
        }

        try {
            const data = JSON.parse(input);
            this.errorMsg.style.display = 'none';

            if (this.renderer.render(data)) {
                // Don't reset generated images when rendering existing pages
                // Only reset when loading completely new content from user input
                // This is handled in generateWithAI() instead

                // Hide cover generation button only if we don't have any generated images
                const coverBtn = document.getElementById('generate-cover-btn');
                if (coverBtn && Object.keys(this.generatedPagesImages).length === 0) {
                    coverBtn.style.display = 'none';
                }

                // Success - show comic page and hint, hide empty state
                const comicPage = document.getElementById('comic-page');
                const editHint = document.querySelector('.edit-hint');
                const previewContainer = document.querySelector('.preview-container');
                const emptyState = document.getElementById('empty-state');

                if (emptyState) emptyState.style.display = 'none';
                if (comicPage) comicPage.style.display = 'flex';
                if (editHint) editHint.style.display = 'block';
                if (previewContainer) previewContainer.classList.add('has-content');

                // Show render current page button
                if (this.renderCurrentBtn) this.renderCurrentBtn.style.display = 'inline-flex';

                // Check if we need to show Generate All button (if we have multiple pages)
                if (this.pageManager.getPageCount() > 1) {
                    if (this.generateAllBtn) this.generateAllBtn.style.display = 'inline-flex';
                }
            } else {
                throw new Error('Render failed');
            }
        } catch (e) {
            console.error(e);
            this.errorMsg.style.display = 'block';
            this.errorMsg.innerText = 'JSON 格式错误: ' + e.message;
        }
    }

    /**
     * Handle comic data changes from direct editing
     * @param {Object} data - Updated comic data
     */
    onComicDataChange(data) {
        // Update JSON input (even though it's hidden)
        this.jsonInput.value = JSON.stringify(data, null, 2);

        // Update page manager if we're in multi-page mode
        if (this.pageManager.getPageCount() > 0) {
            this.pageManager.updateCurrentPage(data);
        }
    }

    /**
     * Load current page
     */
    loadCurrentPage() {
        const pageData = this.pageManager.getCurrentPage();
        if (!pageData) return;

        // Update JSON editor
        this.jsonInput.value = JSON.stringify(pageData, null, 2);

        // Update page indicator
        const current = this.pageManager.getCurrentPageIndex() + 1;
        const total = this.pageManager.getPageCount();
        this.pageIndicator.innerText = ' (' + window.i18n.t('pageIndicator', { current, total }) + ')';

        // Update button states
        this.prevBtn.disabled = !this.pageManager.hasPrevPage();
        this.nextBtn.disabled = !this.pageManager.hasNextPage();

        // Check if we have a generated image for this page
        const pageIndex = this.pageManager.getCurrentPageIndex();
        // Convert to string to match JSON keys from storage
        const hasImage = this.generatedPagesImages && (this.generatedPagesImages[pageIndex] || this.generatedPagesImages[String(pageIndex)]);

        console.log('loadCurrentPage check:', {
            pageIndex: pageIndex,
            hasImage: !!hasImage,
            keys: this.generatedPagesImages ? Object.keys(this.generatedPagesImages) : []
        });

        if (hasImage) {
            const imageData = this.generatedPagesImages[pageIndex] || this.generatedPagesImages[String(pageIndex)];
            // Show toggle button
            if (this.toggleViewBtn) {
                this.toggleViewBtn.style.display = 'inline-flex';
                this.toggleViewBtn.classList.add('viewing');
            }

            // Default to viewing image if it exists
            this.isViewingImage = true;
            this.displayImageDirectly(pageIndex);
        } else {
            // Hide toggle button
            if (this.toggleViewBtn) {
                this.toggleViewBtn.style.display = 'none';
                this.toggleViewBtn.classList.remove('viewing');
            }

            this.isViewingImage = false;
            // Render sketch
            this.renderComic();
        }
    }

    /**
     * Go to previous page
     */
    prevPage() {
        if (this.pageManager.prevPage()) {
            this.loadCurrentPage();
            this.saveCurrentSessionState();
        }
    }

    /**
     * Go to next page
     */
    nextPage() {
        if (this.pageManager.nextPage()) {
            this.loadCurrentPage();
            this.saveCurrentSessionState();
        }
    }

    /**
     * Download current page
     */
    async downloadCurrentPage() {
        const btn = this.downloadBtn;
        const originalText = btn.innerText;

        try {
            btn.disabled = true;
            btn.innerText = '生成中...';

            // If we have a generated image, download it directly
            const currentPageIndex = this.pageManager.getCurrentPageIndex();
            if (this.generatedPagesImages && this.generatedPagesImages[currentPageIndex]) {
                const pageData = this.generatedPagesImages[currentPageIndex];

                // Handle new version format
                if (pageData.versions && pageData.versions.length > 0) {
                    const currentVersionIndex = pageData.currentVersion || 0;
                    const currentVersionData = pageData.versions[currentVersionIndex];
                    if (currentVersionData && currentVersionData.imageUrl) {
                        await this.downloadImageFromUrl(currentVersionData.imageUrl);
                        return;
                    }
                }

                // Handle legacy format
                if (pageData.imageUrl) {
                    await this.downloadImageFromUrl(pageData.imageUrl);
                    return;
                }
            }

            // Otherwise download the sketch canvas
            const element = this.renderer.getContainer();
            const success = await ComicExporter.downloadPage(element);

            if (!success) {
                alert('图片生成失败，请重试');
            }
        } catch (error) {
            console.error('Download failed:', error);
            alert('下载失败: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }



    /**
     * Generate final comic image from current page
     */
    async generateFinalImage() {
        const pageData = this.pageManager.getCurrentPage();

        if (!pageData) {
            alert(window.i18n.t('alertNoPageData'));
            return;
        }

        // Check Google API key
        const googleApiKey = this.googleApiKeyInput.value.trim();
        if (!googleApiKey) {
            alert(window.i18n.t('alertNoGoogleApiKey') || 'Please configure Google API Key in settings');
            return;
        }

        // Get the button element
        const generateImageBtn = document.querySelector('button[onclick="generateFinalImage()"]');

        try {
            // Add loading state - only disable and add spinner, no text change
            if (generateImageBtn) {
                generateImageBtn.disabled = true;
                generateImageBtn.classList.add('loading');
            }

            this.showStatus(window.i18n.t('statusPreparing'), 'info');

            // Get current sketch as base64 (layout only, without text)
            const element = this.renderer.getContainer();
            const sketchBase64 = await ComicExporter.getBase64WithoutText(element);

            // Get current comic style, rows per page, and language
            const comicStyle = this.comicStyleSelect.value;
            const rowsPerPage = parseInt(this.rowsPerPageSelect.value) || 4;
            const language = this.comicLanguageSelect.value;

            this.showStatus(window.i18n.t('statusGeneratingImage'), 'info');

            // Get previously generated pages for current page index as reference
            const currentPageIndex = this.pageManager.getCurrentPageIndex();
            let previousPages = null;
            if (currentPageIndex > 0 && Object.keys(this.generatedPagesImages).length > 0) {
                // Get generated images from previous pages (up to 6)
                const prevImages = [];
                for (let i = currentPageIndex - 1; i >= 0 && prevImages.length < 6; i--) {
                    if (this.generatedPagesImages[i]) {
                        const page = this.generatedPagesImages[i];

                        // Handle new version format
                        if (page.versions && page.versions.length > 0) {
                            const currentVersionIndex = page.currentVersion || 0;
                            const currentVersionData = page.versions[currentVersionIndex];
                            if (currentVersionData && currentVersionData.imageUrl) {
                                prevImages.unshift({
                                    pageIndex: page.pageIndex,
                                    imageUrl: currentVersionData.imageUrl,
                                    pageTitle: page.pageTitle
                                });
                            }
                        }
                        // Handle legacy format
                        else if (page.imageUrl) {
                            prevImages.unshift(page);
                        }
                    }
                }
                if (prevImages.length > 0) {
                    previousPages = prevImages;
                }
            }

            // Add user uploaded reference image if available
            if (this.referenceImage) {
                if (!previousPages) previousPages = [];
                previousPages.unshift(this.referenceImage);
            }

            // Call API to generate image with sketch as reference
            const result = await ComicAPI.generateComicImage(
                pageData,
                googleApiKey,
                sketchBase64,
                previousPages,
                comicStyle,
                rowsPerPage,
                language
            );

            if (result.success && result.image_url) {
                // Store the generated image for this page with version history
                const timestamp = Date.now();
                const pageTitle = pageData.title || `Page ${currentPageIndex + 1}`;

                // Check if we already have versions for this page
                if (!this.generatedPagesImages[currentPageIndex]) {
                    // First generation - create new entry
                    this.generatedPagesImages[currentPageIndex] = {
                        pageIndex: currentPageIndex,
                        pageTitle: pageTitle,
                        currentVersion: 0,
                        versions: [{
                            imageUrl: result.image_url,
                            timestamp: timestamp,
                            version: 1
                        }]
                    };
                } else {
                    // Subsequent generation - append new version
                    const pageData = this.generatedPagesImages[currentPageIndex];

                    // Handle legacy format (single image object) - convert to version array
                    if (pageData.imageUrl && !pageData.versions) {
                        pageData.versions = [{
                            imageUrl: pageData.imageUrl,
                            timestamp: pageData.timestamp || Date.now() - 1000,
                            version: 1
                        }];
                        delete pageData.imageUrl;
                        delete pageData.timestamp;
                    }

                    // Add new version
                    const newVersion = pageData.versions.length + 1;
                    pageData.versions.push({
                        imageUrl: result.image_url,
                        timestamp: timestamp,
                        version: newVersion
                    });

                    // Set current version to the latest
                    pageData.currentVersion = pageData.versions.length - 1;
                    pageData.pageTitle = pageTitle;
                }

                // Show the generated image on canvas with flip animation
                await this.showGeneratedImageOnCanvas(currentPageIndex);
                this.showStatus(window.i18n.t('statusImageSuccess'), 'success');
                setTimeout(() => this.hideStatus(), 3000);

                // Enable cover generation button if we have at least one image
                const coverBtn = document.getElementById('generate-cover-btn');
                if (coverBtn) {
                    coverBtn.style.display = 'inline-flex';
                    coverBtn.disabled = false;
                }

                // Save session state immediately
                this.saveCurrentSessionState();
            } else {
                throw new Error('Image generation failed');
            }

        } catch (error) {
            console.error('Image generation failed:', error);
            this.showStatus(window.i18n.t('statusError', { error: error.message }), 'error');

            let errorMsg = window.i18n.t('errorImageFailed', { error: error.message });
            alert(errorMsg);
        } finally {
            // Restore button state - only remove disabled and loading class
            if (generateImageBtn) {
                generateImageBtn.disabled = false;
                generateImageBtn.classList.remove('loading');
            }

            // After generation, we are viewing the image
            this.isViewingImage = true;
            // Show toggle button with active state
            if (this.toggleViewBtn) {
                this.toggleViewBtn.style.display = 'inline-flex';
                this.toggleViewBtn.classList.add('viewing');
            }
        }
    }

    /**
     * Toggle between comic image and layout view
     */
    async toggleView() {
        if (this.isGenerating) return;

        const pageIndex = this.pageManager.getCurrentPageIndex();
        const pageData = this.generatedPagesImages[pageIndex];

        // Check if we have image data (either legacy format or new version format)
        if (!pageData) return;
        const hasImage = pageData.imageUrl || (pageData.versions && pageData.versions.length > 0);
        if (!hasImage) return;

        // Toggle state
        this.isViewingImage = !this.isViewingImage;

        // Update button visual state
        if (this.toggleViewBtn) {
            if (this.isViewingImage) {
                this.toggleViewBtn.classList.add('viewing');
            } else {
                this.toggleViewBtn.classList.remove('viewing');
            }
        }

        // Perform flip animation
        const comicPage = document.getElementById('comic-page');
        if (!comicPage) return;

        // 1. Flip out
        comicPage.classList.add('flip-out');

        // 2. Wait for half animation
        await this._delay(600);

        // 3. Swap content
        if (this.isViewingImage) {
            this.displayImageDirectly(pageIndex);
        } else {
            this.renderComic();
        }

        // 4. Flip in (re-using the same animation classes for consistency)
        comicPage.classList.remove('flip-out');
        comicPage.classList.add('flip-in');

        // 5. Cleanup
        await this._delay(800);
        comicPage.classList.remove('flip-in');
    }

    /**
     * Generate all pages images with AI
     * Uses previous generated pages as reference for consistency
     */
    async generateAllPagesImages() {
        const totalPages = this.pageManager.getPageCount();

        if (totalPages === 0) {
            alert(window.i18n.t('alertNoPages'));
            return;
        }

        // Check Google API key
        const googleApiKey = this.googleApiKeyInput.value.trim();
        if (!googleApiKey) {
            alert(window.i18n.t('alertNoGoogleApiKey') || 'Please configure Google API Key in settings');
            return;
        }

        // Confirm with user
        if (!confirm(window.i18n.t('alertGenerateAll', { total: totalPages }))) {
            return;
        }

        // Clear and reset generated images storage for batch generation
        this.generatedPagesImages = {};
        const comicStyle = this.comicStyleSelect.value;
        const rowsPerPage = parseInt(this.rowsPerPageSelect.value) || 4;
        const originalPageIndex = this.pageManager.getCurrentPageIndex();

        try {
            // Disable buttons during generation - only disable and add spinner, no text change
            this.generateAllBtn.disabled = true;
            this.generateAllBtn.classList.add('loading');

            for (let i = 0; i < totalPages; i++) {
                // Update status with spinner
                this.showStatus(window.i18n.t('statusGeneratingPage', { current: i + 1, total: totalPages }), 'info');

                // Navigate to the page
                this.pageManager.setCurrentPageIndex(i);
                this.loadCurrentPage();

                // Wait for rendering
                await this._delay(300);

                // Get current page data
                const pageData = this.pageManager.getCurrentPage();

                // Get current sketch as base64 (layout only)
                const element = this.renderer.getContainer();
                const sketchBase64 = await ComicExporter.getBase64WithoutText(element);

                // Prepare reference images (use previous 6 generated pages from member variable)
                let previousPages = null;
                const prevImages = Object.values(this.generatedPagesImages)
                    .filter(img => img.pageIndex < i)
                    .sort((a, b) => b.pageIndex - a.pageIndex)
                    .slice(0, 6)
                    .reverse()
                    .map(page => {
                        // Handle new version format
                        if (page.versions && page.versions.length > 0) {
                            const currentVersionIndex = page.currentVersion || 0;
                            const currentVersionData = page.versions[currentVersionIndex];
                            if (currentVersionData && currentVersionData.imageUrl) {
                                return {
                                    pageIndex: page.pageIndex,
                                    imageUrl: currentVersionData.imageUrl,
                                    pageTitle: page.pageTitle
                                };
                            }
                        }
                        // Handle legacy format - return as is
                        if (page.imageUrl) {
                            return page;
                        }
                        return null;
                    })
                    .filter(page => page !== null);
                if (prevImages.length > 0) {
                    previousPages = prevImages;
                }

                // Add user uploaded reference image if available
                if (this.referenceImage) {
                    if (!previousPages) previousPages = [];
                    previousPages.unshift(this.referenceImage);
                }

                // Generate image with sketch and previous pages as reference
                // Pass sketch as reference_img and previous pages as extra_body
                const result = await ComicAPI.generateComicImage(
                    pageData,
                    googleApiKey,
                    sketchBase64,
                    previousPages,  // Pass previous pages as extra_body parameter
                    comicStyle,
                    rowsPerPage,
                    this.comicLanguageSelect.value
                );

                if (result.success && result.image_url) {
                    // Store the generated image with version history (same logic as generateFinalImage)
                    const timestamp = Date.now();
                    const pageTitle = pageData.title || `Page ${i + 1}`;

                    // Check if we already have versions for this page
                    if (!this.generatedPagesImages[i]) {
                        // First generation - create new entry
                        this.generatedPagesImages[i] = {
                            pageIndex: i,
                            pageTitle: pageTitle,
                            currentVersion: 0,
                            versions: [{
                                imageUrl: result.image_url,
                                timestamp: timestamp,
                                version: 1
                            }]
                        };
                    } else {
                        // Subsequent generation - append new version
                        const existingPageData = this.generatedPagesImages[i];

                        // Handle legacy format (single image object) - convert to version array
                        if (existingPageData.imageUrl && !existingPageData.versions) {
                            existingPageData.versions = [{
                                imageUrl: existingPageData.imageUrl,
                                timestamp: existingPageData.timestamp || Date.now() - 1000,
                                version: 1
                            }];
                            delete existingPageData.imageUrl;
                            delete existingPageData.timestamp;
                        }

                        // Add new version
                        const newVersion = existingPageData.versions.length + 1;
                        existingPageData.versions.push({
                            imageUrl: result.image_url,
                            timestamp: timestamp,
                            version: newVersion
                        });

                        // Set current version to the latest
                        existingPageData.currentVersion = existingPageData.versions.length - 1;
                        existingPageData.pageTitle = pageTitle;
                    }

                    // Show the generated image on canvas with flip animation
                    await this.showGeneratedImageOnCanvas(i);

                    // Save session state after each page generation
                    this.saveCurrentSessionState();
                } else {
                    throw new Error(`第 ${i + 1} 页生成失败`);
                }

                // Small delay between generations
                await this._delay(500);
            }

            // Restore original page
            this.pageManager.setCurrentPageIndex(originalPageIndex);

            console.log('[Batch Generation] Complete! Generated images:', this.generatedPagesImages);
            console.log('[Batch Generation] Total images generated:', Object.keys(this.generatedPagesImages).length);

            this.loadCurrentPage();

            // Show success
            this.showStatus(window.i18n.t('statusAllSuccess', { total: totalPages }), 'success');
            // No longer showing gallery popup as images are displayed on canvas
            // const allImages = Object.values(this.generatedPagesImages).sort((a, b) => a.pageIndex - b.pageIndex);
            // this.displayAllGeneratedImages(allImages);

            // Enable cover generation button
            const coverBtn = document.getElementById('generate-cover-btn');
            if (coverBtn) {
                coverBtn.style.display = 'inline-flex'; // Ensure it's visible
                coverBtn.disabled = false;
            }

        } catch (error) {
            console.error('Batch generation failed:', error);
            this.showStatus(window.i18n.t('statusError', { error: error.message }), 'error');

            // Restore original page
            this.pageManager.setCurrentPageIndex(originalPageIndex);
            this.loadCurrentPage();

            // If some images were generated, still show them
            const partialImages = Object.values(this.generatedPagesImages).sort((a, b) => a.pageIndex - b.pageIndex);
            if (partialImages.length > 0) {
                alert(window.i18n.t('alertBatchError', { success: partialImages.length, total: totalPages, error: error.message }));
                this.displayAllGeneratedImages(partialImages);
            } else {
                alert(window.i18n.t('alertBatchFailed', { error: error.message }));
            }
        } finally {
            // Restore button state - only remove disabled and loading class
            this.generateAllBtn.disabled = false;
            this.generateAllBtn.classList.remove('loading');

            // Explicitly show flip button if images were generated
            if (Object.keys(this.generatedPagesImages).length > 0) {
                if (this.toggleViewBtn) this.toggleViewBtn.style.display = 'inline-flex';
            }
        }
    }



    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Show generated image on the comic canvas directly with a flip animation
     * @param {number} pageIndex - Index of the page to display
     */
    async showGeneratedImageOnCanvas(pageIndex) {
        const comicPage = document.getElementById('comic-page');
        if (!comicPage) return;

        const pageData = this.generatedPagesImages[pageIndex];
        if (!pageData) return;

        // Handle legacy format
        if (pageData.imageUrl && !pageData.versions) {
            pageData.versions = [{
                imageUrl: pageData.imageUrl,
                timestamp: pageData.timestamp || Date.now(),
                version: 1
            }];
            pageData.currentVersion = 0;
            delete pageData.imageUrl;
            delete pageData.timestamp;
        }

        const currentVersionIndex = pageData.currentVersion || 0;
        const currentVersionData = pageData.versions[currentVersionIndex];
        if (!currentVersionData) return;

        const imageUrl = currentVersionData.imageUrl;
        const versionNumber = currentVersionData.version;

        // 1. Flip out
        comicPage.classList.add('flip-out');

        // 2. Wait for half animation (rotate to 90deg)
        await this._delay(600);

        // 3. Swap content
        comicPage.innerHTML = '';

        // Create container for image and button
        const container = document.createElement('div');
        container.className = 'generated-image-container';

        // Create image
        const img = document.createElement('img');
        img.src = imageUrl;
        img.className = 'generated-comic-image';
        img.title = window.i18n ? window.i18n.t('doubleClickToEdit') || 'Double-click to edit script' : 'Double-click to edit script';
        img.style.cursor = 'pointer';

        // Add double-click handler to switch back to script view
        img.addEventListener('dblclick', () => {
            if (this.isViewingImage && !this.isGenerating) {
                this.toggleView();
            }
        });

        // Create download button
        const downloadBtn = document.createElement('div');
        downloadBtn.className = 'overlay-download-btn';
        downloadBtn.title = window.i18n.t('btnDownloadImage');
        downloadBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            this.downloadImageFromUrl(imageUrl);
        };

        container.appendChild(img);
        container.appendChild(downloadBtn);
        comicPage.appendChild(container);

        // Ensure scroll to top
        comicPage.scrollTop = 0;

        // 4. Flip in
        comicPage.classList.remove('flip-out');
        comicPage.classList.add('flip-in');

        // 5. Cleanup classes after animation
        await this._delay(800);
        comicPage.classList.remove('flip-in');
    }

    /**
     * Display generated image directly on canvas without animation (for navigation)
     * @param {number} pageIndex - Index of the page to display
     */
    displayImageDirectly(pageIndex) {
        const comicPage = document.getElementById('comic-page');
        if (!comicPage) return;

        const pageData = this.generatedPagesImages[pageIndex];
        if (!pageData) return;

        // Handle legacy format
        if (pageData.imageUrl && !pageData.versions) {
            pageData.versions = [{
                imageUrl: pageData.imageUrl,
                timestamp: pageData.timestamp || Date.now(),
                version: 1
            }];
            pageData.currentVersion = 0;
            delete pageData.imageUrl;
            delete pageData.timestamp;
        }

        const currentVersionIndex = pageData.currentVersion || 0;
        const currentVersionData = pageData.versions[currentVersionIndex];
        if (!currentVersionData) return;

        const imageUrl = currentVersionData.imageUrl;
        const versionNumber = currentVersionData.version;

        comicPage.innerHTML = '';

        // Create container for image and button
        const container = document.createElement('div');
        container.className = 'generated-image-container';

        // Create image
        const img = document.createElement('img');
        img.src = imageUrl;
        img.className = 'generated-comic-image';
        img.title = window.i18n ? window.i18n.t('doubleClickToEdit') || 'Double-click to edit script' : 'Double-click to edit script';
        img.style.cursor = 'pointer';

        // Add double-click handler to switch back to script view
        img.addEventListener('dblclick', () => {
            if (this.isViewingImage && !this.isGenerating) {
                this.toggleView();
            }
        });

        // Create download button
        const downloadBtn = document.createElement('div');
        downloadBtn.className = 'overlay-download-btn';
        downloadBtn.title = window.i18n.t('btnDownloadImage');
        downloadBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            this.downloadImageFromUrl(imageUrl);
        };

        container.appendChild(img);
        container.appendChild(downloadBtn);
        comicPage.appendChild(container);

        // Ensure scroll to top
        comicPage.scrollTop = 0;
    }



    /**
     * Download image from URL
     * @param {string} imageUrl - URL of the image to download
     */
    async downloadImageFromUrl(imageUrl) {
        try {
            try {
                const response = await fetch(imageUrl, { mode: 'cors' });
                if (response.ok) {
                    const blob = await response.blob();
                    const blobUrl = window.URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = `comic-final-${Date.now()}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(blobUrl);
                    return;
                }
            } catch (directError) {
                console.warn('Direct download failed:', directError);
            }

            // Last resort: open in new tab (user can right-click save)
            window.open(imageUrl, '_blank');
            alert(window.i18n.t('alertDownloadAlt'));

        } catch (error) {
            console.error('Download failed:', error);
            alert(window.i18n.t('alertDownloadFailed'));
        }
    }

    /**
     * Show status message
     * @param {string} message - Status message
     * @param {string} type - Message type (info, success, error)
     */
    showStatus(message, type = 'info') {
        this.aiStatus.style.display = 'block';
        this.aiStatus.innerText = message;

        switch (type) {
            case 'success':
                this.aiStatus.style.color = '#28a745';
                break;
            case 'error':
                this.aiStatus.style.color = '#dc3545';
                break;
            default:
                this.aiStatus.style.color = '#666';
        }
    }

    /**
     * Hide status message
     */
    hideStatus() {
        this.aiStatus.style.display = 'none';
    }

    /**
     * Generate social media post content (Xiaohongshu for Chinese, Twitter for English)
     */
    async generateXiaohongshuContent() {
        const apiKey = this.apiKeyInput.value.trim();
        const googleApiKey = this.googleApiKeyInput.value.trim();

        if (!apiKey && !googleApiKey) {
            alert(window.i18n.t('alertNoApiKey') || 'Please enter OpenAI API Key or Google API Key');
            return;
        }

        const comicData = this.pageManager.getAllPages();

        if (!comicData || comicData.length === 0) {
            alert(window.i18n.t('alertNoComicData'));
            return;
        }

        // Determine platform based on UI language
        const currentLang = window.i18n ? window.i18n.getLanguage() : 'en';
        const platform = currentLang === 'zh' ? 'xiaohongshu' : 'twitter';

        // Get the button element
        const xiaohongshuBtn = document.getElementById('xiaohongshu-btn');

        try {
            // Add loading state - only disable and add spinner, no text change
            if (xiaohongshuBtn) {
                xiaohongshuBtn.disabled = true;
                xiaohongshuBtn.classList.add('loading');
            }

            this.showStatus(window.i18n.t('statusSocialMedia'), 'info');

            const config = ConfigManager.getCurrentConfig();

            const result = await ComicAPI.generateSocialMediaContent(
                apiKey,
                comicData,
                config.baseUrl,
                config.model,
                platform,
                googleApiKey
            );

            if (result.success) {
                this.displaySocialMediaContent(result.title, result.content, result.tags, platform);
                this.showStatus(window.i18n.t('statusSocialMediaSuccess'), 'success');
                setTimeout(() => this.hideStatus(), 3000);
            } else {
                throw new Error('Content generation failed');
            }

        } catch (error) {
            console.error('Social media content generation failed:', error);
            this.showStatus(window.i18n.t('statusError', { error: error.message }), 'error');
            alert(window.i18n.t('statusError', { error: error.message }));
        } finally {
            // Restore button state - only remove disabled and loading class
            if (xiaohongshuBtn) {
                xiaohongshuBtn.disabled = false;
                xiaohongshuBtn.classList.remove('loading');
            }
        }
    }

    /**
     * Display social media content in a modal
     * @param {string} title - Post title
     * @param {string} content - Post content
     * @param {Array} tags - Post tags
     * @param {string} platform - Platform type ('xiaohongshu' or 'twitter')
     */
    displaySocialMediaContent(title, content, tags, platform = 'xiaohongshu') {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            padding: 20px;
        `;

        // Create content container
        const container = document.createElement('div');
        container.style.cssText = `
            max-width: 600px;
            width: 100%;
            max-height: 80vh;
            background: white;
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            overflow-y: auto;
        `;

        // Create header with platform-specific title
        const header = document.createElement('div');
        header.style.cssText = `
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
            color: #1d1d1f;
            text-align: center;
        `;
        const modalTitleKey = platform === 'twitter' ? 'modalTwitterTitle' : 'modalXiaohongshuTitle';
        header.innerText = window.i18n.t(modalTitleKey);

        // Create title section
        const titleSection = document.createElement('div');
        titleSection.style.cssText = `
            margin-bottom: 20px;
        `;

        const titleLabel = document.createElement('div');
        titleLabel.style.cssText = `
            font-weight: 600;
            margin-bottom: 8px;
            color: #666;
            font-size: 14px;
        `;
        titleLabel.innerText = window.i18n.t('modalTitleLabel');

        const titleText = document.createElement('div');
        titleText.style.cssText = `
            padding: 12px;
            background: #f5f5f7;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            color: #1d1d1f;
            line-height: 1.5;
        `;
        titleText.innerText = title;

        titleSection.appendChild(titleLabel);
        titleSection.appendChild(titleText);

        // Create content section
        const contentSection = document.createElement('div');
        contentSection.style.cssText = `
            margin-bottom: 20px;
        `;

        const contentLabel = document.createElement('div');
        contentLabel.style.cssText = `
            font-weight: 600;
            margin-bottom: 8px;
            color: #666;
            font-size: 14px;
        `;
        contentLabel.innerText = window.i18n.t('modalContentLabel');

        const contentText = document.createElement('div');
        contentText.style.cssText = `
            padding: 12px;
            background: #f5f5f7;
            border-radius: 8px;
            font-size: 14px;
            color: #1d1d1f;
            line-height: 1.8;
            white-space: pre-wrap;
        `;
        contentText.innerText = content;

        contentSection.appendChild(contentLabel);
        contentSection.appendChild(contentText);

        // Create tags section
        const tagsSection = document.createElement('div');
        tagsSection.style.cssText = `
            margin-bottom: 20px;
        `;

        const tagsLabel = document.createElement('div');
        tagsLabel.style.cssText = `
            font-weight: 600;
            margin-bottom: 8px;
            color: #666;
            font-size: 14px;
        `;
        tagsLabel.innerText = window.i18n.t('modalTagsLabel');

        const tagsContainer = document.createElement('div');
        tagsContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        `;

        tags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.style.cssText = `
                padding: 6px 12px;
                background: #007aff;
                color: white;
                border-radius: 16px;
                font-size: 13px;
            `;
            tagElement.innerText = '#' + tag;
            tagsContainer.appendChild(tagElement);
        });

        tagsSection.appendChild(tagsLabel);
        tagsSection.appendChild(tagsContainer);

        // Create action buttons
        const actions = document.createElement('div');
        actions.style.cssText = `
            display: flex;
            gap: 10px;
            margin-top: 20px;
        `;

        const copyBtn = document.createElement('button');
        copyBtn.innerText = window.i18n.t('btnCopyAll');
        copyBtn.style.cssText = `
            flex: 1;
            padding: 12px;
            background-color: #34c759;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
        `;
        copyBtn.onclick = () => {
            const fullText = `${title}\n\n${content}\n\n${tags.map(t => '#' + t).join(' ')}`;
            navigator.clipboard.writeText(fullText).then(() => {
                copyBtn.innerText = window.i18n.t('btnCopied');
                setTimeout(() => {
                    copyBtn.innerText = window.i18n.t('btnCopyAll');
                }, 2000);
            }).catch(err => {
                alert(window.i18n.t('alertCopyFailed'));
            });
        };

        const closeBtn = document.createElement('button');
        closeBtn.innerText = window.i18n.t('btnClose');
        closeBtn.style.cssText = `
            flex: 1;
            padding: 12px;
            background-color: #6c757d;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 600;
        `;
        closeBtn.onclick = () => {
            document.body.removeChild(modal);
        };

        actions.appendChild(copyBtn);
        actions.appendChild(closeBtn);

        // Assemble modal
        container.appendChild(header);
        container.appendChild(titleSection);
        container.appendChild(contentSection);
        container.appendChild(tagsSection);
        container.appendChild(actions);
        modal.appendChild(container);

        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };

        // Add to page
        document.body.appendChild(modal);
    }

    /**
     * Show cover customization panel
     */
    showCoverCustomPanel() {
        const panel = document.getElementById('cover-custom-panel');
        if (panel) {
            panel.style.display = 'block';
            // Focus on the input
            const input = document.getElementById('cover-custom-input');
            if (input) {
                setTimeout(() => input.focus(), 100);
            }
            // Add click outside to close
            setTimeout(() => {
                document.addEventListener('click', this.handleClickOutsideCoverPanel);
            }, 100);
        }
    }

    /**
     * Hide cover customization panel
     */
    hideCoverCustomPanel() {
        const panel = document.getElementById('cover-custom-panel');
        if (panel) {
            panel.style.display = 'none';
            document.removeEventListener('click', this.handleClickOutsideCoverPanel);
        }
    }

    /**
     * Handle click outside cover panel to close it
     */
    handleClickOutsideCoverPanel = (event) => {
        const panel = document.getElementById('cover-custom-panel');
        const btn = document.getElementById('generate-cover-btn');
        if (panel && !panel.contains(event.target) && !btn.contains(event.target)) {
            this.hideCoverCustomPanel();
        }
    }

    /**
     * Generate comic cover with custom requirements
     */
    async generateCoverWithCustom() {
        const googleApiKey = this.googleApiKeyInput.value.trim();
        if (!googleApiKey) {
            alert(window.i18n.t('alertNoGoogleApiKey') || 'Please configure Google API Key in settings');
            return;
        }

        // Get custom requirements from textarea
        const customInput = document.getElementById('cover-custom-input');
        const customRequirements = customInput ? customInput.value.trim() : '';

        // Hide the panel
        this.hideCoverCustomPanel();

        const coverBtn = document.getElementById('generate-cover-btn');
        const originalText = coverBtn.innerHTML;

        try {
            if (coverBtn) {
                coverBtn.disabled = true;
                coverBtn.classList.add('loading');
            }

            this.showStatus(window.i18n.t('statusGeneratingCover') || 'Generating cover...', 'info');

            const comicStyle = this.comicStyleSelect.value;
            const language = this.comicLanguageSelect.value;

            // Collect all generated page images as references
            const referenceImages = [];
            if (this.generatedPagesImages) {
                console.log('[Cover] generatedPagesImages:', this.generatedPagesImages);
                console.log('[Cover] generatedPagesImages keys:', Object.keys(this.generatedPagesImages));

                // Get all page objects and sort by index
                const sortedPages = Object.values(this.generatedPagesImages)
                    .sort((a, b) => a.pageIndex - b.pageIndex);

                console.log('[Cover] Sorted pages:', sortedPages);

                // Add full page objects to reference list
                sortedPages.forEach(page => {
                    if (page) {
                        // Handle new version format
                        if (page.versions && page.versions.length > 0) {
                            const currentVersionIndex = page.currentVersion || 0;
                            const currentVersionData = page.versions[currentVersionIndex];
                            if (currentVersionData && currentVersionData.imageUrl) {
                                // Create a page object with the current version's imageUrl
                                referenceImages.push({
                                    pageIndex: page.pageIndex,
                                    imageUrl: currentVersionData.imageUrl,
                                    pageTitle: page.pageTitle
                                });
                            }
                        }
                        // Handle legacy format
                        else if (page.imageUrl) {
                            referenceImages.push(page);
                        }
                    }
                });
            }

            // Add user uploaded reference image if available
            if (this.referenceImage) {
                referenceImages.unshift(this.referenceImage);
            }

            console.log('[Cover] Reference images to send:', referenceImages);
            console.log('[Cover] Custom requirements:', customRequirements);

            // Call API
            const result = await ComicAPI.generateCover(
                googleApiKey,
                comicStyle,
                referenceImages,
                language,
                customRequirements
            );

            if (result.success && result.image_url) {
                this.showStatus(window.i18n.t('statusCoverSuccess') || 'Cover generated successfully!', 'success');
                setTimeout(() => this.hideStatus(), 3000);

                // Display result
                this.displayGeneratedImage(result.image_url);
            } else {
                throw new Error(result.error || 'Generaton failed');
            }

        } catch (error) {
            console.error('Cover generation failed:', error);
            this.showStatus(window.i18n.t('statusError', { error: error.message }), 'error');
            alert(window.i18n.t('errorCoverFailed') || `Cover generation failed: ${error.message}`);
        } finally {
            if (coverBtn) {
                coverBtn.disabled = false;
                coverBtn.classList.remove('loading');
            }
        }
    }

    /**
     * Save current session state
     */
    saveCurrentSessionState() {
        if (!this.sessionManager) return;

        const comicData = this.pageManager.getPageCount() > 0 ? {
            pages: this.pageManager.pages,
            pageCount: this.pageManager.getPageCount()
        } : null;

        this.sessionManager.updateCurrentSession({
            comicData: comicData,
            generatedImages: this.generatedPagesImages,
            currentPageIndex: this.pageManager.getCurrentPageIndex(),
            style: this.comicStyleSelect ? this.comicStyleSelect.value : 'doraemon',
            language: this.comicLanguageSelect ? this.comicLanguageSelect.value : 'en',
            pageCount: this.pageCountInput ? parseInt(this.pageCountInput.value) : 3,
            rowsPerPage: this.rowsPerPageSelect ? parseInt(this.rowsPerPageSelect.value) : 4,
            prompt: this.promptInput ? this.promptInput.value : '',
            referenceImage: this.referenceImage
        });
    }

    /**
     * Load session state
     */
    loadSessionState() {
        if (!this.sessionManager) return;

        const session = this.sessionManager.getCurrentSession();
        if (!session) return;

        console.log('loadSessionState for session:', session.id, {
            hasComicData: !!session.comicData,
            hasImages: !!(session.generatedImages && Object.keys(session.generatedImages).length > 0),
            imagesCount: session.generatedImages ? Object.keys(session.generatedImages).length : 0
        });

        // Restore style and language
        if (this.comicStyleSelect) {
            this.comicStyleSelect.value = session.style || 'doraemon';
        }

        if (this.comicLanguageSelect) {
            this.comicLanguageSelect.value = session.language || 'en';
        }

        // Restore prompt and page count
        if (this.promptInput) {
            this.promptInput.value = session.prompt || '';
            this.updateGenerateButtonState(); // Update button state based on new prompt
        }

        if (this.pageCountInput) {
            this.pageCountInput.value = session.pageCount || 3;
        }

        if (this.rowsPerPageSelect) {
            this.rowsPerPageSelect.value = session.rowsPerPage || 4;
        }

        // Restore reference image
        if (session.referenceImage) {
            this.referenceImage = session.referenceImage;
            if (this.referenceImagePreview) {
                this.referenceImagePreview.src = this.referenceImage;
            }
            if (this.imagePreviewContainer) {
                this.imagePreviewContainer.style.display = 'flex';
            }
        } else {
            this.referenceImage = null;
            if (this.referenceImagePreview) {
                this.referenceImagePreview.src = '';
            }
            if (this.imagePreviewContainer) {
                this.imagePreviewContainer.style.display = 'none';
            }
        }

        // Restore comic data
        if (session.comicData && session.comicData.pages) {
            this.pageManager.setPages(session.comicData.pages);
            this.pageManager.setCurrentPageIndex(session.currentPageIndex || 0);

            // Update JSON input
            const currentPage = this.pageManager.getCurrentPage();
            if (currentPage) {
                this.jsonInput.value = JSON.stringify(currentPage, null, 2);
            }

            // Render the page
            this.renderComic();

            // Show navigation if multiple pages
            if (session.comicData.pageCount > 1) {
                this.pageNav.style.display = 'flex';
                this.generateAllBtn.style.display = 'inline-flex';
            }

            // Show render button
            if (this.renderCurrentBtn) {
                this.renderCurrentBtn.style.display = 'inline-flex';
            }
        }

        // Restore generated images
        if (session.generatedImages) {
            this.generatedPagesImages = session.generatedImages;

            // Show cover button if we have generated images
            if (Object.keys(this.generatedPagesImages).length > 0) {
                const coverBtn = document.getElementById('generate-cover-btn');
                if (coverBtn) {
                    coverBtn.style.display = 'inline-flex';
                }
            }
        }

        // Load current page (will show generated image if available)
        if (this.pageManager.getPageCount() > 0) {
            this.loadCurrentPage();
        }
    }

    /**
     * Switch to a different session
     * @param {string} sessionId - Session ID to switch to
     */
    switchToSession(sessionId) {
        if (!this.sessionManager) return;

        // Save current session state before switching
        this.saveCurrentSessionState();

        // Switch session
        const session = this.sessionManager.switchSession(sessionId);
        if (!session) return;

        // Clear and reset current state
        this.generatedPagesImages = {};
        this.pageManager.setPages([]);
        this.jsonInput.value = '';

        // Reset UI elements to clean state
        const comicPage = document.getElementById('comic-page');
        if (comicPage) {
            comicPage.style.display = 'none';
            comicPage.innerHTML = ''; // Clear actual content
        }

        const editHint = document.querySelector('.edit-hint');
        if (editHint) editHint.style.display = 'none';

        // Show empty state temporarily (will be hidden if session has content)
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'flex';

        const previewContainer = document.querySelector('.preview-container');
        if (previewContainer) previewContainer.classList.remove('has-content');

        if (this.pageNav) this.pageNav.style.display = 'none';
        if (this.generateAllBtn) this.generateAllBtn.style.display = 'none';
        if (this.renderCurrentBtn) this.renderCurrentBtn.style.display = 'none';

        const coverBtn = document.getElementById('generate-cover-btn');
        if (coverBtn) coverBtn.style.display = 'none';

        if (this.toggleViewBtn) this.toggleViewBtn.style.display = 'none';

        // Load new session state
        this.loadSessionState();

        // Update UI
        this.updateSessionSelector();
    }

    /**
     * Create a new session
     */
    createNewSession() {
        if (!this.sessionManager) return;

        // Save current session state
        this.saveCurrentSessionState();

        // Get current session's configuration to carry over
        const currentSession = this.sessionManager.getCurrentSession();
        const config = currentSession ? {
            style: currentSession.style,
            language: currentSession.language,
            pageCount: currentSession.pageCount,
            rowsPerPage: currentSession.rowsPerPage
        } : {};

        // Create new session with current configuration
        const sessionCount = this.sessionManager.getAllSessions().length + 1;
        const defaultName = 'session ' + sessionCount;
        const session = this.sessionManager.createSession(defaultName, config);

        // Switch to new session
        this.sessionManager.switchSession(session.id);

        // Clear current state
        this.generatedPagesImages = {};
        this.pageManager.setPages([]);
        this.jsonInput.value = '';

        // Hide UI elements and show empty state
        const comicPage = document.getElementById('comic-page');
        if (comicPage) comicPage.style.display = 'none';

        const editHint = document.querySelector('.edit-hint');
        if (editHint) editHint.style.display = 'none';

        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.style.display = 'flex';

        const previewContainer = document.querySelector('.preview-container');
        if (previewContainer) previewContainer.classList.remove('has-content');

        this.pageNav.style.display = 'none';
        if (this.generateAllBtn) this.generateAllBtn.style.display = 'none';
        if (this.renderCurrentBtn) this.renderCurrentBtn.style.display = 'none';

        const coverBtn = document.getElementById('generate-cover-btn');
        if (coverBtn) coverBtn.style.display = 'none';

        if (this.toggleViewBtn) this.toggleViewBtn.style.display = 'none';

        // Update UI
        this.updateSessionSelector();

        // Load default state for new session (language, style)
        this.loadSessionState();
    }

    /**
     * Update session selector dropdown
     */
    updateSessionSelector() {
        if (!this.sessionManager) return;

        const selector = document.getElementById('session-selector');
        if (!selector) return;

        const sessions = this.sessionManager.getAllSessions();
        const currentSessionId = this.sessionManager.getCurrentSession()?.id;

        selector.innerHTML = '';
        sessions.forEach(session => {
            const option = document.createElement('option');
            option.value = session.id;
            option.textContent = session.name;
            if (session.id === currentSessionId) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
    }

    /**
     * Toggle session management modal
     */
    toggleSessionManager() {
        const modal = document.getElementById('session-modal');
        if (!modal) return;

        if (modal.style.display === 'none' || !modal.style.display) {
            // Show modal and populate session list
            this.updateSessionList();
            modal.style.display = 'flex';
        } else {
            modal.style.display = 'none';
        }
    }

    /**
     * Update session list in modal
     */
    updateSessionList() {
        if (!this.sessionManager) return;

        const listContainer = document.getElementById('session-list');
        if (!listContainer) return;

        const sessions = this.sessionManager.getAllSessions();
        const currentSessionId = this.sessionManager.getCurrentSession()?.id;

        listContainer.innerHTML = '';

        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = 'session-item' + (session.id === currentSessionId ? ' active' : '');

            const info = document.createElement('div');
            info.className = 'session-info';

            const name = document.createElement('div');
            name.className = 'session-name';
            name.textContent = session.name;

            const meta = document.createElement('div');
            meta.className = 'session-meta';
            const date = new Date(session.updatedAt);
            meta.textContent = date.toLocaleString();

            info.appendChild(name);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'session-actions';

            // Rename button
            const renameBtn = document.createElement('button');
            renameBtn.className = 'session-action-btn';
            renameBtn.innerHTML = '✏️';
            renameBtn.title = window.i18n ? window.i18n.t('renameSession') : 'Rename';
            renameBtn.onclick = () => this.renameSession(session.id);

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'session-action-btn delete';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = window.i18n ? window.i18n.t('deleteSession') : 'Delete';
            deleteBtn.onclick = () => this.deleteSession(session.id);

            // Switch button (if not current)
            if (session.id !== currentSessionId) {
                const switchBtn = document.createElement('button');
                switchBtn.className = 'session-action-btn primary';
                switchBtn.textContent = window.i18n ? window.i18n.t('switchSession') : 'Switch';
                switchBtn.onclick = () => {
                    this.switchToSession(session.id);
                    this.toggleSessionManager();
                };
                actions.appendChild(switchBtn);
            }

            actions.appendChild(renameBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(info);
            item.appendChild(actions);
            listContainer.appendChild(item);
        });
    }

    /**
     * Rename a session
     * @param {string} sessionId - Session ID to rename
     */
    renameSession(sessionId) {
        if (!this.sessionManager) return;

        const session = this.sessionManager.getSession(sessionId);
        if (!session) return;

        const newName = prompt(
            window.i18n ? window.i18n.t('sessionName') : 'Session Name',
            session.name
        );

        if (newName && newName.trim()) {
            this.sessionManager.renameSession(sessionId, newName.trim());
            this.updateSessionList();
            this.updateSessionSelector();
        }
    }

    /**
     * Delete a session
     * @param {string} sessionId - Session ID to delete
     */
    deleteSession(sessionId) {
        if (!this.sessionManager) return;

        const confirmMsg = window.i18n ? window.i18n.t('confirmDeleteSession') : 'Are you sure you want to delete this session?';
        if (!confirm(confirmMsg)) return;

        const success = this.sessionManager.deleteSession(sessionId);
        if (success) {
            this.updateSessionList();
            this.updateSessionSelector();

            // If we deleted the current session, load the new current session
            this.loadSessionState();
        }
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new UIController();
});

// Export for global access
window.UIController = UIController;

// Global functions for onclick handlers (backward compatibility)
function toggleConfig() {
    if (app) app.toggleConfig();
}

function toggleAdvancedSettings() {
    if (app) app.toggleAdvancedSettings();
}

function saveConfig() {
    if (app) app.saveConfig();
}

function generateWithAI() {
    if (app) app.generateWithAI();
}

function renderComic() {
    if (app) app.renderComic();
}

function downloadComicImage() {
    if (app) app.downloadCurrentPage();
}

function removeReferenceImage() {
    if (app) app.removeReferenceImage();
}



function prevPage() {
    if (app) app.prevPage();
}

function nextPage() {
    if (app) app.nextPage();
}

function generateFinalImage() {
    if (app) app.generateFinalImage();
}

function generateAllPagesImages() {
    if (app) app.generateAllPagesImages();
}

function generateXiaohongshuContent() {
    if (app) app.generateXiaohongshuContent();
}

function generateCover() {
    if (app) app.showCoverCustomPanel();
}

function showCoverCustomPanel() {
    if (app) app.showCoverCustomPanel();
}

function hideCoverCustomPanel() {
    if (app) app.hideCoverCustomPanel();
}

function generateCoverWithCustom() {
    if (app) app.generateCoverWithCustom();
}

function toggleView() {
    if (app) app.toggleView();
}

function changeLanguage(lang) {
    if (window.i18n) {
        window.i18n.setLanguage(lang);
    }

    // Sync comic language with interface language
    const comicLanguageSelect = document.getElementById('comic-language');
    if (comicLanguageSelect) {
        comicLanguageSelect.value = lang;
    }
}

// Session management global functions
function switchToSession(sessionId) {
    if (app) app.switchToSession(sessionId);
}

function createNewSession() {
    if (app) app.createNewSession();
}

function toggleSessionManager() {
    if (app) app.toggleSessionManager();
}

/**
 * Toggle export dropdown menu
 */
function toggleExportMenu() {
    const dropdown = document.getElementById('export-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('open');
    }
}

// Close export menu when clicking outside
document.addEventListener('click', function (event) {
    const dropdown = document.getElementById('export-dropdown');
    if (dropdown && !dropdown.contains(event.target)) {
        dropdown.classList.remove('open');
    }
});
// Helper for simple display (re-adding simplified version for cover)
// Re-adding this method to UIController class as we removed it previously
UIController.prototype.displayGeneratedImage = function (imageUrl) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            cursor: pointer;
        `;

    // Create image container
    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;

    // Title
    const title = document.createElement('h3');
    title.innerText = window.i18n.t('modalCoverTitle');
    title.style.textAlign = 'center';
    title.style.margin = '0 0 10px 0';

    // Create image
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = `
            max-width: 100%;
            max-height: 70vh;
            display: block;
            border-radius: 4px;
        `;

    // Create download button
    const downloadBtn = document.createElement('button');
    downloadBtn.innerText = window.i18n.t('btnDownloadImage');
    downloadBtn.style.cssText = `
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            width: 100%;
        `;
    downloadBtn.onclick = (e) => {
        e.stopPropagation();
        this.downloadImageFromUrl(imageUrl);
    };

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.innerText = window.i18n.t('btnClose');
    closeBtn.style.cssText = `
            padding: 10px 20px;
            background-color: #6c757d;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            width: 100%;
        `;
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        document.body.removeChild(modal);
    };

    // Assemble modal
    imgContainer.appendChild(title);
    imgContainer.appendChild(img);
    imgContainer.appendChild(downloadBtn);
    imgContainer.appendChild(closeBtn);
    modal.appendChild(imgContainer);

    // Close on background click
    modal.onclick = () => {
        document.body.removeChild(modal);
    };

    // Prevent closing when clicking on image container
    imgContainer.onclick = (e) => {
        e.stopPropagation();
    };

    // Add to page
    document.body.appendChild(modal);
};

/**
 * Global function for optimize prompt button
 */
function optimizePrompt() {
    if (app) {
        app.optimizePrompt();
    }
}

