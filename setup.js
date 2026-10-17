/**
 * AURA STUDIO - Automatic Binary & Environment Setup
 * Ensures ffmpeg and yt-dlp binaries are configured on install
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BIN_DIR = path.join(__dirname, 'bin');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const HISTORY_FILE = path.join(__dirname, 'downloads-history.json');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');
const FFMPEG_PATH = path.join(BIN_DIR, 'ffmpeg.exe');

// 1. Ensure required directories exist
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));

// 2. Setup FFmpeg from ffmpeg-static if needed
try {
  if (!fs.existsSync(FFMPEG_PATH)) {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      console.log('📦 Copying ffmpeg binary from ffmpeg-static...');
      fs.copyFileSync(ffmpegStatic, FFMPEG_PATH);
      console.log('✅ ffmpeg ready at:', FFMPEG_PATH);
    }
  } else {
    console.log('✅ ffmpeg binary verified.');
  }
} catch (e) {
  console.warn('⚠️ ffmpeg-static setup notice:', e.message);
}

// 3. Setup yt-dlp binary if needed
if (!fs.existsSync(YTDLP_PATH)) {
  console.log('⬇️ Downloading standalone yt-dlp.exe binary...');
  const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

  function download(targetUrl) {
    https.get(targetUrl, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location);
      }
      if (res.statusCode !== 200) {
        console.warn('⚠️ Could not auto-download yt-dlp.exe (HTTP ' + res.statusCode + '). Please place yt-dlp.exe in bin/ manually.');
        return;
      }
      const file = fs.createWriteStream(YTDLP_PATH);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('✅ yt-dlp.exe successfully downloaded and ready!');
      });
    }).on('error', (err) => {
      console.warn('⚠️ Failed to download yt-dlp.exe:', err.message);
    });
  }

  download(url);
} else {
  console.log('✅ yt-dlp binary verified.');
}
