/**
 * Configuration Module - Manages user settings and preferences
 */

const DEFAULT_CONFIG = {
    baseUrl: 'https://api.openai.com/v1',
    modelProvider: 'codex',
    model: 'gpt-6.1-sol',
    customModel: '',
    reasoningEffort: 'medium',
    imageProvider: 'codex',
    imageModel: 'gpt-image-2',
    customImageModel: '',
    imageSize: '1024x1536',
    imageQuality: 'medium',
    drawingPlayback: true
};

class ConfigManager {
    static readSecret(key) {
        if (!window.DesktopHost?.getSecret) return localStorage.getItem(key) || '';
        const result = window.DesktopHost.getSecret(key);
        if (!result.ok) throw new Error(result.error || '凭据暂不可用');
        const legacy = localStorage.getItem(key);
        if (legacy) {
            const saved = window.DesktopHost.setSecret(key, result.value || legacy);
            if (!saved.ok) throw new Error(saved.error || '凭据迁移失败');
            localStorage.removeItem(key);
        }
        return result.value || legacy || '';
    }

    static writeSecret(key, value) {
        if (window.DesktopHost?.setSecret) {
            const result = window.DesktopHost.setSecret(key, value);
            if (!result.ok) throw new Error(result.error || '凭据未保存');
            localStorage.removeItem(key);
        } else if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    }
    /**
     * Load configuration from localStorage
     * @returns {Object} Configuration object
     */
    static loadConfig() {
        try {
            const savedConfig = localStorage.getItem('comic_ai_config');
            if (savedConfig) {
                const parsedConfig = JSON.parse(savedConfig);
                const config = { ...DEFAULT_CONFIG, ...parsedConfig };
                if (!parsedConfig.modelProvider) {
                    if (parsedConfig.imageProvider === 'openai') {
                        config.modelProvider = 'openai';
                    } else if (parsedConfig.imageProvider === 'google') {
                        config.modelProvider = 'google';
                    }
                }
                if (!parsedConfig.imageProvider) {
                    config.imageProvider = config.modelProvider;
                }
                // Replace obsolete Codex presets while preserving custom/API models.
                const legacyCodexModels = [
                    'gpt-5.5', 'gpt-5.4-mini', 'gpt-5.3-codex-spark',
                    'gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'
                ];
                if (config.modelProvider === 'codex' && legacyCodexModels.includes(config.model)) {
                    config.model = DEFAULT_CONFIG.model;
                }
                return config;
            }
        } catch (e) {
            console.error('Failed to load config:', e);
        }
        return { ...DEFAULT_CONFIG };
    }

    /**
     * Save configuration to localStorage
     * @param {Object} config - Configuration to save
     * @returns {boolean} Success status
     */
    static saveConfig(config) {
        try {
            localStorage.setItem('comic_ai_config', JSON.stringify(config));
            return true;
        } catch (e) {
            console.error('Failed to save config:', e);
            return false;
        }
    }

    /**
     * Get current configuration with resolved model name
     * @returns {Object} Current configuration
     */
    static getCurrentConfig() {
        const config = this.loadConfig();
        let modelName = config.model;

        if (config.model === 'custom' && config.customModel) {
            modelName = config.customModel;
        }

        let imageModelName = config.imageModel;

        if (config.imageModel === 'custom' && config.customImageModel) {
            imageModelName = config.customImageModel;
        }

        return {
            baseUrl: config.baseUrl,
            modelProvider: config.modelProvider || 'codex',
            textProvider: config.modelProvider || 'codex',
            model: modelName,
            reasoningEffort: config.reasoningEffort || 'medium',
            imageProvider: config.imageProvider || config.modelProvider || 'codex',
            imageModel: imageModelName || 'gpt-image-2',
            imageSize: config.imageSize || '1024x1536',
            imageQuality: config.imageQuality || 'medium'
        };
    }

    /**
     * Load API key from localStorage
     * @returns {string} Saved API key or empty string
     */
    static loadApiKey() {
        try {
            return this.readSecret('comic_api_key');
        } catch (e) {
            console.error('Failed to load API key:', e);
            return '';
        }
    }

    /**
     * Save API key to localStorage
     * @param {string} apiKey - API key to save
     * @returns {boolean} Success status
     */
    static saveApiKey(apiKey) {
        try {
            const trimmedKey = apiKey.trim();
            this.writeSecret('comic_api_key', trimmedKey);
            return true;
        } catch (e) {
            console.error('Failed to save API key:', e);
            return false;
        }
    }

    /**
     * Load Google API key from localStorage
     * @returns {string} Saved Google API key or empty string
     */
    static loadGoogleApiKey() {
        try {
            return this.readSecret('comic_google_api_key');
        } catch (e) {
            console.error('Failed to load Google API key:', e);
            return '';
        }
    }

    /**
     * Save Google API key to localStorage
     * @param {string} apiKey - Google API key to save
     * @returns {boolean} Success status
     */
    static saveGoogleApiKey(apiKey) {
        try {
            const trimmedKey = apiKey.trim();
            this.writeSecret('comic_google_api_key', trimmedKey);
            return true;
        } catch (e) {
            console.error('Failed to save Google API key:', e);
            return false;
        }
    }

    /**
     * Clear all saved configuration
     */
    static clearConfig() {
        try {
            localStorage.removeItem('comic_ai_config');
            this.writeSecret('comic_api_key', '');
            this.writeSecret('comic_google_api_key', '');
        } catch (e) {
            console.error('Failed to clear config:', e);
        }
    }
}

// Export for use in other modules
window.ConfigManager = ConfigManager;
window.DEFAULT_CONFIG = DEFAULT_CONFIG;
