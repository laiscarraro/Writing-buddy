/**
 * Writing Buddy — App Initialization
 */

const App = (() => {
    const vaultInput = document.getElementById("vault-input");
    const setupContinue = document.getElementById("setup-continue");
    const vaultError = document.getElementById("vault-error");
    const setupScreen = document.getElementById("setup-screen");
    const appEl = document.getElementById("app");

    let _initialized = false;

    async function boot() {
        try {
            const config = await api("/config", { method: "GET" });
            if (config.configured) {
                showApp();
                return;
            }
        } catch (e) {
            console.error("Cannot reach API:", e);
        }

        show(setupScreen);
        hide(appEl);

        vaultInput.addEventListener("input", () => {
            setupContinue.disabled = vaultInput.value.trim().length === 0;
        });

        vaultInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !setupContinue.disabled) {
                setupContinue.click();
            }
        });

        setupContinue.addEventListener("click", handleSetup);
    }

    async function handleSetup() {
        const path = vaultInput.value.trim();
        hideError();
        setupContinue.disabled = true;
        setupContinue.textContent = "Validating...";

        try {
            await api("/config/vault", {
                method: "POST",
                body: JSON.stringify({ vault_path: path }),
            });
            hide(setupScreen);
            showApp();
        } catch (e) {
            showError(e.message);
            setupContinue.disabled = false;
        }
        setupContinue.textContent = "Continue";
    }

    function showApp() {
        hide(setupScreen);
        show(appEl);

        if (_initialized) return;
        _initialized = true;

        Editor.init(handleSave);
        Sidebar.init(handleFileSelect, handleRefresh);
        SettingsModal.init(handleRefresh);

        handleRefresh();

        // Delete button
        const deleteBtn = document.getElementById("delete-btn");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", handleDelete);
        }

        // Ctrl+S / Cmd+S to save
        document.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                Editor.save();
            }
        });
    }

    async function handleFileSelect(file) {
        try {
            const data = await api("/file/" + encodeURIComponent(file.path), { method: "GET" });
            const chapters = data.chapters && data.chapters.length > 0
                ? data.chapters.map(ch => ({ title: ch.title, scenes: ch.scenes, word_count: ch.word_count }))
                : [{ title: "", scenes: [data.content], word_count: countWords(data.content) }];
            Editor.loadFile(file.path, data.content, chapters);

            // Update active highlight in sidebar
            const container = document.getElementById("file-tree");
            container.querySelectorAll(".file-item").forEach(el => {
                el.classList.toggle("active",
                    el.querySelector(`.file-name[title="${file.path}"]`) !== null
                );
            });
        } catch (e) {
            console.error("Failed to load file:", e);
            alert("Error loading file: " + e.message);
        }
    }

    async function handleSave(relPath, content) {
        if (!relPath) return;

        const statusEl = document.getElementById("save-status");
        if (statusEl) {
            statusEl.textContent = "Saving...";
            statusEl.className = "save-status";
        }

        try {
            await api("/file/" + encodeURIComponent(relPath), {
                method: "POST",
                body: JSON.stringify({ content }),
            });

            await handleRefresh();

            Sidebar.setClean(relPath);

            if (statusEl) {
                statusEl.textContent = "Saved!";
                setTimeout(() => {
                    if (statusEl) statusEl.textContent = "";
                }, 1500);
            }
        } catch (e) {
            console.error("Save failed:", e);
            if (statusEl) {
                statusEl.textContent = "Error";
                setTimeout(() => {
                    if (statusEl) statusEl.textContent = "";
                }, 2000);
            }
            alert("Save failed: " + e.message);
        }
    }

    async function handleRefresh() {
        try {
            const tree = await api("/vault/tree", { method: "GET" });
            window._currentTree = tree;
            Sidebar.render(tree);
        } catch (e) {
            console.error("Failed to load vault tree:", e);
        }
    }

    async function handleDelete() {
        const deletedPath = await Editor.deleteFile();
        if (deletedPath) {
            // Collapsed folders should be preserved since Sidebar renders from current tree
            await handleRefresh();
        }
    }

    function showError(msg) {
        vaultError.textContent = msg;
        hide(vaultError);
        void vaultError.offsetWidth;
        show(vaultError);
    }

    function hideError() {
        hide(vaultError);
    }

    window.api = api;
    window.show = show;
    window.hide = hide;
    window.countWords = countWords;
    window.formatWordCount = formatWordCount;
    window.escapeHtml = escapeHtml;

    return { boot };
})();

document.addEventListener("DOMContentLoaded", () => {
    App.boot();
});
