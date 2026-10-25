#!/usr/bin/env python3
"""Builds the two distributable flavours of PDF Explainer.

    dist/firefox/    Manifest V2 build (load with about:debugging)
    dist/chromium/   Manifest V3 build (chrome://extensions → Load unpacked)
    dist/pdf-explainer-<browser>.zip

Both packages share everything except the manifest and the background script,
so the sources stay single copy.
"""

from __future__ import annotations

import argparse
import os
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

SHARED = ["ui", "pdfjs", "popup", "icons"]

IGNORED_SUFFIXES = (".map", ".DS_Store")
IGNORED_DIRS = {"plan", "tools", "dist", "sample", ".git"}

VARIANTS = {
    "firefox": {
        "manifest": "manifest.json",
        "background_include": ["background/background.js"],
        "background_exclude": ["background/background.chromium.js"],
        "icons_include": ["icons/icon.svg", "icons/icon-light.svg"],
    },
    "chromium": {
        "manifest": "manifest.chromium.json",
        "background_include": ["background/background.chromium.js"],
        "background_exclude": ["background/background.js"],
        "icons_include": ["icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png"],
    },
}


def copy_tree(source: str, target: str) -> None:
    if not os.path.isdir(source):
        return
    os.makedirs(target, exist_ok=True)
    for name in os.listdir(source):
        if name in IGNORED_DIRS or name.endswith(IGNORED_SUFFIXES):
            continue
        src = os.path.join(source, name)
        dst = os.path.join(target, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)


def build_variant(name: str) -> str:
    variant = VARIANTS[name]
    out = os.path.join(DIST, name)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out, exist_ok=True)

    for directory in SHARED:
        copy_tree(os.path.join(ROOT, directory), os.path.join(out, directory))

    shutil.copy2(os.path.join(ROOT, variant["manifest"]), os.path.join(out, "manifest.json"))

    # Apache-2.0 requires the license (and notices) to travel with the build.
    for name_in_root in ("LICENSE", "NOTICE"):
        shutil.copy2(os.path.join(ROOT, name_in_root), os.path.join(out, name_in_root))

    # Only the background script / icons that this browser actually uses.
    background_dir = os.path.join(out, "background")
    os.makedirs(background_dir, exist_ok=True)
    for relative in variant["background_include"]:
        shutil.copy2(os.path.join(ROOT, relative), os.path.join(out, relative))

    icons_dir = os.path.join(out, "icons")
    keep = {os.path.basename(path) for path in variant["icons_include"]}
    for name_in_icons in os.listdir(icons_dir):
        if name_in_icons not in keep:
            os.remove(os.path.join(icons_dir, name_in_icons))

    print(f"  {name:9s} → {os.path.relpath(out, ROOT)}")
    return out


def zip_variant(name: str, folder: str) -> str:
    archive = os.path.join(DIST, f"pdf-explainer-{name}.zip")
    if os.path.exists(archive):
        os.remove(archive)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for root, _, files in os.walk(folder):
            for filename in files:
                path = os.path.join(root, filename)
                bundle.write(path, os.path.relpath(path, folder))
    size = os.path.getsize(archive) / (1024 * 1024)
    print(f"  {name:9s} → {os.path.relpath(archive, ROOT)} ({size:.1f} MB)")
    return archive


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        choices=sorted(VARIANTS),
        action="append",
        help="build a single target (may be repeated)",
    )
    args = parser.parse_args()

    targets = args.only or ["firefox", "chromium"]
    os.makedirs(DIST, exist_ok=True)

    print("Building:")
    for target in targets:
        folder = build_variant(target)

    print("Packaging:")
    for target in targets:
        zip_variant(target, os.path.join(DIST, target))


if __name__ == "__main__":
    main()
