/**
 * Session Manager Module - Manages multiple comic sessions
 */

class SessionManager {
    constructor() {
        this.sessions = {};
        this.currentSessionId = null;
        this.storageKey = 'comic_sessions';
        this.currentSessionKey = 'comic_current_session';

        // Load sessions from storage or create default
        this.loadFromStorage();

        // If no sessions exist, create a default one
        if (Object.keys(this.sessions).length === 0) {
            this.createSession('session 1');
        }

        // If no current session is set, use the first one
        if (!this.currentSessionId || !this.sessions[this.currentSessionId]) {
            const firstSessionId = Object.keys(this.sessions)[0];
            this.currentSessionId = firstSessionId;
            this.saveCurrentSessionId();
        }
    }

    /**
     * Generate unique session ID
     * @returns {string} Unique session ID
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Create a new session
     * @param {string} name - Session name
     * @param {Object} config - Optional configuration (style, language, pageCount)
     * @returns {Object} Created session
     */
    createSession(name, config = {}) {
        const sessionId = this.generateSessionId();
        const now = new Date().toISOString();

        const session = {
            id: sessionId,
            name: name || 'session ' + (Object.keys(this.sessions).length + 1),
            comicData: null,
            generatedImages: {},
            currentPageIndex: 0,
            style: config.style || 'doraemon', // Use provided style or default
            language: config.language || ((window.i18n && typeof window.i18n.getLanguage === 'function') ? window.i18n.getLanguage() : 'en'),
            pageCount: config.pageCount || 3,
            rowsPerPage: config.rowsPerPage || 4,
            prompt: '',
            createdAt: now,
            updatedAt: now
        };

        this.sessions[sessionId] = session;
        this.saveToStorage();

        return session;
    }

    /**
     * Delete a session
     * @param {string} sessionId - Session ID to delete
     * @returns {boolean} Success status
     */
    deleteSession(sessionId) {
        if (!this.sessions[sessionId]) {
            return false;
        }

        // Prevent deleting the last session
        if (Object.keys(this.sessions).length === 1) {
            alert(window.i18n ? window.i18n.t('alertLastSession') : 'Cannot delete the last session');
            return false;
        }

        // If deleting current session, switch to another one first
        if (this.currentSessionId === sessionId) {
            const otherSessionId = Object.keys(this.sessions).find(id => id !== sessionId);
            if (otherSessionId) {
                this.switchSession(otherSessionId);
            }
        }

        delete this.sessions[sessionId];
        this.saveToStorage();

        return true;
    }

    /**
     * Switch to a different session
     * @param {string} sessionId - Session ID to switch to
     * @returns {Object|null} The session switched to, or null if not found
     */
    switchSession(sessionId) {
        if (!this.sessions[sessionId]) {
            return null;
        }

        this.currentSessionId = sessionId;
        this.saveCurrentSessionId();

        return this.sessions[sessionId];
    }

    /**
     * Update session data
     * @param {string} sessionId - Session ID to update
     * @param {Object} data - Data to update
     * @returns {boolean} Success status
     */
    updateSession(sessionId, data) {
        if (!this.sessions[sessionId]) {
            return false;
        }

        const session = this.sessions[sessionId];

        if (data.name !== undefined) session.name = data.name;
        if (data.comicData !== undefined) session.comicData = data.comicData;
        if (data.generatedImages !== undefined) session.generatedImages = data.generatedImages;
        if (data.currentPageIndex !== undefined) session.currentPageIndex = data.currentPageIndex;
        if (data.style !== undefined) session.style = data.style;
        if (data.language !== undefined) session.language = data.language;
        if (data.pageCount !== undefined) session.pageCount = data.pageCount;
        if (data.rowsPerPage !== undefined) session.rowsPerPage = data.rowsPerPage;
        if (data.prompt !== undefined) session.prompt = data.prompt;

        session.updatedAt = new Date().toISOString();

        this.saveToStorage();

        return true;
    }

    /**
     * Update current session
     * @param {Object} data - Data to update
     * @returns {boolean} Success status
     */
    updateCurrentSession(data) {
        return this.updateSession(this.currentSessionId, data);
    }

    /**
     * Get all sessions
     * @returns {Array} Array of sessions
     */
    getAllSessions() {
        return Object.values(this.sessions).sort((a, b) =>
            new Date(b.updatedAt) - new Date(a.updatedAt)
        );
    }

    /**
     * Get current session
     * @returns {Object|null} Current session or null
     */
    getCurrentSession() {
        return this.sessions[this.currentSessionId] || null;
    }

    /**
     * Get session by ID
     * @param {string} sessionId - Session ID
     * @returns {Object|null} Session or null
     */
    getSession(sessionId) {
        return this.sessions[sessionId] || null;
    }

