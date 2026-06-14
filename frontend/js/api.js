/**
 * API Module - Handles all backend API calls
 */

const API_BASE_URL = 'http://localhost:5003/api';

class ComicAPI {
    /**
     * Generate comic script using AI
     * @param {string} apiKey - OpenAI API key
     * @param {string} prompt - User's comic description
     * @param {number} pageCount - Number of pages to generate
     * @param {string} baseUrl - OpenAI API base URL
     * @param {string} model - Model name
     * @param {string} textProvider - Text provider ('codex', 'openai', or 'google')
     * @param {string} reasoningEffort - Reasoning effort ('low', 'medium', or 'high')
     * @param {string} comicStyle - Comic style (e.g., 'doraemon', 'manga', etc.)
     * @param {string} language - Comic language (e.g., 'zh', 'en', 'ja')
     * @param {number} rowsPerPage - Number of rows per page (1-5)
     * @param {string} googleApiKey - Google API key for fallback or direct use
     * @returns {Promise<Object>} Generated comic pages
     */
    static async generateComic(apiKey, prompt, pageCount, baseUrl, model, textProvider = 'codex', reasoningEffort = 'medium', comicStyle = 'doraemon', language = 'zh', rowsPerPage = 4, googleApiKey = null) {
        try {
            const response = await fetch(`${API_BASE_URL}/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    prompt: prompt,
                    page_count: pageCount,
                    base_url: baseUrl,
                    model: model,
                    text_provider: textProvider,
                    reasoning_effort: reasoningEffort,
                    comic_style: comicStyle,
                    language: language,
                    rows_per_page: rowsPerPage,
                    google_api_key: googleApiKey
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `API request failed: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    /**
     * Validate comic script format
     * @param {Object|Array} script - Comic script to validate
     * @returns {Promise<Object>} Validation result
     */
    static async validateScript(script) {
        try {
            const response = await fetch(`${API_BASE_URL}/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    script: script
                })
            });

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Validation failed:', error);
            return { valid: false, error: error.message };
        }
    }

    /**
     * Check API health
     * @returns {Promise<Object>} Health status
     */
    static async healthCheck() {
        try {
            const response = await fetch(`${API_BASE_URL}/health`);
            return await response.json();
        } catch (error) {
            console.error('Health check failed:', error);
            return { status: 'error', message: error.message };
        }
    }

    /**
     * Generate final comic image from page data
     * @param {Object} pageData - Comic page data
     * @param {string} referenceImg - Optional reference image URL
     * @param {Object} extraBody - Optional extra parameters
     * @param {string} comicStyle - Comic style
     * @param {number} rowsPerPage - Optional rows per page constraint
     * @param {string} language - Comic language (e.g., 'zh', 'en', 'ja')
     * @param {Object} imageConfig - Image provider/model settings
     * @returns {Promise<Object>} Generated image result
     */
    static async generateComicImage(pageData, referenceImg = null, extraBody = null, comicStyle = 'doraemon', rowsPerPage = null, language = 'zh', imageConfig = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}/generate-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    page_data: pageData,
                    api_key: imageConfig.openaiApiKey || null,
                    google_api_key: imageConfig.googleApiKey || null,
                    base_url: imageConfig.baseUrl || 'https://api.openai.com/v1',
                    image_provider: imageConfig.imageProvider || 'google',
                    image_model: imageConfig.imageModel || 'gpt-image-2',
                    image_size: imageConfig.imageSize || '1024x1536',
                    image_quality: imageConfig.imageQuality || 'medium',
                    reasoning_effort: imageConfig.reasoningEffort || 'medium',
                    reference_img: referenceImg,
                    extra_body: extraBody,
                    comic_style: comicStyle,
                    rows_per_page: rowsPerPage,
                    language: language
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `API request failed: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Image generation failed:', error);
            throw error;
        }
    }

    /**
     * Generate social media post content (Xiaohongshu or Twitter)
     * @param {string} apiKey - OpenAI API key
     * @param {Array|Object} comicData - Comic pages data
     * @param {string} baseUrl - OpenAI API base URL
     * @param {string} model - Model name
     * @param {string} textProvider - Text provider ('codex', 'openai', or 'google')
     * @param {string} reasoningEffort - Reasoning effort ('low', 'medium', or 'high')
     * @param {string} platform - Platform type ('xiaohongshu' or 'twitter')
     * @param {string} googleApiKey - Google API key for fallback
     * @returns {Promise<Object>} Generated social media content
     */
    static async generateSocialMediaContent(apiKey, comicData, baseUrl, model, textProvider = 'codex', reasoningEffort = 'medium', platform = 'xiaohongshu', googleApiKey = null) {
        try {
            const response = await fetch(`${API_BASE_URL}/generate-xiaohongshu`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    comic_data: comicData,
                    base_url: baseUrl,
                    model: model,
                    text_provider: textProvider,
                    reasoning_effort: reasoningEffort,
                    platform: platform,
                    google_api_key: googleApiKey
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `API request failed: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Social media content generation failed:', error);
            throw error;
        }
    }

    /**
     * Generate Xiaohongshu (Little Red Book) post content
     * @deprecated Use generateSocialMediaContent instead
     */
    static async generateXiaohongshuContent(apiKey, comicData, baseUrl, model) {
        return this.generateSocialMediaContent(apiKey, comicData, baseUrl, model, 'openai', 'medium', 'xiaohongshu');
    }

    /**
     * Generate comic cover
     * @param {string} reasoningEffort - Reasoning effort ('low', 'medium', or 'high')
     * @param {string} comicStyle - Comic style
     * @param {Array} referenceImages - List of reference images
     * @param {Object} imageConfig - Image provider/model settings
     * @returns {Promise<Object>} Generation result
     */
    static async generateCover(comicStyle, referenceImages = null, language = 'en', customRequirements = '', imageConfig = {}) {
        try {
            const response = await fetch(`${API_BASE_URL}/generate-cover`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    comic_style: comicStyle,
                    api_key: imageConfig.openaiApiKey || null,
                    google_api_key: imageConfig.googleApiKey || null,
                    base_url: imageConfig.baseUrl || 'https://api.openai.com/v1',
                    image_provider: imageConfig.imageProvider || 'google',
                    image_model: imageConfig.imageModel || 'gpt-image-2',
                    image_size: imageConfig.imageSize || '1024x1536',
                    image_quality: imageConfig.imageQuality || 'medium',
                    reasoning_effort: imageConfig.reasoningEffort || 'medium',
                    reference_imgs: referenceImages,
                    language: language,
                    custom_requirements: customRequirements
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Cover generation failed');
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    /**
     * Optimize user's simple prompt into detailed comic description
     * @param {string} apiKey - OpenAI API key (optional)
     * @param {string} googleApiKey - Google API key (optional, preferred)
     * @param {string} prompt - User's simple prompt
     * @param {string} baseUrl - OpenAI API base URL
     * @param {string} model - Model name
     * @param {string} comicStyle - Comic style
     * @param {string} language - Language
     * @returns {Promise<Object>} Optimization result
     */
    static async optimizePrompt(apiKey, googleApiKey, prompt, baseUrl, model, textProvider = 'codex', reasoningEffort = 'medium', comicStyle = 'doraemon', language = 'zh') {
        try {
            const response = await fetch(`${API_BASE_URL}/optimize-prompt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    google_api_key: googleApiKey,
                    prompt: prompt,
                    base_url: baseUrl,
                    model: model,
                    text_provider: textProvider,
                    reasoning_effort: reasoningEffort,
                    comic_style: comicStyle,
                    language: language
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `API request failed: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Prompt optimization failed:', error);
            throw error;
        }
    }

    /**
     * Generate a session title based on comic prompt and data
     * @param {string} apiKey - OpenAI API key (optional)
     * @param {string} googleApiKey - Google API key (optional, preferred)
     * @param {string} prompt - User's comic prompt
     * @param {Object} comicData - Generated comic data (optional)
     * @param {string} baseUrl - OpenAI API base URL
     * @param {string} model - Model name
     * @param {string} reasoningEffort - Reasoning effort ('low', 'medium', or 'high')
     * @param {string} language - Language
     * @returns {Promise<Object>} Title generation result
     */
    static async generateSessionTitle(apiKey, googleApiKey, prompt, comicData = null, baseUrl = 'https://api.openai.com/v1', model = 'gpt-5.5', textProvider = 'codex', reasoningEffort = 'medium', language = 'zh') {
        try {
            const response = await fetch(`${API_BASE_URL}/generate-session-title`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    google_api_key: googleApiKey,
                    prompt: prompt,
                    comic_data: comicData,
                    base_url: baseUrl,
                    model: model,
                    text_provider: textProvider,
                    reasoning_effort: reasoningEffort,
                    language: language
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `API request failed: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Session title generation failed:', error);
            throw error;
        }
    }
}

// Export for use in other modules
window.ComicAPI = ComicAPI;
