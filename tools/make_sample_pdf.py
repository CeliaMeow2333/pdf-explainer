#!/usr/bin/env python3
"""Generates sample/sample.pdf — a tiny, text-only PDF used for manual testing."""

import io
import os

PAGE_WIDTH = 595
PAGE_HEIGHT = 842
MARGIN = 64


def escape(text):
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def wrap(text, width, size):
    """Very rough monospace-ish wrap: enough for a test document."""
    max_chars = int(width / (size * 0.5))
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


PAGE_ONE = [
    ("title", "PDF Explainer"),
    ("subtitle", "A sample document for testing translation and AI explanations"),
    ("heading", "1  Scope"),
    (
        "body",
        "This document describes the reference behaviour of the PDF Explainer "
        "extension. It exists only so that the viewer, the translation popup and "
        "the AI sidebar can be exercised with real, selectable text.",
    ),
    (
        "body",
        "The extension opens every PDF in a bundled PDF.js viewer. When the "
        "reader selects a passage and presses the configured shortcut, the "
        "selection is either translated by Google Translate or handed to a large "
        "language model for an explanation.",
    ),
    ("heading", "2  Normative references"),
    (
        "body",
        "Les documents suivants sont indispensables pour l'application du présent "
        "document. Pour les références datées, seule l'édition citée s'applique. "
        "Pour les références non datées, la dernière édition du document de "
        "référence s'applique.",
    ),
    ("heading", "3  Terms and definitions"),
    (
        "body",
        "3.1  selection — the range of text or the rectangular region of a page "
        "that the reader has highlighted before invoking an action.",
    ),
    (
        "body",
        "3.2  explanation — a short, plain-language account of what a passage "
        "means, including the sense of any specialised terminology it uses.",
    ),
]

PAGE_TWO = [
    ("heading", "4  Conformance"),
    (
        "body",
        "An implementation conforms to this document if it satisfies every "
        "requirement stated in the following clauses. Conformance is assessed "
        "against the observable behaviour of the viewer, not against its internal "
        "design.",
    ),
    (
        "body",
        "The key words \"shall\", \"should\" and \"may\" are to be interpreted as "
        "described in the editorial rules of the directives. A conforming "
        "implementation shall not alter the contents of the document it renders.",
    ),
    ("heading", "5  Environment"),
    (
        "body",
        "The viewer is expected to run in a browser tab with a viewport of at "
        "least 1024 CSS pixels. Network access is required for the translation "
        "service and for the language model endpoint.",
    ),
    (
        "body",
        "All rendering happens locally. The only data leaving the machine are the "
        "passages or regions that the reader explicitly submits, together with "
        "the configured credentials of the language model provider.",
    ),
    ("heading", "6  Language"),
    (
        "body",
        "Documents written in a language the reader does not speak are the "
        "primary use case. Selecting a sentence and pressing the translation "
        "shortcut shows a compact card with the translated text; pressing the "
        "explanation shortcut instead opens a sidebar that discusses the passage.",
    ),
]


def render_page(blocks):
    ops = ["BT"]
    y = PAGE_HEIGHT - MARGIN
    for kind, text in blocks:
        if kind == "title":
            size, font, leading = 26, "/F2", 34
        elif kind == "subtitle":
            size, font, leading = 12, "/F1", 20
        elif kind == "heading":
            size, font, leading = 15, "/F2", 24
        else:
            size, font, leading = 11, "/F1", 16

        y -= leading
        for line in wrap(text, PAGE_WIDTH - 2 * MARGIN, size):
            if y < MARGIN:
                break
            ops.append(f"/{font} {size} Tf 1 0 0 1 {MARGIN} {y} Tm ({escape(line)}) Tj")
            y -= leading
        y -= 6
    ops.append("ET")
    return "\n".join(ops)


def build(path):
    pages = [render_page(PAGE_ONE), render_page(PAGE_TWO)]
    objects = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: b"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        5: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        6: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    }
    for index, content in enumerate(pages):
        page_id = 3 + index
        content_id = 7 + index
        stream = content.encode("cp1252")
        objects[page_id] = (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "
            + str(PAGE_WIDTH).encode()
            + b" "
            + str(PAGE_HEIGHT).encode()
            + b"] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents "
            + str(content_id).encode()
            + b" 0 R >>"
        )
        objects[content_id] = (
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        )

    buffer = io.BytesIO()
    buffer.write(b"%PDF-1.4\n")
    offsets = {}
    for object_id in sorted(objects):
        offsets[object_id] = buffer.tell()
        buffer.write(f"{object_id} 0 obj\n".encode())
        buffer.write(objects[object_id])
        buffer.write(b"\nendobj\n")

    xref_position = buffer.tell()
    count = max(objects) + 1
    buffer.write(f"xref\n0 {count}\n".encode())
    buffer.write(b"0000000000 65535 f \n")
    for object_id in range(1, count):
        offset = offsets.get(object_id, 0)
        buffer.write(f"{offset:010d} 00000 n \n".encode())
    buffer.write(
        f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref_position}\n%%EOF\n".encode()
    )

    with open(path, "wb") as handle:
        handle.write(buffer.getvalue())
    print(f"wrote {path} ({len(buffer.getvalue())} bytes)")


if __name__ == "__main__":
    target = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample", "sample.pdf")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    build(target)
