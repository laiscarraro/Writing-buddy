/**
 * Writing Buddy — Sidebar / File Tree
 *
 * Renders the folder/file tree from the vault API,
 * handles drag & drop for moving files, folder collapse,
 * new file creation, and file deletion.
 */

const Sidebar = (() => {
    let _onFileSelect = null;
    let _onRefresh = null;
    let _activeFile = null;
    const _collapsed = new Set();
    let _firstRender = true;
    let _dirtyFile = null;

    function setDirty(path) {
        _dirtyFile = path;
        const fileEl = document.querySelector(`.file-item[data-path="${path.replace(/"/g, "\\\"")}"]`);
        if (fileEl) fileEl.classList.add("dirty");
    }

    function setClean(path) {
        _dirtyFile = null;
        document.querySelectorAll(".file-item.dirty").forEach(el => el.classList.remove("dirty"));
    }

    function isDirty() {
        return _dirtyFile !== null;
    }

    function init(onFileSelect, onRefresh) {
        _onFileSelect = onFileSelect;
        _onRefresh = onRefresh;
    }

    /**
     * Natural sort: numbers first (numerically), then letters (case-insensitive).
     */
    function _naturalSortKey(name) {
        const parts = name.split(/(\d+)/);
        return parts.map(p => {
            if (/^\d+$/.test(p)) return [0, parseInt(p, 10)];
            return [1, p.toLowerCase()];
        });
    }

    /**
     * Collect all folder paths from tree (for collapsing everything initially).
     */
    function _collectFolders(node) {
        const folders = [];
        for (const child of node.children) {
            folders.push(child.path);
            folders.push(..._collectFolders(child));
        }
        return folders;
    }

    function render(tree) {
        window._currentTree = tree;

        // On first render, mark all folders as collapsed by default
        if (_firstRender) {
            _firstRender = false;
            for (const p of _collectFolders(tree)) {
                _collapsed.add(p);
            }
        }

        const container = document.getElementById("file-tree");
        container.innerHTML = "";
        buildTree(container, tree, 0);
        updateFooter(tree.word_count);
    }

    function buildTree(container, node, depth) {
        const sortedFolders = [...node.children].sort((a, b) => {
            const ka = _naturalSortKey(a.name);
            const kb = _naturalSortKey(b.name);
            return ka < kb ? -1 : ka > kb ? 1 : 0;
        });

        const sortedFiles = [...node.files].sort((a, b) => {
            const ka = _naturalSortKey(a.name);
            const kb = _naturalSortKey(b.name);
            return ka < kb ? -1 : ka > kb ? 1 : 0;
        });

        // Folders first
        for (const folder of sortedFolders) {
            const header = document.createElement("div");
            header.className = "folder-item";
            header.style.paddingLeft = (16 + depth * 16) + "px";

            const isCollapsed = _collapsed.has(folder.path);
            const arrowRotation = isCollapsed ? 0 : 90;

            header.innerHTML = `
                <span class="folder-name">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"
                         style="display: inline-block; transform: rotate(${arrowRotation}deg);">
                        <path d="M6 4l4 4-4 4z"/>
                    </svg>
                    <span class="folder-label">${escapeHtml(folder.name)}</span>
                </span>
                <span class="folder-count">${formatWordCount(folder.word_count)}</span>
                <button class="folder-new-btn" title="New file" data-folder="${escapeHtml(folder.path)}">+</button>
            `;

            // Drag & drop target
            header.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                header.classList.add("drag-over");
            });
            header.addEventListener("dragleave", () => {
                header.classList.remove("drag-over");
            });
            header.addEventListener("drop", (e) => {
                e.preventDefault();
                header.classList.remove("drag-over");
                const sourcePath = e.dataTransfer.getData("text/plain");
                if (!sourcePath) return;
                if (folderPathForFile(sourcePath) !== folder.path) {
                    handleMoveFile(sourcePath, folder.path);
                }
            });

            // Click: folder toggle
            header.addEventListener("click", (e) => {
                if (e.target.classList.contains("folder-new-btn")) {
                    e.stopPropagation();
                    handleNewFile(e.target.dataset.folder);
                    return;
                }
                if (_collapsed.has(folder.path)) {
                    _collapsed.delete(folder.path);
                } else {
                    _collapsed.add(folder.path);
                }
                render(window._currentTree);
            });
            container.appendChild(header);

            // Children
            if (!isCollapsed) {
                const childrenDiv = document.createElement("div");
                childrenDiv.className = "folder-children";
                buildTree(childrenDiv, folder, depth);
                container.appendChild(childrenDiv);
            }
        }

        // Then files
        for (const file of sortedFiles) {
            container.appendChild(createFileNode(file, depth));
        }
    }

    function createFileNode(file, _depth) {
        const el = document.createElement("div");
        el.className = "file-item" + (file.path === _activeFile ? " active" : "");
        el.setAttribute("draggable", "true");
        el.setAttribute("data-path", file.path);

        const displayName = file.display_name || file.name.replace(/\.md$/i, "");

        el.innerHTML = `
            <span class="file-name" title="${escapeHtml(file.path)}">
                ${escapeHtml(displayName)}
            </span>
            <span class="file-count">${formatWordCount(file.word_count)}</span>
        `;

        el.addEventListener("click", () => {
            _activeFile = file.path;
            if (_onFileSelect) _onFileSelect(file);
        });

        // Drag start
        el.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", file.path);
            e.dataTransfer.effectAllowed = "move";
            el.classList.add("dragging");
        });

        el.addEventListener("dragend", () => {
            el.classList.remove("dragging");
            document.querySelectorAll(".file-item.drag-over, .folder-item.drag-over")
                .forEach(el => el.classList.remove("drag-over"));
        });

        // Drop: move dragged file into this file's folder
        el.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            el.classList.add("drag-over");
        });

        el.addEventListener("dragleave", () => {
            el.classList.remove("drag-over");
        });

        el.addEventListener("drop", (e) => {
            e.preventDefault();
            el.classList.remove("drag-over");
            const sourcePath = e.dataTransfer.getData("text/plain");
            if (!sourcePath || sourcePath === file.path) return;

            const sourceDir = folderPathForFile(sourcePath);
            const targetDir = folderPathForFile(file.path);

            if (sourceDir !== targetDir) {
                handleMoveFile(sourcePath, targetDir);
            }
        });

        return el;
    }

    function folderPathForFile(filePath) {
        const slashIdx = filePath.lastIndexOf("/");
        return slashIdx >= 0 ? filePath.substring(0, slashIdx) : ".";
    }

    async function handleNewFile(folderPath) {
        let folderLabel = folderPath;
        if (window._currentTree) {
            function findName(node, path) {
                if (node.path === path) return node.name;
                for (const child of node.children) {
                    const found = findName(child, path);
                    if (found) return found;
                }
                return null;
            }
            folderLabel = findName(window._currentTree, folderPath) || folderPath;
        }

        const filename = prompt(`New file name (in ${folderLabel}):`, "Untitled");
        if (!filename || !filename.trim()) return;

        try {
            const result = await api("/file/create", {
                method: "POST",
                body: JSON.stringify({ folder_path: folderPath, filename: filename.trim() }),
            });
            _activeFile = result.path;
            if (_onRefresh) _onRefresh();
        } catch (e) {
            alert("Failed to create file: " + e.message);
        }
    }

    async function handleMoveFile(sourcePath, targetFolder) {
        try {
            const result = await api("/file/move", {
                method: "POST",
                body: JSON.stringify({ source_path: sourcePath, target_folder: targetFolder }),
            });
            if (_activeFile === sourcePath) {
                _activeFile = result.path;
            }
            if (_onRefresh) _onRefresh();
        } catch (e) {
            alert("Failed to move file: " + e.message);
        }
    }

    function setActive(path) {
        _activeFile = path;
    }

    function updateFooter(totalWords) {
        // const countEl = document.getElementById("footer-word-count");
        // if (countEl) {
        //     countEl.textContent = "Total: " + formatWordCount(totalWords);
        // }
    }

    return { init, render, setActive, setDirty, setClean, isDirty };
})();
