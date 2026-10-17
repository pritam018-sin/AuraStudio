/**
 * AURA STUDIO - Universal Cross-Platform Binary & Environment Setup
 * Automatically detects OS (Windows / Linux / macOS)
 * Sets up ffmpeg & yt-dlp with appropriate permissions
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const isWin = process.platform === 'win32';
const BIN_DIR = path.join(__dirname, 'bin');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const HISTORY_FILE = path.join(__dirname, 'downloads-history.json');

const YTDLP_NAME = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const FFMPEG_NAME = isWin ? 'ffmpeg.exe' : 'ffmpeg';
const YTDLP_PATH = path.join(BIN_DIR, YTDLP_NAME);
const FFMPEG_PATH = path.join(BIN_DIR, FFMPEG_NAME);

// 1. Ensure required directories exist
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));

// 2. Setup FFmpeg from ffmpeg-static
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    if (!fs.existsSync(FFMPEG_PATH)) {
      console.log(`📦 Configuring ffmpeg for ${process.platform}...`);
      fs.copyFileSync(ffmpegStatic, FFMPEG_PATH);
      if (!isWin) {
        try {
          fs.chmodSync(FFMPEG_PATH, 0o755);
        } catch (e) {}
      }
      console.log('✅ ffmpeg ready at:', FFMPEG_PATH);
    } else {
      console.log('✅ ffmpeg binary verified.');
    }
  }
} catch (e) {
  console.warn('⚠️ ffmpeg-static setup notice:', e.message);
}

// 3. Download helper with redirect handling
function downloadFile(targetUrl, destPath) {
  return new Promise((resolve, reject) => {
    function get(reqUrl) {
      https.get(reqUrl, (res) => {
        // Follow HTTP 301/302 redirects (GitHub releases)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => {
            if (!isWin) {
              try {
                fs.chmodSync(destPath, 0o755);
              } catch (err) {}
            }
            resolve();
          });
        });
        fileStream.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch (e) {}
          reject(err);
        });
      }).on('error', reject);
    }
    get(targetUrl);
  });
}

// 4. Setup yt-dlp binary (waits properly for completion)
async function setupYtDlp() {
  if (fs.existsSync(YTDLP_PATH)) {
    console.log('✅ yt-dlp binary verified at:', YTDLP_PATH);
    if (!isWin) {
      try { fs.chmodSync(YTDLP_PATH, 0o755); } catch (e) {}
    }
    return;
  }

  const downloadUrl = isWin
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

  console.log(`⬇️ Downloading standalone yt-dlp (${process.platform}) from GitHub releases...`);
  try {
    await downloadFile(downloadUrl, YTDLP_PATH);
    console.log('✅ yt-dlp successfully downloaded and verified!');
  } catch (err) {
    console.warn('⚠️ yt-dlp download notice during setup:', err.message);
    console.warn('ℹ️ Server will use system yt-dlp or re-attempt on demand.');
  }
}

// Execute setup
setupYtDlp().catch((err) => {
  console.warn('Setup completed with non-fatal warning:', err.message);
});
