# ⚡ Aura Studio - Universal 4K Media & Reel Downloader

> **Enterprise-grade, high-throughput media retrieval workstation paired with a bespoke Cyber-Aurora dark aesthetic.**  
> Designed and engineered from first principles by **Pritam Singh** (Lead Systems Architect & Product Designer).

---

## ✨ Features

- 🎬 **Adaptive 4K & Full HD Video**: Intelligent format resolution mapping supporting 4K UHD (2160p), 1440p, 1080p FHD, 720p HD, and 480p with smooth 60fps playback compatibility.
- 🎵 **Studio 320kbps MP3 Audio Stripping**: Lossless audio demuxing extracting crisp, high-fidelity MP3 streams from any video with embedded thumbnail artwork and ID3 metadata tags.
- 🌐 **Multi-Platform Universal Parser**: Single omni-search input capable of parsing YouTube, Instagram Reels, Twitter/X media, TikTok clips, Reddit videos, and SoundCloud tracks.
- ⚡ **Reactive Real-Time Telemetry (SSE)**: Frame-accurate download progress, dynamic transfer bandwidth speed (MB/s), and real-time ETA estimates powered by sub-millisecond Server-Sent Events.
- 🎨 **Cyber-Aurora Glassmorphism UI**: Tailored CSS design token system leveraging glassmorphic backdrops, ambient gradient blurs, responsive layouts, and zero heavy front-end dependencies.
- 🔒 **Zero-Ad & Client-First Privacy**: Direct client storage dispatch with zero third-party trackers, popups, or external redirect scripts. In-browser history automatically cycles after 1 hour to keep workspace pristine while preserving downloaded files on your device.

---

## 🛠️ Architecture & System Design

```
[ Client Interface ] 
        │  (URL Input & Format Selection)
        ▼
[ Node.js / Express REST API ] ───▶ [ Cryptographic Stream Manifest Parser ]
        │                                             │
        ▼                                             ▼
[ Background Child Process Supervisor ] ────▶ [ Multi-Threaded FFmpeg Muxer ]
        │                                             │
        ▼                                             ▼
[ Server-Sent Events (SSE) Telemetry ]      [ Native Browser Download Dispatch ]
```

- **Runtime**: Node.js v20+ with Express REST endpoints
- **Multiplexer**: Multi-core compiled FFmpeg stream muxer
- **Engine**: yt-dlp core stream parser
- **Telemetry**: Server-Sent Events (SSE) unidirectional streaming
- **Front-end**: Vanilla ES6+ & Cyber-Aurora Design System

---

## 🚀 Quickstart

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- Git

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/pritam018-sin/AuraStudio.git
cd AuraStudio

# 2. Install dependencies (auto-configures binaries)
npm install

# 3. Start the Studio
npm start
```

Open your browser and navigate to:
```
http://localhost:4000
```

### Windows One-Click Launcher
Double-click `start-studio.bat` to launch the server and open Aura Studio directly in your default browser.

---

## 👤 Author & Lead Architect

- **Pritam Singh** — *Lead Systems Architect & Product Designer*
- **GitHub**: [@pritam018-sin](https://github.com/pritam018-sin)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