    /**
     * Rename a session
     * @param {string} sessionId - Session ID
     * @param {string} newName - New session name
     * @returns {boolean} Success status
     */
    renameSession(sessionId, newName) {
        if (!this.sessions[sessionId] || !newName || !newName.trim()) {
            return false;
        }

        return this.updateSession(sessionId, { name: newName.trim() });
    }

    /**
     * Check if a session is empty (no user activity)
     * @param {Object} session - Session object to check
     * @returns {boolean} True if session is empty
     */
    isSessionEmpty(session) {
        if (!session) return true;

        // Session is considered empty if:
        // 1. No prompt entered
        // 2. No comic data generated
        // 3. No images generated
        const hasPrompt = session.prompt && session.prompt.trim().length > 0;
        const hasComicData = session.comicData !== null && session.comicData !== undefined;
        const hasGeneratedImages = session.generatedImages && Object.keys(session.generatedImages).length > 0;

        return !hasPrompt && !hasComicData && !hasGeneratedImages;
    }

    /**
     * Save sessions to localStorage
     * Filters out empty sessions before saving
     */
    saveToStorage() {
        try {
            // Filter out empty sessions, but keep current session and at least one session
            const sessionsToSave = {};
            let hasNonEmpty = false;

            for (const [id, session] of Object.entries(this.sessions)) {
                // Keep session if it's not empty OR if it's the current session
                if (!this.isSessionEmpty(session) || id === this.currentSessionId) {
                    sessionsToSave[id] = session;
                    if (!this.isSessionEmpty(session)) {
                        hasNonEmpty = true;
                    }
                }
            }

            // If all sessions are empty, keep the current session
            // to ensure we always have at least one session
            if (!hasNonEmpty && this.currentSessionId && this.sessions[this.currentSessionId]) {
                sessionsToSave[this.currentSessionId] = this.sessions[this.currentSessionId];
            }

            // Save filtered sessions to localStorage
            // Do NOT modify this.sessions in memory, only save to storage
            localStorage.setItem(this.storageKey, JSON.stringify(sessionsToSave));
        } catch (error) {
            console.error('Failed to save sessions to storage:', error);
            // Handle quota exceeded error
            if (error.name === 'QuotaExceededError') {
                alert(window.i18n ? window.i18n.t('alertStorageFull') : 'Storage quota exceeded. Please delete some sessions or clear browser data.');
            }
        }
    }

    /**
     * Save current session ID to localStorage
     */
    saveCurrentSessionId() {
        try {
            localStorage.setItem(this.currentSessionKey, this.currentSessionId);
        } catch (error) {
            console.error('Failed to save current session ID:', error);
        }
    }

    /**
     * Load sessions from localStorage
     * Filters out empty sessions except the current one
     */
    loadFromStorage() {
        try {
            const savedSessions = localStorage.getItem(this.storageKey);
            const savedCurrentId = localStorage.getItem(this.currentSessionKey);

            if (savedSessions) {
                const allSessions = JSON.parse(savedSessions);

                // Filter out empty sessions, but keep the current session
                const filteredSessions = {};
                let hasNonEmpty = false;

                for (const [id, session] of Object.entries(allSessions)) {
                    // Keep session if it's not empty OR if it's the current session
                    if (!this.isSessionEmpty(session) || id === savedCurrentId) {
                        filteredSessions[id] = session;
                        if (!this.isSessionEmpty(session)) {
                            hasNonEmpty = true;
                        }
                    }
                }

                // Ensure we have at least one session
                if (Object.keys(filteredSessions).length === 0 && savedCurrentId && allSessions[savedCurrentId]) {
                    filteredSessions[savedCurrentId] = allSessions[savedCurrentId];
                }

                this.sessions = filteredSessions;
            }

            if (savedCurrentId && this.sessions[savedCurrentId]) {
                this.currentSessionId = savedCurrentId;
            }
        } catch (error) {
            console.error('Failed to load sessions from storage:', error);
            this.sessions = {};
            this.currentSessionId = null;
        }
    }

    /**
     * Clear all sessions (for debugging/reset)
     */
    clearAllSessions() {
        if (confirm(window.i18n ? window.i18n.t('confirmClearAll') : 'Are you sure you want to delete all sessions? This cannot be undone.')) {
            this.sessions = {};
            this.currentSessionId = null;
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem(this.currentSessionKey);

            // Create a new default session
            this.createSession('session 1');
            this.currentSessionId = Object.keys(this.sessions)[0];
            this.saveCurrentSessionId();

            return true;
        }
        return false;
    }
}
