/**
 * Reconcile generated page images with a newly loaded storyboard.
 *
 * Image validity follows the visual page script, not the whole ComicBrain
 * snapshot. This lets cover/provenance changes keep existing page images while
 * making only changed or newly added pages pending for Resume.
 */
class StoryboardImageReconciler {
    static ignoredScriptFields = new Set(['id', 'source', 'cover_candidate']);

    /**
     * Normalize a page to the fields that can affect page-image generation.
     * Export provenance and structural IDs are intentionally ignored.
     */
    static normalizePageScript(value, parentKey = '') {
        if (Array.isArray(value)) {
            const normalized = value.map(item => this.normalizePageScript(item));
            return parentKey === 'character_names'
                ? normalized.slice().sort()
                : normalized;
        }
        if (value && typeof value === 'object') {
            return Object.keys(value)
                .filter(key => !this.ignoredScriptFields.has(key))
                .sort()
                .reduce((result, key) => {
                    const item = value[key];
                    if (item !== undefined) {
                        result[key] = this.normalizePageScript(item, key);
                    }
                    return result;
                }, {});
        }
        return value;
    }

    /**
     * Return a compact deterministic fingerprint for a page's visual script.
     */
    static pageFingerprint(page) {
        const serialized = JSON.stringify(this.normalizePageScript(page || {}));
        let first = 0x811c9dc5;
        let second = 0x9e3779b9;
        for (let index = 0; index < serialized.length; index++) {
            const code = serialized.charCodeAt(index);
            first = Math.imul(first ^ code, 0x01000193);
            second = Math.imul(second ^ code, 0x5bd1e995);
            second ^= second >>> 13;
        }
        return `page-v1:${serialized.length}:${(first >>> 0).toString(16).padStart(8, '0')}:${(second >>> 0).toString(16).padStart(8, '0')}`;
    }

    /**
     * Older image records have no generation-time fingerprint. For those
     * records, compare only the authored page title, panel grouping, and panel
     * text so exporter-added canvas/provenance fields do not invalidate images.
     */
    static legacyPageScript(page) {
        const rows = page && Array.isArray(page.rows) ? page.rows : [];
        return {
            title: page && typeof page.title === 'string' ? page.title : '',
            rows: rows.map(row => ({
                panels: row && Array.isArray(row.panels)
                    ? row.panels.map(panel => ({
                        text: panel && typeof panel.text === 'string' ? panel.text : ''
                    }))
                    : []
            }))
        };
    }

    static legacyPageFingerprint(page) {
        return JSON.stringify(this.legacyPageScript(page));
    }

    static hasUsableImage(entry) {
        if (!entry || typeof entry !== 'object') return false;
        if (entry.imageUrl) return true;
        return Array.isArray(entry.versions)
            && entry.versions.some(version => version && version.imageUrl);
    }

    static currentVersion(entry) {
        if (!entry || !Array.isArray(entry.versions) || entry.versions.length === 0) {
            return null;
        }
        const requestedIndex = Number.isInteger(entry.currentVersion)
            ? entry.currentVersion
            : 0;
        return entry.versions[requestedIndex] || entry.versions[0] || null;
    }

    /**
     * Stamp an image entry after generation so later script edits can be
     * detected even if the session's editable page data has already changed.
     */
    static stampGeneratedImage(entry, page) {
        if (!entry || typeof entry !== 'object') return entry;
        const fingerprint = this.pageFingerprint(page);
        const pageId = page && typeof page.id === 'string' ? page.id : null;
        entry.pageScriptFingerprint = fingerprint;
        entry.pageScriptId = pageId;

        const currentVersion = this.currentVersion(entry);
        if (currentVersion) {
            currentVersion.pageScriptFingerprint = fingerprint;
            currentVersion.pageScriptId = pageId;
        }
        return entry;
    }

    static imageFingerprint(entry, fallbackPage) {
        return (
            this.storedImageFingerprint(entry)
            || this.pageFingerprint(fallbackPage)
        );
    }

    static storedImageFingerprint(entry) {
        const currentVersion = this.currentVersion(entry);
        return (
            (currentVersion && currentVersion.pageScriptFingerprint)
            || (entry && entry.pageScriptFingerprint)
            || null
        );
    }

    static imagePageId(entry, fallbackPage) {
        const currentVersion = this.currentVersion(entry);
        const candidate = (
            (currentVersion && currentVersion.pageScriptId)
            || entry.pageScriptId
            || (fallbackPage && fallbackPage.id)
        );
        return typeof candidate === 'string' && candidate ? candidate : null;
    }

