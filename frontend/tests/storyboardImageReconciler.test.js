const test = require('node:test');
const assert = require('node:assert/strict');

const StoryboardImageReconciler = require('../js/storyboardImageReconciler.js');

function page(id, text, sourceLine = 1) {
    return {
        id,
        title: text,
        character_names: ['木丁', '乌小云'],
        canvas: { width: 1024, height: 1536, aspect_ratio: '2:3' },
        rows: [{
            id: `${id}-row`,
            panels: [{
                id: `${id}-panel`,
                text,
                cover_candidate: false,
                source: { line: sourceLine }
            }]
        }],
        source: { line: sourceLine }
    };
}

function image(pageIndex, scriptPage = null) {
    const entry = {
        pageIndex,
        pageTitle: `Page ${pageIndex + 1}`,
        currentVersion: 0,
        versions: [{ imageUrl: `/page-${pageIndex + 1}.png`, version: 1 }]
    };
    if (scriptPage) {
        StoryboardImageReconciler.stampGeneratedImage(entry, scriptPage);
    }
    return entry;
}

test('keeps legacy images when only export provenance changes', () => {
    const oldPages = [page('IMG-01', '冲啊', 10), page('IMG-02', '还是晚了', 20)];
    const newPages = [page('IMG-01', '冲啊', 100), page('IMG-02', '还是晚了', 200)];
    const result = StoryboardImageReconciler.reconcile(
        oldPages,
        newPages,
        { 0: image(0), 1: image(1) }
    );

    assert.deepEqual(result.preservedPageIndices, [0, 1]);
    assert.deepEqual(result.pendingPageIndices, []);
    assert.equal(result.droppedImageCount, 0);
});

test('keeps pre-fingerprint images when the same source script gains derived fields', () => {
    const oldPages = [{
        id: 'IMG-01',
        title: '冲啊',
        rows: [{ panels: [{ text: '乌小云和木丁冲出教室。' }] }]
    }];
    const newPages = [{
        id: 'IMG-01',
        title: '冲啊',
        character_names: ['乌小云', '木丁'],
        canvas: { width: 1024, height: 1536, aspect_ratio: '2:3' },
        rows: [{
            id: 'IMG-01-A-ROW',
            height: 'auto',
            weight: 1,
            panels: [{
                id: 'IMG-01-A',
                text: '乌小云和木丁冲出教室。',
                character_names: ['乌小云', '木丁']
            }]
        }]
    }];

    const strictResult = StoryboardImageReconciler.reconcile(
        oldPages,
        newPages,
        { 0: image(0) }
    );
    const compatibleResult = StoryboardImageReconciler.reconcile(
        oldPages,
        newPages,
        { 0: image(0) },
        { allowLegacyScriptMatch: true }
    );

    assert.deepEqual(strictResult.pendingPageIndices, [0]);
    assert.deepEqual(compatibleResult.preservedPageIndices, [0]);
    assert.deepEqual(compatibleResult.pendingPageIndices, []);
});

test('does not use legacy fallback when authored panel text changed', () => {
    const oldPage = page('IMG-01', '旧剧情');
    const newPage = page('IMG-01', '新剧情');
    const result = StoryboardImageReconciler.reconcile(
        [oldPage],
        [newPage],
        { 0: image(0) },
        { allowLegacyScriptMatch: true }
    );

    assert.deepEqual(result.preservedPageIndices, []);
    assert.deepEqual(result.pendingPageIndices, [0]);
});

test('invalidates only the page whose visual script changed', () => {
    const oldPages = [
        page('IMG-01', '冲啊'),
        page('IMG-02', '还是晚了'),
        page('IMG-03', '散步')
    ];
    const newPages = [
        page('IMG-01', '冲啊'),
        page('IMG-02', '提前两分钟冲出去，还是晚了'),
        page('IMG-03', '散步')
    ];
    const result = StoryboardImageReconciler.reconcile(
        oldPages,
        newPages,
        { 0: image(0), 1: image(1), 2: image(2) }
    );

    assert.deepEqual(result.preservedPageIndices, [0, 2]);
    assert.deepEqual(result.pendingPageIndices, [1]);
    assert.equal(result.generatedImages[0].versions[0].imageUrl, '/page-1.png');
    assert.equal(result.generatedImages[2].versions[0].imageUrl, '/page-3.png');
});

test('remaps unchanged images after inserting and renumbering pages', () => {
    const oldA = page('IMG-01', '原来的 A');
    const oldB = page('IMG-02', '原来的 B');
    const nextPages = [
        page('IMG-01', '新插入页'),
        page('IMG-02', '原来的 A'),
        page('IMG-03', '原来的 B')
    ];
    const result = StoryboardImageReconciler.reconcile(
        [oldA, oldB],
        nextPages,
        { 0: image(0, oldA), 1: image(1, oldB) }
    );

    assert.deepEqual(result.preservedPageIndices, [1, 2]);
    assert.deepEqual(result.pendingPageIndices, [0]);
    assert.equal(result.generatedImages[1].versions[0].imageUrl, '/page-1.png');
    assert.equal(result.generatedImages[1].pageIndex, 1);
    assert.equal(result.generatedImages[1].versions[0].pageScriptId, 'IMG-02');
    assert.equal(result.generatedImages[2].versions[0].imageUrl, '/page-2.png');
    assert.equal(result.generatedImages[2].pageIndex, 2);
});

