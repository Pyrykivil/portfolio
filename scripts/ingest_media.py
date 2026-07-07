#!/usr/bin/env python3
"""Ingest generated media clips into the portfolio site.

Downloads or copies hero/builder/closer clips into assets/video, optionally
extracts a frame sequence for the hero clip with ffmpeg, and rewrites
assets/sequence.js with the resulting frame count.

Usage:
    python scripts/ingest_media.py [--hero URL_OR_PATH] [--builder URL_OR_PATH] [--closer URL_OR_PATH]
"""

import argparse
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PORTFOLIO_ROOT = SCRIPT_DIR.parent
FFMPEG_ZIP_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

CLIP_NAMES = {"hero": "hero.mp4", "builder": "builder.mp4", "closer": "closer.mp4"}


def fail(message):
    print("ERROR: " + message, file=sys.stderr)
    sys.exit(1)


def download(url, dest):
    print("Downloading " + url + " -> " + str(dest))
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        urllib.request.urlretrieve(url, dest)
    except Exception as e:
        fail("failed to download " + url + ": " + str(e))


def ingest_clip(key, value):
    dest = PORTFOLIO_ROOT / "assets" / "video" / CLIP_NAMES[key]
    dest.parent.mkdir(parents=True, exist_ok=True)
    if value.startswith("http"):
        download(value, dest)
    else:
        src = Path(value)
        if not src.is_absolute():
            src = (Path.cwd() / src).resolve()
        if not src.exists():
            fail("local file not found: " + str(src))
        print("Copying " + str(src) + " -> " + str(dest))
        shutil.copyfile(src, dest)
    return dest


def find_ffmpeg_on_path():
    return shutil.which("ffmpeg")


def find_ffmpeg_in_tools():
    tools_dir = PORTFOLIO_ROOT / "tools"
    if not tools_dir.exists():
        return None
    for candidate in tools_dir.glob("ffmpeg*/bin/ffmpeg.exe"):
        return candidate
    return None


def bootstrap_ffmpeg():
    print("Bootstrapping ffmpeg...")
    tools_dir = PORTFOLIO_ROOT / "tools"
    tools_dir.mkdir(parents=True, exist_ok=True)
    zip_path = tools_dir / "ffmpeg-release-essentials.zip"
    download(FFMPEG_ZIP_URL, zip_path)
    print("Extracting " + str(zip_path))
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tools_dir)
    except Exception as e:
        fail("failed to extract ffmpeg zip: " + str(e))
    exe = find_ffmpeg_in_tools()
    if not exe:
        fail("ffmpeg.exe not found after extracting ffmpeg zip")
    print("ffmpeg ready at " + str(exe))
    return exe


def resolve_ffmpeg():
    exe = find_ffmpeg_on_path()
    if exe:
        print("Using ffmpeg on PATH: " + exe)
        return exe
    exe = find_ffmpeg_in_tools()
    if exe:
        print("Using ffmpeg in tools dir: " + str(exe))
        return str(exe)
    return str(bootstrap_ffmpeg())


def extract_hero_frames(ffmpeg_exe):
    hero_mp4 = PORTFOLIO_ROOT / "assets" / "video" / "hero.mp4"
    frames_dir = PORTFOLIO_ROOT / "assets" / "frames" / "hero"
    frames_dir.mkdir(parents=True, exist_ok=True)

    for old in frames_dir.glob("f_*.jpg"):
        old.unlink()

    print("Extracting frames from " + str(hero_mp4))
    cmd = [
        ffmpeg_exe, "-y",
        "-i", str(hero_mp4),
        "-vf", "fps=30,scale=1440:-2",
        "-q:v", "4",
        str(frames_dir / "f_%04d.jpg")
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        fail("ffmpeg frame extraction failed:\n" + result.stderr)

    return frames_dir


def write_sequence_js(frame_count):
    sequence_path = PORTFOLIO_ROOT / "assets" / "sequence.js"
    content = (
        "/* Media manifest. Updated automatically after frame extraction.\n"
        "   frames: 0 keeps the site in fallback mode (animated teal void). */\n"
        "window.PORTFOLIO_MEDIA = {\n"
        "  hero: { frames: " + str(frame_count) + ", base: \"assets/frames/hero/f_\", pad: 4, ext: \".jpg\" }\n"
        "};\n"
    )
    sequence_path.write_text(content, encoding="utf-8")
    return sequence_path


def dir_size_mb(directory):
    total = sum(f.stat().st_size for f in directory.glob("**/*") if f.is_file())
    return total / (1024 * 1024)


def main():
    parser = argparse.ArgumentParser(description="Ingest generated media clips into the portfolio site.")
    parser.add_argument("--hero", help="URL or local path to the hero clip")
    parser.add_argument("--builder", help="URL or local path to the builder clip")
    parser.add_argument("--closer", help="URL or local path to the closer clip")
    args = parser.parse_args()

    written = []

    if args.builder:
        written.append(ingest_clip("builder", args.builder))
    if args.closer:
        written.append(ingest_clip("closer", args.closer))

    frame_count = None
    frames_dir = None
    if args.hero:
        written.append(ingest_clip("hero", args.hero))
        ffmpeg_exe = resolve_ffmpeg()
        frames_dir = extract_hero_frames(ffmpeg_exe)
        frame_count = len(sorted(frames_dir.glob("f_*.jpg")))
        write_sequence_js(frame_count)

    print("")
    print("Summary")
    print("-------")
    if written:
        print("Files written:")
        for path in written:
            print("  " + str(path))
    else:
        print("Files written: none")
    if frame_count is not None:
        print("Hero frame count: " + str(frame_count))
        print("Frames dir size: " + str(round(dir_size_mb(frames_dir), 2)) + " MB")
    else:
        print("Hero frames: not processed (no --hero given)")


if __name__ == "__main__":
    main()