    static cloneImageEntry(entry, page, pageIndex, fingerprint) {
        const cloned = {
            ...entry,
            pageIndex,
            pageTitle: (page && page.title) || `Page ${pageIndex + 1}`,
            pageScriptFingerprint: fingerprint,
            pageScriptId: page && typeof page.id === 'string' ? page.id : null
        };
        if (Array.isArray(entry.versions)) {
            cloned.versions = entry.versions.map(version => (
                version && typeof version === 'object' ? { ...version } : version
            ));
        }
        const currentVersion = this.currentVersion(cloned);
        if (currentVersion) {
            currentVersion.pageScriptFingerprint = fingerprint;
            currentVersion.pageScriptId = cloned.pageScriptId;
        }
        return cloned;
    }

    /**
     * Convert the server-owned ComicBrain render manifest into the same image
     * structure used by browser sessions.
     */
    static imagesFromRenderManifest(manifest, pages, snapshotHash = null) {
        const pageList = Array.isArray(pages) ? pages : [];
        const records = manifest && Array.isArray(manifest.pages)
            ? manifest.pages
            : [];
        const manifestSnapshotHash = manifest && manifest.source
            ? manifest.source.snapshot_hash
            : null;
        const pageIndexById = new Map();
        pageList.forEach((page, index) => {
            if (page && typeof page.id === 'string' && page.id) {
                pageIndexById.set(page.id, index);
            }
        });

        return records.reduce((images, record) => {
            if (!record || typeof record !== 'object') return images;
            const savedIndex = Number(record.page_index);
            const targetIndex = pageIndexById.has(record.page_id)
                ? pageIndexById.get(record.page_id)
                : savedIndex;
            if (
                !Number.isInteger(targetIndex)
                || targetIndex < 0
                || targetIndex >= pageList.length
            ) {
                return images;
            }

            const retainedVersions = Array.isArray(record.versions)
                ? record.versions
                    .map((version, sourceIndex) => ({ version, sourceIndex }))
                    .filter(({ version }) => (
                        version
                        && typeof version === 'object'
                        && typeof version.image_url === 'string'
                        && version.image_url
                        && (!snapshotHash || (
                            version.snapshot_hash || manifestSnapshotHash
                        ) === snapshotHash)
                    ))
                : [];
            const versions = retainedVersions.map(({ version }, index) => ({
                        imageUrl: version.image_url,
                        timestamp: Date.parse(version.created_at) || 0,
                        version: index + 1,
                        pageScriptFingerprint: (
                            version.page_script_fingerprint
                            || record.page_script_fingerprint
                            || null
                        ),
                        pageScriptId: version.page_script_id || record.page_id || null
                    }));
            if (versions.length === 0) return images;

            const requestedVersion = Number(record.current_version);
            const selectedVersion = retainedVersions.findIndex(
                item => item.sourceIndex === requestedVersion
            );
            const currentVersion = selectedVersion >= 0
                ? selectedVersion
                : versions.length - 1;
            images[targetIndex] = {
                pageIndex: targetIndex,
                pageTitle: (
                    (pageList[targetIndex] && pageList[targetIndex].title)
                    || record.page_title
                    || `Page ${targetIndex + 1}`
                ),
                currentVersion,
                versions,
                pageScriptFingerprint: (
                    versions[currentVersion].pageScriptFingerprint
                    || record.page_script_fingerprint
                    || null
                ),
                pageScriptId: (
                    versions[currentVersion].pageScriptId
                    || record.page_id
                    || null
                )
            };
            return images;
        }, {});
    }

