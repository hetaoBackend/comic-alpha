/**
 * Internationalization (i18n) Module
 * Supports Chinese and English language switching
 */

const i18n = {
    // Current language
    currentLang: 'en',

    // Translation dictionary
    translations: {
        zh: {
            // Page title
            pageTitle: 'comic-perfect',

            // Main header
            appName: 'ComicPerfect',
            configBtn: '⚙️ 配置',
            themeLabel: '主题',
            themeBtnLight: '浅色',
            themeBtnDark: '深色',
            languageLabelShort: '语言',

            // Configuration panel
            configTitle: '环境变量配置',
            apiKeyLabel: 'OpenAI API Key',
            apiKeyPlaceholder: '输入你的 OpenAI API Key',
            googleApiKeyLabel: 'Google API Key',
            googleApiKeyPlaceholder: '输入你的 Google API Key (用于图片生成)',
            baseUrlLabel: 'Base URL',
            baseUrlPlaceholder: 'https://api.openai.com/v1',
            modelLabel: 'Model',
            customModelLabel: '自定义模型名称',
            customModelPlaceholder: '输入模型名称',
            advancedSettings: '高级配置',
            saveConfigBtn: '💾 保存配置',

            // AI generation section
            promptPlaceholder: '描述你想要的漫画内容，例如：生成一个关于小明学习编程的故事',
            pageCountLabel: '生成页数:',
            rowsPerPageLabel: '每页行数:',
            comicStyleLabel: '漫画风格:',
            comicLanguageLabel: '漫画语言:',
            generateBtn: '✨ AI 生成多页分镜',
            generating: '生成中...',

            // Prompt optimization
            optimizePromptTitle: '优化提示词',
            statusOptimizeSuccess: '提示词已优化',
            alertEmptyPrompt: '请先输入内容',
            alertOptimizeFailed: '优化失败: {error}',

            // Comic styles
            styleDoraemon: '哆啦A梦风格',
            styleAmerican: '美式漫画风格',
            styleWatercolor: '水彩风格',
            styleDisney: '迪士尼动画风格',
            styleGhibli: '宫崎骏/吉卜力风格',
            stylePixar: '皮克斯动画风格',
            styleShonen: '日本少年漫画风格',
            styleTomAndJerry: '猫和老鼠风格',
            styleNezha: '哪吒风格',
            styleLanglangshan: '浪浪山小妖怪风格',

            // Comic languages
            langZh: '中文',
            langEn: 'English',
            langJa: '日本語',

            // Page navigation
            prevBtn: '←',
            nextBtn: '→',
            pageIndicator: '第 {current}/{total} 页',

            // Action buttons
            generateCurrentBtn: '🎨 生成当前页漫画',
            generateAllBtn: '🎨 生成所有页漫画',
            generateAllText: '生成全部',
            renderThisPage: '渲染本页',
            btnGenerateCover: '生成封面',
            xiaohongshuBtn: '📱 生成小红书内容',
            toggleView: '翻转预览',

            // Export dropdown
            exportBtn: '导出',
            exportText: '导出',
            xiaohongshuMenuItem: '生成社媒文案',
            socialMediaContent: '生成社媒文案',

            // Edit hint
            editHint: '点击任意面板可直接编辑内容',
            doubleClickToEdit: '双击编辑脚本',

            // Empty state
            emptyStateTitle: '开始创作你的漫画',
            emptyStateDesc: '在下方输入你的故事描述，AI 将为你生成精美的漫画分镜',
            emptyStep1: '输入故事描述',
            emptyStep2: 'AI 生成分镜',
            emptyStep3: '渲染精美图像',

            // Status messages
            statusGenerating: '正在调用 {model}...',
            statusSuccess: '✓ 生成成功！共{count}页',
            statusError: '✗ 生成失败: {error}',
            statusPreparing: '正在准备草图...',
            statusGeneratingImage: '正在生成当前漫画图片...',
            statusImageSuccess: '✓ 图片生成成功！',
            statusGeneratingPage: '正在生成第 {current}/{total} 页...',
            statusAllSuccess: '✓ 所有 {total} 页生成成功！',
            statusXiaohongshu: '正在生成小红书内容...',
            statusXiaohongshuSuccess: '✓ 小红书内容生成成功！',
            statusSocialMedia: '正在生成社交媒体内容...',
            statusSocialMediaSuccess: '✓ 社交媒体内容生成成功！',

            // Alerts
            alertNoApiKey: '请输入 OpenAI API Key',
            alertNoGoogleApiKey: '请在配置中输入 Google API Key',
            alertNoPrompt: '请描述你想要的漫画内容',
            alertConfigSaved: '✓ 配置已保存',
            alertConfigFailed: '配置保存失败',
            alertNoBaseUrl: '请输入 Base URL',
            alertNoCustomModel: '请输入自定义模型名称',
            alertNoPageData: '没有可生成的页面数据',
            alertNoPages: '没有可生成的页面',
            alertGenerateAll: '将生成所有 {total} 页漫画，这可能需要一些时间。是否继续？',
            alertBatchError: '生成过程中出错，但已成功生成 {success}/{total} 页。\n错误: {error}',
            alertBatchFailed: '批量生成失败: {error}',
            alertNoComicData: '请先生成漫画内容',
            alertDownloadFailed: '下载失败，请右键点击图片另存为',
            alertDownloadAlt: '无法自动下载，请在新窗口中右键点击图片另存为',
            alertCopyFailed: '复制失败，请手动复制',
            alertFileTooLarge: '文件太大。请上传小于 5MB 的图片。',

            // Error messages
            errorJsonFormat: 'JSON 格式错误',
            errorGenerationFailed: 'AI 生成失败: {error}\n\n提示：\n1. 请确保后端服务已启动 (python backend/app.py)\n2. 检查 Base URL 是否正确配置',
            errorImageFailed: '图片生成失败: {error}\n\n提示：请确保后端服务已启动',

            // Modal titles
            modalGeneratedTitle: '生成完成 - 共 {count} 页',
            modalXiaohongshuTitle: '📱 小红书内容',
            modalTwitterTitle: '🐦 Twitter 帖子',
            modalTitleLabel: '标题：',
            modalContentLabel: '正文：',
            modalTagsLabel: '标签：',

            // Modal buttons
            btnDownloadThis: '下载此页',
            btnDownloadAll: '下载所有图片',
            btnDownloading: '下载中...',
            btnClose: '关闭',
            btnCopyAll: '📋 复制全部',
            btnCopied: '✓ 已复制',
            btnDownloadImage: '下载图片',
            btnCancel: '取消',
            statusGeneratingCover: '封面生成中...',
            modalCoverTitle: '漫画封面',
            coverCustomTitle: '自定义封面要求',
            coverCustomOptional: '（可选）',
            coverCustomPlaceholder: '例如：使用对比色和大字报风格。左边是哭泣的打工人，右边是喝咖啡的闪电，中间大字"贫富差距？"',
            coverCustomGenerate: '直接生成',


            // Session management
            sessionTitle: '会话管理',
            newSession: '新建会话',
            renameSession: '重命名',
            deleteSession: '删除',
            switchSession: '切换',
            sessionName: '会话名称',
            confirmDeleteSession: '确定要删除此会话吗？',
            defaultSessionName: 'session',
            alertLastSession: '无法删除最后一个会话',
            alertStorageFull: '存储空间已满，请删除一些会话或清除浏览器数据',
            confirmClearAll: '确定要删除所有会话吗？此操作无法撤销。',
            sessionListTitle: '所有会话',
            currentSession: '当前会话',

            // Errors
            // Language switcher
            languageLabel: '语言 / Language',
        },

        en: {
            // Page title
            pageTitle: 'comic-perfect',

            // Main header
            appName: 'ComicPerfect',
            configBtn: '⚙️ Config',
            themeLabel: 'Theme',
            themeBtnLight: 'Light',
            themeBtnDark: 'Dark',
            languageLabelShort: 'Language',

            // Configuration panel
            configTitle: 'Environment Configuration',
            apiKeyLabel: 'OpenAI API Key',
            apiKeyPlaceholder: 'Enter your OpenAI API Key',
            googleApiKeyLabel: 'Google API Key',
            googleApiKeyPlaceholder: 'Enter your Google API Key (for image generation)',
            baseUrlLabel: 'Base URL',
            baseUrlPlaceholder: 'https://api.openai.com/v1',
            modelLabel: 'Model',
            customModelLabel: 'Custom Model Name',
            customModelPlaceholder: 'Enter model name',
            advancedSettings: 'Advanced Configuration',
            saveConfigBtn: '💾 Save Config',

            // AI generation section
            promptPlaceholder: 'Describe the comic you want, e.g.: Generate a story about Xiao Ming learning programming',
            pageCountLabel: 'Pages:',
            rowsPerPageLabel: 'Rows per Page:',
            comicStyleLabel: 'Comic Style:',
            comicLanguageLabel: 'Comic Language:',
            generateBtn: '✨ Generate Comic',
            generating: 'Generating...',

            // Prompt optimization
            optimizePromptTitle: 'Optimize Prompt',
            statusOptimizeSuccess: 'Prompt optimized',
            alertEmptyPrompt: 'Please enter content first',
            alertOptimizeFailed: 'Optimization failed: {error}',

            // Comic styles
            styleDoraemon: 'Doraemon Style',
            styleAmerican: 'American Comic Style',
            styleWatercolor: 'Watercolor Style',
            styleDisney: 'Disney Animation Style',
            styleGhibli: 'Ghibli/Miyazaki Style',
            stylePixar: 'Pixar Animation Style',
            styleShonen: 'Japanese Shonen Manga Style',
            styleTomAndJerry: 'Tom and Jerry Style',
            styleNezha: 'Nezha Style',
            styleLanglangshan: 'Little Monster of Langlang Mountain Style',

            // Comic languages
            langZh: '中文',
            langEn: 'English',
            langJa: '日本語',

            // Page navigation
            prevBtn: '←',
            nextBtn: '→',
            pageIndicator: 'Page {current}/{total}',

            // Action buttons
            generateCurrentBtn: '🎨 Generate Current Page',
            generateAllBtn: '🎨 Generate All Pages',
            generateAllText: 'Generate All',
            renderThisPage: 'Render Page',
            btnGenerateCover: 'Generate Cover',
            xiaohongshuBtn: '📱 Generate Twitter Post',
            toggleView: 'Flip View',

            // Export dropdown
            exportBtn: 'Export',
            exportText: 'Export',
            xiaohongshuMenuItem: 'Generate Social Post',
            socialMediaContent: 'Generate Social Post',

            // Edit hint
            editHint: 'Click any panel to edit content directly',
            doubleClickToEdit: 'Double-click to edit script',

            // Empty state
            emptyStateTitle: 'Start Creating Your Comic',
            emptyStateDesc: 'Describe your story below, and AI will generate beautiful comic panels for you',
            emptyStep1: 'Describe Story',
            emptyStep2: 'AI Generates',
            emptyStep3: 'Render Images',

            // Status messages
            statusGenerating: 'Calling {model}...',
            statusSuccess: '✓ Generated successfully! {count} pages',
            statusError: '✗ Generation failed: {error}',
            statusPreparing: 'Preparing sketch...',
            statusGeneratingImage: 'Generating current comic image...',
            statusImageSuccess: '✓ Image generated successfully!',
            statusGeneratingPage: 'Generating page {current}/{total}...',
            statusAllSuccess: '✓ All {total} pages generated successfully!',
            statusXiaohongshu: 'Generating Xiaohongshu content...',
            statusXiaohongshuSuccess: '✓ Xiaohongshu content generated successfully!',
            statusSocialMedia: 'Generating Twitter post...',
            statusSocialMediaSuccess: '✓ Twitter post generated successfully!',

            // Alerts
            alertNoApiKey: 'Please enter OpenAI API Key',
            alertNoGoogleApiKey: 'Please enter Google API Key in settings',
            alertNoPrompt: 'Please describe the comic you want',
            alertConfigSaved: '✓ Configuration saved',
            alertConfigFailed: 'Configuration save failed',
            alertNoBaseUrl: 'Please enter Base URL',
            alertNoCustomModel: 'Please enter custom model name',
            alertNoPageData: 'No page data to generate',
            alertNoPages: 'No pages to generate',
            alertGenerateAll: 'Will generate all {total} pages, this may take some time. Continue?',
            alertBatchError: 'Error occurred during generation, but successfully generated {success}/{total} pages.\nError: {error}',
            alertBatchFailed: 'Batch generation failed: {error}',
            alertNoComicData: 'Please generate comic content first',
            alertDownloadFailed: 'Download failed, please right-click and save image',
            alertDownloadAlt: 'Cannot auto-download, please right-click and save image in new window',
            alertCopyFailed: 'Copy failed, please copy manually',
            alertFileTooLarge: 'File is too large. Please upload an image smaller than 5MB.',

            // Error messages
            errorJsonFormat: 'JSON format error',
            errorGenerationFailed: 'AI generation failed: {error}\n\nTips:\n1. Make sure backend service is running (python backend/app.py)\n2. Check if Base URL is configured correctly',
            errorImageFailed: 'Image generation failed: {error}\n\nTip: Please make sure backend service is running',

            // Modal titles
            modalGeneratedTitle: 'Generated - {count} pages',
            modalXiaohongshuTitle: '📱 Xiaohongshu Content',
            modalTwitterTitle: '🐦 Twitter Post',
            modalTitleLabel: 'Title:',
            modalContentLabel: 'Content:',
            modalTagsLabel: 'Tags:',

            // Modal buttons
            btnDownloadThis: 'Download This',
            btnDownloadAll: 'Download All',
            btnDownloading: 'Downloading...',
            btnClose: 'Close',
            btnCopyAll: '📋 Copy All',
            btnCopied: '✓ Copied',
            btnDownloadImage: 'Download Image',
            btnCancel: 'Cancel',
            statusGeneratingCover: 'Generating Cover...',
            modalCoverTitle: 'Comic Cover',
            coverCustomTitle: 'Custom Cover Requirements',
            coverCustomOptional: '(Optional)',
            coverCustomPlaceholder: 'For example: Use contrasting colors and propaganda poster style. Left side: crying office worker, Right side: lightning drinking coffee, Center: large text "Wealth Gap?"',
            coverCustomGenerate: 'Generate',


            // Session management
            sessionTitle: 'Session Management',
            newSession: 'New Session',
            renameSession: 'Rename',
            deleteSession: 'Delete',
            switchSession: 'Switch',
            sessionName: 'Session Name',
            confirmDeleteSession: 'Are you sure you want to delete this session?',
            defaultSessionName: 'session',
            alertLastSession: 'Cannot delete the last session',
            alertStorageFull: 'Storage quota exceeded. Please delete some sessions or clear browser data.',
            confirmClearAll: 'Are you sure you want to delete all sessions? This cannot be undone.',
            sessionListTitle: 'All Sessions',
            currentSession: 'Current Session',

            // Errors
            // Language switcher
            languageLabel: 'Language / 语言',
        }
    },

    /**
     * Initialize i18n with saved language preference
     */
    init() {
        const savedLang = localStorage.getItem('comic-perfect-lang') || 'en';
        this.setLanguage(savedLang);
    },

    /**
     * Get translation for a key
     * @param {string} key - Translation key
     * @param {Object} params - Parameters to replace in translation
     * @returns {string} Translated text
     */
    t(key, params = {}) {
        let text = this.translations[this.currentLang][key] || key;

        // Replace parameters
        Object.keys(params).forEach(param => {
            text = text.replace(`{${param}}`, params[param]);
        });

        return text;
    },

    /**
     * Set current language
     * @param {string} lang - Language code ('zh' or 'en')
     */
    setLanguage(lang) {
        if (!this.translations[lang]) {
            console.warn(`Language ${lang} not supported, falling back to en`);
            lang = 'en';
        }

        this.currentLang = lang;
        localStorage.setItem('comic-perfect-lang', lang);
        this.updateUI();
    },

    /**
     * Get current language
     * @returns {string} Current language code
     */
    getLanguage() {
        return this.currentLang;
    },

    /**
     * Update all UI text elements
     */
    updateUI() {
        // Update page title
        document.title = this.t('pageTitle');

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const params = element.getAttribute('data-i18n-params');

            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.placeholder = this.t(key, params ? JSON.parse(params) : {});
            } else if (element.tagName === 'OPTION') {
                element.textContent = this.t(key);
            } else {
                element.innerHTML = this.t(key, params ? JSON.parse(params) : {});
            }
        });

        // Update elements with data-i18n-tooltip attribute
        document.querySelectorAll('[data-i18n-tooltip]').forEach(element => {
            const key = element.getAttribute('data-i18n-tooltip');
            const params = element.getAttribute('data-i18n-params');
            element.setAttribute('data-tooltip', this.t(key, params ? JSON.parse(params) : {}));
        });

        // Trigger custom event for components that need to update
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: this.currentLang } }));

        // Update theme button title if theme manager exists
        if (window.themeManager) {
            window.themeManager.updateThemeButton();
        }
    }
};

// Initialize on load
if (typeof window !== 'undefined') {
    window.i18n = i18n;
}
