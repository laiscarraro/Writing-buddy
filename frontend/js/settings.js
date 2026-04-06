/**
 * Writing Buddy — Settings Modal (Change Vault)
 */

const SettingsModal = (() => {
    let _onRefresh = null;

    function init(onRefresh) {
        _onRefresh = onRefresh;

        const settingsBtn = document.getElementById("settings-btn");
        const overlay = document.getElementById("settings-modal-overlay");
        const closeBtn = document.getElementById("modal-close-btn");
        const cancelBtn = document.getElementById("modal-cancel-btn");
        const saveBtn = document.getElementById("modal-save-btn");
        const currentPathInput = document.getElementById("current-vault-path");
        const newPathInput = document.getElementById("new-vault-path");
        const errorEl = document.getElementById("settings-error");

        settingsBtn.addEventListener("click", () => open(currentPathInput, newPathInput, errorEl, saveBtn));
        closeBtn.addEventListener("click", close);
        cancelBtn.addEventListener("click", close);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close();
        });
        saveBtn.addEventListener("click", () => handleSave(currentPathInput, newPathInput, errorEl, saveBtn));

        newPathInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !saveBtn.disabled) {
                handleSave(currentPathInput, newPathInput, errorEl, saveBtn);
            }
        });
        newPathInput.addEventListener("input", () => {
            saveBtn.disabled = newPathInput.value.trim().length === 0;
        });
    }

    function open(currentPathInput, newPathInput, errorEl, saveBtn) {
        // Fetch current vault config
        api("/config", { method: "GET" }).then(config => {
            currentPathInput.value = config.vault_path || "Not set";
        }).catch(() => {
            currentPathInput.value = "Unknown";
        });

        newPathInput.value = "";
        hideError(errorEl);
        saveBtn.disabled = true;
        saveBtn.textContent = "Change vault";
        document.getElementById("settings-modal-overlay").classList.remove("hidden");
        newPathInput.focus();
    }

    function close() {
        document.getElementById("settings-modal-overlay").classList.add("hidden");
    }

    function hideError(errorEl) {
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
    }

    function showError(errorEl, msg) {
        errorEl.textContent = msg;
        hideError(errorEl);
        void errorEl.offsetWidth;
        errorEl.classList.remove("hidden");
    }

    async function handleSave(currentPathInput, newPathInput, errorEl, saveBtn) {
        const path = newPathInput.value.trim();
        if (!path) return;

        hideError(errorEl);
        saveBtn.disabled = true;
        saveBtn.textContent = "Validating...";

        try {
            await api("/config/vault", {
                method: "POST",
                body: JSON.stringify({ vault_path: path }),
            });
            close();
            if (_onRefresh) _onRefresh();
        } catch (e) {
            showError(errorEl, e.message);
            saveBtn.disabled = newPathInput.value.trim().length === 0;
            saveBtn.textContent = "Change vault";
        }
    }

    return { init };
})();