    /**
     * Preserve images whose page script still matches, remapping them when an
     * unchanged page moved. Changed, new, and unmatched pages are left pending.
     */
    static reconcile(previousPages, nextPages, generatedImages, options = {}) {
        const oldPages = Array.isArray(previousPages) ? previousPages : [];
        const newPages = Array.isArray(nextPages) ? nextPages : [];
        const allowLegacyScriptMatch = options.allowLegacyScriptMatch === true;
        const images = generatedImages && typeof generatedImages === 'object'
            ? generatedImages
            : {};
        const nextFingerprints = newPages.map(page => this.pageFingerprint(page));
        const nextLegacyFingerprints = newPages.map(page => this.legacyPageFingerprint(page));
        const candidates = [];
        const seenOldIndices = new Set();

        Object.entries(images).forEach(([key, entry]) => {
            if (!this.hasUsableImage(entry)) return;
            const keyIndex = Number(key);
            const entryIndex = Number(entry && entry.pageIndex);
            const oldIndex = Number.isInteger(keyIndex) && keyIndex >= 0
                ? keyIndex
                : entryIndex;
            if (!Number.isInteger(oldIndex) || oldIndex < 0 || seenOldIndices.has(oldIndex)) {
                return;
            }
            seenOldIndices.add(oldIndex);
            const fallbackPage = oldPages[oldIndex] || {};
            const storedFingerprint = this.storedImageFingerprint(entry);
            candidates.push({
                oldIndex,
                entry,
                fingerprint: storedFingerprint || this.pageFingerprint(fallbackPage),
                legacyFingerprint: this.legacyPageFingerprint(fallbackPage),
                hasStoredFingerprint: !!storedFingerprint,
                pageId: this.imagePageId(entry, fallbackPage)
            });
        });

        const matches = new Map();
        const usedCandidates = new Set();
        const match = (newIndex, candidateIndex) => {
            matches.set(newIndex, candidateIndex);
            usedCandidates.add(candidateIndex);
        };
        const nearestCandidate = (newIndex, predicate) => {
            let bestIndex = -1;
            let bestDistance = Number.POSITIVE_INFINITY;
            candidates.forEach((candidate, candidateIndex) => {
                if (usedCandidates.has(candidateIndex) || !predicate(candidate)) return;
                const distance = Math.abs(candidate.oldIndex - newIndex);
                if (distance < bestDistance) {
                    bestIndex = candidateIndex;
                    bestDistance = distance;
                }
            });
            return bestIndex;
        };

        // Prefer a stable page ID when both the ID and visual script agree.
        newPages.forEach((page, newIndex) => {
            const pageId = page && typeof page.id === 'string' ? page.id : null;
            if (!pageId) return;
            const candidateIndex = nearestCandidate(
                newIndex,
                candidate => candidate.pageId === pageId
                    && candidate.fingerprint === nextFingerprints[newIndex]
            );
            if (candidateIndex >= 0) match(newIndex, candidateIndex);
        });

        // Preserve the same slot next when its script is unchanged.
        newPages.forEach((page, newIndex) => {
            if (matches.has(newIndex)) return;
            const candidateIndex = nearestCandidate(
                newIndex,
                candidate => candidate.oldIndex === newIndex
                    && candidate.fingerprint === nextFingerprints[newIndex]
            );
            if (candidateIndex >= 0) match(newIndex, candidateIndex);
        });

        if (allowLegacyScriptMatch) {
            // Images created before page fingerprints existed get a narrower
            // compatibility comparison, but only when ComicBrain confirms the
            // underlying chapter script hash is unchanged.
            newPages.forEach((page, newIndex) => {
                if (matches.has(newIndex)) return;
                const pageId = page && typeof page.id === 'string' ? page.id : null;
                if (!pageId) return;
                const candidateIndex = nearestCandidate(
                    newIndex,
                    candidate => !candidate.hasStoredFingerprint
                        && candidate.pageId === pageId
                        && candidate.legacyFingerprint === nextLegacyFingerprints[newIndex]
                );
                if (candidateIndex >= 0) match(newIndex, candidateIndex);
            });

            newPages.forEach((page, newIndex) => {
                if (matches.has(newIndex)) return;
                const candidateIndex = nearestCandidate(
                    newIndex,
                    candidate => !candidate.hasStoredFingerprint
                        && candidate.oldIndex === newIndex
                        && candidate.legacyFingerprint === nextLegacyFingerprints[newIndex]
                );
                if (candidateIndex >= 0) match(newIndex, candidateIndex);
            });

            newPages.forEach((page, newIndex) => {
                if (matches.has(newIndex)) return;
                const candidateIndex = nearestCandidate(
                    newIndex,
                    candidate => !candidate.hasStoredFingerprint
                        && candidate.legacyFingerprint === nextLegacyFingerprints[newIndex]
                );
                if (candidateIndex >= 0) match(newIndex, candidateIndex);
            });
        }

        // Finally remap unchanged content that moved because pages were
        // inserted, deleted, or reordered.
        newPages.forEach((page, newIndex) => {
            if (matches.has(newIndex)) return;
            const candidateIndex = nearestCandidate(
                newIndex,
                candidate => candidate.fingerprint === nextFingerprints[newIndex]
            );
            if (candidateIndex >= 0) match(newIndex, candidateIndex);
        });

        const reconciledImages = {};
        const preservedPageIndices = [];
        matches.forEach((candidateIndex, newIndex) => {
            const candidate = candidates[candidateIndex];
            reconciledImages[newIndex] = this.cloneImageEntry(
                candidate.entry,
                newPages[newIndex],
                newIndex,
                nextFingerprints[newIndex]
            );
            preservedPageIndices.push(newIndex);
        });
        preservedPageIndices.sort((a, b) => a - b);

        const pendingPageIndices = newPages
            .map((page, index) => index)
            .filter(index => !matches.has(index));

        return {
            generatedImages: reconciledImages,
            preservedPageIndices,
            pendingPageIndices,
            droppedImageCount: candidates.length - matches.size
        };
    }
}

if (typeof window !== 'undefined') {
    window.StoryboardImageReconciler = StoryboardImageReconciler;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StoryboardImageReconciler;
}
