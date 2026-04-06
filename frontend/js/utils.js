/**
 * Writing Buddy — Utility functions
 */

/**
 * Word count: split on whitespace, empty-safe.
 */
function countWords(text) {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).length;
}

/**
 * Format a word count for display (e.g. "1,234 words").
 */
function formatWordCount(count) {
    return count.toLocaleString() + (count === 1 ? " word" : " words");
}

/**
 * Fetch wrapper with error handling.
 */
async function api(url, options = {}) {
    const resp = await fetch("/api" + url, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `API ${resp.status}: ${resp.statusText}`);
    }
    return resp.json();
}

/**
 * Show an element by removing the `hidden` class.
 */
function show(el) {
    el.classList.remove("hidden");
}

/**
 * Hide an element by adding the `hidden` class.
 */
function hide(el) {
    el.classList.add("hidden");
}

/**
 * Escape HTML for safe text insertion.
 */
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
