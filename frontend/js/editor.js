/**
 * Writing Buddy — Editor
 *
 * CodeMirror 5 with markdown mode, chapter/scene awareness, visual delimiter.
 * Title field shows the filename (without .md) and renames on save.
 */

const Editor = (() => {
    let cm = null;

    // Chapter → Scene hierarchy
    let _chapters = [];     // [{ title, scenes: [string] }]
    let _activeChapter = 0;
    let _activeScene = 0;

    let _fileRelPath = null;
    let _originalTitle = "";
    let _onSave = null;

    const SCENE_DELIMITER_RE = /^-{2,}\s*$/;

    function init(onSave) {
        _onSave = onSave;

        // Custom mode: markdown + scene delimiter overlay
        CodeMirror.defineMode("markdown_with_scenes", function(config) {
            const markdownMode = CodeMirror.getMode(config, "markdown");
            const sceneOverlay = {
                token: function(stream) {
                    if (stream.sol()) {
                        const line = stream.string.substring(stream.pos);
                        if (/^[-]{2,}\s*$/.test(line)) {
                            stream.match(/^[-]{2,}[\s]*$/);
                            return "scene-delimiter-line";
                        }
                    }
                    stream.next();
                    return null;
                }
            };
            return CodeMirror.overlayMode(markdownMode, sceneOverlay);
        });

        const textarea = document.getElementById("editor");
        cm = CodeMirror.fromTextArea(textarea, {
            mode: "markdown_with_scenes",
            theme: "material-darker",
            lineNumbers: false,
            lineWrapping: true,
            styleActiveLine: true,
            tabSize: 4,
            indentWithTabs: false,
            extraKeys: {
                "Ctrl-S": () => save(),
            },
        });

        cm.on("change", () => {
            updateWordCount();
            if (_fileRelPath && !Sidebar.isDirty()) {
                Sidebar.setDirty(_fileRelPath);
            }
        });
        cm.on("cursorActivity", updateWordCount);
    }

    /**
     * Load a file with chapter/scene structure provided by the API.
     */
    function loadFile(relPath, content, chapters) {
        _fileRelPath = relPath;

        const filename = relPath.split("/").pop();
        _originalTitle = filename.replace(/\.md$/i, "");
        setTitle(_originalTitle);

        // Store chapter structure from API
        _chapters = chapters || [{ title: "", scenes: [content], word_count: countWords(content) }];

        // CRITICAL: reset before loading
        _activeChapter = 0;
        _activeScene = -1;

        _loadChapter(0);

        show(document.getElementById("editor-area"));
        hide(document.getElementById("empty-state"));

        Sidebar.setClean(relPath);
        clearSaveStatus();
        cm.focus();
    }

    /**
     * Load a specific chapter into the editor (resets scene to 0).
     */
    function _loadChapter(chapterIndex) {
        _activeChapter = chapterIndex;
        _activeScene = -1;
        _setActiveScene(0);
    }

    /**
     * Show a specific scene in the editor.
     */
    function _setActiveScene(index) {
        const chapter = _chapters[_activeChapter];
        if (!chapter || index < 0 || index >= chapter.scenes.length) return;

        // Save current scene back to chapter
        if (_activeScene >= 0 && _activeScene < chapter.scenes.length) {
            chapter.scenes[_activeScene] = cm.getValue();
        }

        _activeScene = index;
        cm.setValue(chapter.scenes[index]);
        cm.setCursor(0, 0);

        _renderTabs();
        updateWordCount();
        updateFooter();
        cm.focus();
    }

    /**
     * Render chapter and scene tab buttons.
     *
     * Conditional display:
     * - 1 chapter + 1 scene: no tabs
     * - 1 chapter + 2+ scenes: scene tabs only
     * - 2+ chapters: chapter tabs shown; scene tabs shown if current chapter has 2+ scenes
     */
    function _renderTabs() {
        const chapterContainer = document.getElementById("chapter-tabs");
        const sceneContainer = document.getElementById("scene-tabs");
        if (!chapterContainer || !sceneContainer) return;

        chapterContainer.innerHTML = "";
        sceneContainer.innerHTML = "";

        const hasChapters = _chapters.length > 1;
        const chapter = _chapters[_activeChapter];
        const hasScenes = chapter && chapter.scenes.length > 1;

        if (!hasChapters && !hasScenes) return;

        // Chapter tabs
        if (hasChapters) {
            for (let i = 0; i < _chapters.length; i++) {
                const btn = document.createElement("button");
                btn.className = "chapter-tab" + (i === _activeChapter ? " active" : "");
                const label = _chapters[i].title || `Chapter ${i + 1}`;
                const wc = countWords(_chapters[i].scenes.join("\n---\n"));
                btn.innerHTML = `${escapeHtml(label)}<span class="tab-count">${wc}</span>`;
                btn.addEventListener("click", () => {
                    _saveCurrentScene();
                    _loadChapter(i);
                });
                chapterContainer.appendChild(btn);
            }
        }

        // Scene tabs
        if (hasScenes) {
            for (let i = 0; i < chapter.scenes.length; i++) {
                const btn = document.createElement("button");
                btn.className = "scene-tab" + (i === _activeScene ? " active" : "");
                const wc = countWords(chapter.scenes[i]);
                btn.innerHTML = `Scene ${i + 1}<span class="tab-count">${wc}</span>`;
                btn.addEventListener("click", () => _setActiveScene(i));
                sceneContainer.appendChild(btn);
            }
        }
    }

    function _saveCurrentScene() {
        const chapter = _chapters[_activeChapter];
        if (chapter && _activeScene >= 0 && _activeScene < chapter.scenes.length) {
            chapter.scenes[_activeScene] = cm.getValue();
        }
    }

    /**
     * Set the visible title input.
     */
    function setTitle(title) {
        const input = document.getElementById("title-input");
        if (input) input.value = title || "";
    }

    /**
     * Build the final file content from all chapters and scenes.
     */
    function buildContent() {
        _saveCurrentScene();

        const chapterTexts = _chapters.map(ch => {
            return ch.scenes.join("\n---\n");
        });

        return chapterTexts.join("\n\n");
    }

    /**
     * Get the current title value.
     */
    function getTitle() {
        const input = document.getElementById("title-input");
        return input ? input.value.trim() : "";
    }

    /**
     * Get original title (for detecting rename).
     */
    function getOriginalTitle() {
        return _originalTitle;
    }

    /**
     * Save. Optionally rename the file if title changed.
     */
    async function save() {
        const title = getTitle();
        if (!title) {
            alert("Title cannot be empty. Please enter a title before saving.");
            return false;
        }

        let finalRelPath = _fileRelPath;

        if (title !== _originalTitle) {
            try {
                const result = await api("/file/rename", {
                    method: "POST",
                    body: JSON.stringify({ path: _fileRelPath, new_title: title }),
                });
                finalRelPath = result.path;
                _fileRelPath = result.path;
                _originalTitle = title;
            } catch (e) {
                alert("Failed to rename file: " + e.message);
                return false;
            }
        }

        const content = buildContent();
        const statusEl = document.getElementById("save-status");
        if (statusEl) statusEl.textContent = "Saving...";

        try {
            await _onSave(finalRelPath, content);
            Sidebar.setClean(finalRelPath);
            if (statusEl) {
                statusEl.textContent = "Saved!";
                setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 1500);
            }
            return true;
        } catch (e) {
            if (statusEl) {
                statusEl.textContent = "Error";
                setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 2000);
            }
            alert("Save failed: " + e.message);
            return false;
        }
    }

    /**
     * Delete the currently loaded file from disk.
     */
    async function deleteFile() {
        if (!_fileRelPath) return null;

        const confirmed = confirm(`Delete "${_originalTitle}.md"? This cannot be undone.`);
        if (!confirmed) return null;

        try {
            await api("/file/" + encodeURIComponent(_fileRelPath), {
                method: "DELETE",
            });
            const deletedPath = _fileRelPath;

            _fileRelPath = null;
            _originalTitle = "";
            _chapters = [];
            _activeChapter = 0;
            _activeScene = 0;
            setTitle("");
            clearSaveStatus();
            clearTabs();
            cm.setValue("");

            hide(document.getElementById("editor-area"));
            show(document.getElementById("empty-state"));

            return deletedPath;
        } catch (e) {
            alert("Failed to delete file: " + e.message);
            return null;
        }
    }

    function updateWordCount() {
        const wc = countWords(cm.getValue());
        const el = document.getElementById("word-count");
        if (el) el.textContent = formatWordCount(wc);
    }

    function clearSaveStatus() {
        const statusEl = document.getElementById("save-status");
        if (statusEl) statusEl.textContent = "";
    }

    function clearTabs() {
        const chapterContainer = document.getElementById("chapter-tabs");
        const sceneContainer = document.getElementById("scene-tabs");
        if (chapterContainer) chapterContainer.innerHTML = "";
        if (sceneContainer) sceneContainer.innerHTML = "";
    }

    function updateFooter() {
        const chapter = _chapters[_activeChapter];
        const chapterLabel = chapter && chapter.title ? chapter.title : `Chapter ${_activeChapter + 1}`;

        const sceneEl = document.getElementById("scene-info");
        const hasChapters = _chapters.length > 1;
        const hasScenes = chapter && chapter.scenes.length > 1;

        if (hasChapters && hasScenes) {
            sceneEl.textContent = `${chapterLabel} · Scene ${_activeScene + 1} / ${chapter.scenes.length}`;
        } else if (hasScenes) {
            sceneEl.textContent = `Scene ${_activeScene + 1} / ${chapter.scenes.length}`;
        } else {
            sceneEl.textContent = "";
        }
    }

    return {
        init,
        loadFile,
        setTitle,
        save,
        deleteFile,
        buildContent,
        getTitle,
        getOriginalTitle,
        getFilePath: () => _fileRelPath,
    };
})();
