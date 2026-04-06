import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "writing_buddy.db")


def get_connection(db_path=None):
    path = db_path or DB_PATH
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create all tables. Phase 1 creates schema only; data comes in Phase 2+."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS story_cards (
            id INTEGER PRIMARY KEY,
            file_path TEXT NOT NULL,
            scene_index INTEGER DEFAULT -1,
            field_name TEXT NOT NULL,
            field_value TEXT,
            UNIQUE(file_path, scene_index, field_name)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS story_card_assets (
            id INTEGER PRIMARY KEY,
            story_card_id INTEGER REFERENCES story_cards(id),
            asset_type TEXT NOT NULL,
            asset_name TEXT NOT NULL,
            UNIQUE(story_card_id, asset_type, asset_name)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS writing_sessions (
            id INTEGER PRIMARY KEY,
            file_path TEXT NOT NULL,
            scene_index INTEGER,
            words_start INTEGER DEFAULT 0,
            words_end INTEGER DEFAULT 0,
            duration_sec INTEGER DEFAULT 0,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()


def get_setting(key):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else None


def set_setting(key, value):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, str(value)),
    )
    conn.commit()
    conn.close()