test('stored generation fingerprint detects an image made from an older script', () => {
    const generatedFrom = page('IMG-01', '旧剧情');
    const editedSessionPage = page('IMG-01', '新剧情');
    const result = StoryboardImageReconciler.reconcile(
        [editedSessionPage],
        [editedSessionPage],
        { 0: image(0, generatedFrom) }
    );

    assert.deepEqual(result.preservedPageIndices, []);
    assert.deepEqual(result.pendingPageIndices, [0]);
    assert.equal(result.droppedImageCount, 1);
});

test('drops images for removed pages without shifting them onto changed content', () => {
    const oldPages = [page('IMG-01', '保留'), page('IMG-02', '删除')];
    const newPages = [page('IMG-01', '保留')];
    const result = StoryboardImageReconciler.reconcile(
        oldPages,
        newPages,
        { 0: image(0), 1: image(1) }
    );

    assert.deepEqual(result.preservedPageIndices, [0]);
    assert.deepEqual(result.pendingPageIndices, []);
    assert.equal(result.droppedImageCount, 1);
    assert.deepEqual(Object.keys(result.generatedImages), ['0']);
});

test('restores server manifest images in a browser with no local session images', () => {
    const pages = [page('IMG-01', '冲啊'), page('IMG-02', '还是晚了')];
    const firstFingerprint = StoryboardImageReconciler.pageFingerprint(pages[0]);
    const secondFingerprint = StoryboardImageReconciler.pageFingerprint(pages[1]);
    const manifest = {
        schema_version: 'comicbrain-renders/1',
        pages: [
            {
                page_id: 'IMG-01',
                page_index: 0,
                page_title: '冲啊',
                page_script_fingerprint: firstFingerprint,
                current_version: 0,
                versions: [{
                    image_url: '/backend/static/images/page-1.png',
                    created_at: '2026-07-28T04:08:45Z',
                    page_script_fingerprint: firstFingerprint,
                    page_script_id: 'IMG-01'
                }]
            },
            {
                page_id: 'IMG-02',
                page_index: 1,
                page_title: '还是晚了',
                page_script_fingerprint: secondFingerprint,
                current_version: 1,
                versions: [
                    {
                        image_url: '/backend/static/images/page-2-v1.png',
                        created_at: '2026-07-28T04:12:24Z',
                        page_script_fingerprint: secondFingerprint,
                        page_script_id: 'IMG-02'
                    },
                    {
                        image_url: '/backend/static/images/page-2-v2.png',
                        created_at: '2026-07-28T04:54:36Z',
                        page_script_fingerprint: secondFingerprint,
                        page_script_id: 'IMG-02'
                    }
                ]
            }
        ]
    };

    const restored = StoryboardImageReconciler.imagesFromRenderManifest(
        manifest,
        pages
    );
    const result = StoryboardImageReconciler.reconcile([], pages, restored);

    assert.deepEqual(result.pendingPageIndices, []);
    assert.deepEqual(result.preservedPageIndices, [0, 1]);
    assert.equal(restored[1].versions.length, 2);
    assert.equal(restored[1].currentVersion, 1);
    assert.equal(
        restored[1].versions[1].imageUrl,
        '/backend/static/images/page-2-v2.png'
    );
});

test('does not restore earlier character-reference renders after one new page is made', () => {
    const pages = [page('IMG-01', '冲啊'), page('IMG-02', '还是晚了')];
    const fingerprint = StoryboardImageReconciler.pageFingerprint(pages[0]);
    const manifest = {
        source: { snapshot_hash: 'new-snapshot' },
        pages: [
            {
                page_id: 'IMG-01', page_index: 0, current_version: 1,
                versions: [
                    { image_url: '/backend/static/images/old.png', snapshot_hash: 'old-snapshot' },
                    { image_url: '/backend/static/images/new.png', snapshot_hash: 'new-snapshot', page_script_fingerprint: fingerprint }
                ]
            },
            {
                page_id: 'IMG-02', page_index: 1, current_version: 0,
                versions: [{ image_url: '/backend/static/images/still-old.png', snapshot_hash: 'old-snapshot' }]
            }
        ]
    };
    const restored = StoryboardImageReconciler.imagesFromRenderManifest(
        manifest, pages, 'new-snapshot'
    );
    assert.deepEqual(Object.keys(restored), ['0']);
    assert.equal(restored[0].versions.length, 1);
    assert.equal(restored[0].versions[0].imageUrl, '/backend/static/images/new.png');
});
