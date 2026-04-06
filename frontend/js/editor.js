/**
 * Writing Buddy — Editor
 *
 * CodeMirror 5 with markdown mode, scene tabs, visual delimiter.
 * Title field shows the filename (without .md) and renames on save.
 */

const Editor = (() => {
    let cm = null;
    let _scenes = [];
    let _activeScene = 0;
    let _fileRelPath = null;
    let _originalTitle = "";    // Title the file was loaded with (filename stem)
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
     * Load a file. The title is derived from the filename (without .md).
     */
    function loadFile(relPath, content) {
        _fileRelPath = relPath;

        // Derive initial title from the filename stem
        const filename = relPath.split("/").pop();
        _originalTitle = filename.replace(/\.md$/i, "");

        setTitle(_originalTitle);

        // CRITICAL: Reset active scene BEFORE parsing.
        // If we don't, _setActiveScene's guard will save the OLD CM content
        // into the NEW file's first scene (_activeScene starts at 0).
        _activeScene = -1;
        _scenes = [];

        // Normalize delimiters and split scenes
        const normalized = content.replace(/^[-]{2,}\s*$/gm, "---");
        _parseRawScenes(normalized);
        _setActiveScene(0);

        show(document.getElementById("editor-area"));
        hide(document.getElementById("empty-state"));

        Sidebar.setClean(relPath);
        clearSaveStatus();
        cm.focus();
    }

    /**
     * Parse raw content into scene array.
     */
    function _parseRawScenes(content) {
        _scenes = [];
        let current = [];
        const lines = content.split("\n");

        for (const line of lines) {
            if (SCENE_DELIMITER_RE.test(line.trim()) && line.trim()) {
                _scenes.push(current.join("\n"));
                current = [];
            } else {
                current.push(line);
            }
        }
        _scenes.push(current.join("\n"));

        if (_scenes.length > 1 && _scenes[_scenes.length - 1].trim() === "") {
            _scenes.pop();
        }
    }

    /**
     * Show a specific scene in the editor.
     */
    function _setActiveScene(index) {
        if (index < 0 || index >= _scenes.length) return;

        // Save current scene back to array (only if we have a valid active scene)
        if (_activeScene >= 0 && _activeScene < _scenes.length) {
            _scenes[_activeScene] = cm.getValue();
        }

        _activeScene = index;
        cm.setValue(_scenes[index]);
        cm.setCursor(0, 0);

        _renderTabs();
        updateWordCount();
        updateFooter();
        cm.focus();
    }

    /**
     * Render scene tab buttons.
     */
    function _renderTabs() {
        const container = document.getElementById("scene-tabs");
        container.innerHTML = "";

        if (_scenes.length <= 1) return;

        for (let i = 0; i < _scenes.length; i++) {
            const btn = document.createElement("button");
            btn.className = "scene-tab" + (i === _activeScene ? " active" : "");
            const wc = countWords(_scenes[i]);
            btn.innerHTML = `Scene ${i + 1}<span class="tab-count">${wc}</span>`;
            btn.addEventListener("click", () => _setActiveScene(i));
            container.appendChild(btn);
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
     * Build the final file content from all scenes.
     */
    function buildContent() {
        if (_activeScene >= 0 && _activeScene < _scenes.length) {
            _scenes[_activeScene] = cm.getValue();
        }
        return _scenes.join("\n---\n");
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
     *
     * @returns {boolean} True if save succeeded
     */
    async function save() {
        const title = getTitle();

        // Validate: empty title not allowed
        if (!title) {
            alert("Title cannot be empty. Please enter a title before saving.");
            return false;
        }

        let finalRelPath = _fileRelPath;

        // If title changed, rename the file first
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

        // Save content
        const content = buildContent();
        const saveBtn = document.getElementById("save-btn");
        if (saveBtn) saveBtn.textContent = "Saving...";

        try {
            await _onSave(finalRelPath, content);
            return true;
        } catch (e) {
            if (saveBtn) saveBtn.textContent = "Error";
            setTimeout(() => {
                if (saveBtn) { saveBtn.textContent = "Save"; saveBtn.disabled = false; }
            }, 2000);
            return false;
        }
    }

    /**
     * Delete the currently loaded file from disk.
     *
     * @returns {Promise<string|null>} The deleted file path, or null if cancelled/failed.
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

            // Reset editor state
            _fileRelPath = null;
            _originalTitle = "";
            _scenes = [];
            _activeScene = 0;
            setTitle("");
            clearSaveStatus();
            cm.setValue("");

            // Show empty state, hide editor
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

    function updateFooter() {
        const sceneEl = document.getElementById("scene-info");
        if (_scenes.length > 1) {
            sceneEl.textContent = `Scene ${_activeScene + 1} / ${_scenes.length}`;
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
