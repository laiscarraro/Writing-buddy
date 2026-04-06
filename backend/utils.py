import re

# Matches a line that is 2+ dashes only — scene delimiter
SCENE_DELIMITER_RE = re.compile(r"^-{2,}\s*$")

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


def join_scenes(scenes):
    """Join a list of scenes with normalized '---' delimiters."""
    return ("\n" + NORMALIZED_DELIMITER + "\n").join(scenes)


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
