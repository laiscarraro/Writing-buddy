import re

# Matches a line that is 2+ dashes only — scene delimiter
SCENE_DELIMITER_RE = re.compile(r"^-{2,}\s*$")

# Matches a level-1 heading — chapter delimiter
CHAPTER_HEADING_RE = re.compile(r"^#\s+(.*)")

# Normalized delimiter used on save
NORMALIZED_DELIMITER = "---"


def split_scenes(content):
    """Split file content into scenes on any line matching ^-{2,}$.

    Returns a list of scene strings (the content between delimiters).
    A file with no delimiters returns a single-element list [content].
    """
    lines = content.split("\n")
    scenes = []
    current = []

    for line in lines:
        if SCENE_DELIMITER_RE.match(line):
            scenes.append("\n".join(current))
            current = []
        else:
            current.append(line)

    # Append remaining content as the last scene
    scenes.append("\n".join(current))

    # Handle edge case: file ending with a delimiter produces an empty trailing scene
    if scenes and scenes[-1] == "" and len(scenes) > 1:
        scenes.pop()

    return scenes


def _split_scenes_in_lines(lines, start, end):
    """Split a slice of lines into scenes based on scene delimiters."""
    scenes = []
    current = []
    for i in range(start, end):
        if SCENE_DELIMITER_RE.match(lines[i]):
            scenes.append("\n".join(current))
            current = []
        else:
            current.append(lines[i])
    scenes.append("\n".join(current))
    if scenes and scenes[-1] == "" and len(scenes) > 1:
        scenes.pop()
    return scenes


def split_chapters(content):
    """Split file content into chapters based on level-1 headings (# Title).

    Returns a list of dicts:
    [
        {
            "title": str,          # Chapter heading text, or implicit chapter
            "content": str,        # Raw content of the chapter (including heading line)
            "scenes": list[str],   # Scenes within this chapter
            "word_count": int,
        },
        ...
    ]

    A file with no # heading returns one implicit chapter.
    """
    lines = content.split("\n")
    chapter_breaks = []  # indices of lines that are chapter headings

    for i, line in enumerate(lines):
        if CHAPTER_HEADING_RE.match(line):
            chapter_breaks.append(i)

    chapters = []

    if not chapter_breaks:
        # Single implicit chapter
        scenes = split_scenes(content)
        wc = sum(word_count(s) for s in scenes)
        chapters.append({
            "title": "",
            "content": content,
            "scenes": scenes,
            "word_count": wc,
        })
    else:
        for idx, start in enumerate(chapter_breaks):
            heading_match = CHAPTER_HEADING_RE.match(lines[start])
            title = heading_match.group(1) if heading_match else ""
            end = chapter_breaks[idx + 1] if idx + 1 < len(chapter_breaks) else len(lines)

            chapter_lines = lines[start:end]
            chapter_content = "\n".join(chapter_lines)
            scenes = _split_scenes_in_lines(lines, start, end)
            wc = sum(word_count(s) for s in scenes)

            chapters.append({
                "title": title,
                "content": chapter_content,
                "scenes": scenes,
                "word_count": wc,
            })

    return chapters


def join_scenes(scenes):
    """Join a list of scenes with normalized '---' delimiters."""
    return ("\n" + NORMALIZED_DELIMITER + "\n").join(scenes)


def join_chapters(chapters):
    """Join a list of chapter dicts back into raw markdown string.

    Each chapter's scenes are joined with '---', and chapters are
    separated by a blank line.
    """
    chapter_texts = []
    for ch in chapters:
        joined = join_scenes(ch["scenes"])
        chapter_texts.append(joined)
    return "\n\n".join(chapter_texts)


def word_count(text):
    """Count words in text. Splits on whitespace like standard word processors."""
    if not text or not text.strip():
        return 0
    return len(text.split())


def natural_sort_key(name):
    """Sort key that puts numbers first and sorts digit groups numerically.

    e.g. ['1.md', '10.md', 'a.md', 'b.md']
    """
    parts = re.split(r"(\d+)", name)
    result = []
    for part in parts:
        if part.isdigit():
            # Numbers sort before letters: prepend with a marker that sorts first
            result.append((0, int(part)))
        else:
            result.append((1, part.lower()))
    return result
