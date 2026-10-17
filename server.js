const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(path.join(__dirname, 'downloads')));

// Health check endpoint for Render / monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Explicit root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const isWin = process.platform === 'win32';
const BIN_DIR = path.join(__dirname, 'bin');
const YTDLP_NAME = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const FFMPEG_NAME = isWin ? 'ffmpeg.exe' : 'ffmpeg';
let YTDLP_PATH = path.join(BIN_DIR, YTDLP_NAME);
let FFMPEG_PATH = path.join(BIN_DIR, FFMPEG_NAME);

// Fallback to ffmpeg-static directly if available
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    FFMPEG_PATH = ffmpegStatic;
  }
} catch (e) {}

// Ensure execute permissions on Linux/Unix
function fixBinaryPermissions() {
  if (!isWin) {
    if (fs.existsSync(YTDLP_PATH)) {
      try { fs.chmodSync(YTDLP_PATH, 0o755); } catch (e) {}
    }
    if (fs.existsSync(FFMPEG_PATH)) {
      try { fs.chmodSync(FFMPEG_PATH, 0o755); } catch (e) {}
    }
  }
}
fixBinaryPermissions();

// Auto-download yt-dlp standalone if missing
async function ensureYtDlp() {
  if (fs.existsSync(YTDLP_PATH)) {
    try {
      const stats = fs.statSync(YTDLP_PATH);
      if (stats.size > 2000000) {
        fixBinaryPermissions();
        return;
      }
    } catch (e) {}
  }

  const downloadUrl = isWin
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

  console.log(`⬇️ Auto-downloading standalone yt-dlp for ${process.platform}...`);
  return new Promise((resolve) => {
    function get(targetUrl) {
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          console.warn('⚠️ yt-dlp auto-download HTTP status:', res.statusCode);
          return resolve();
        }
        const fileStream = fs.createWriteStream(YTDLP_PATH);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => {
            fixBinaryPermissions();
            console.log('✅ yt-dlp binary ready at:', YTDLP_PATH);
            resolve();
          });
        });
        fileStream.on('error', (err) => {
          console.warn('⚠️ File stream error:', err.message);
          resolve();
        });
      }).on('error', (err) => {
        console.warn('⚠️ Download request error:', err.message);
        resolve();
      });
    }
    get(downloadUrl);
  });
}
ensureYtDlp().catch(() => {});

// Diagnostic status endpoint
app.get('/api/status', (req, res) => {
  const ytdlpExists = fs.existsSync(YTDLP_PATH);
  const ffmpegExists = fs.existsSync(FFMPEG_PATH);
  let ytdlpSize = 0;
  if (ytdlpExists) {
    try { ytdlpSize = fs.statSync(YTDLP_PATH).size; } catch (e) {}
  }
  res.json({
    status: 'ok',
    platform: process.platform,
    ytdlp: { exists: ytdlpExists, path: YTDLP_PATH, size: ytdlpSize },
    ffmpeg: { exists: ffmpegExists, path: FFMPEG_PATH, dir: path.dirname(FFMPEG_PATH) }
  });
});

const FFMPEG_DIR = path.dirname(FFMPEG_PATH);
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const HISTORY_FILE = path.join(__dirname, 'downloads-history.json');

// Ensure directories exist
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));

// Active tasks for SSE
const activeTasks = new Map();

const ONE_HOUR_MS = 60 * 60 * 1000;

// Helper: load history
function getHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

// Auto-cleanup browser history entries older than 1 hour (keeps browser history clean without touching downloaded media)
function cleanupExpiredHistory() {
  const now = Date.now();
  let history = getHistory();
  let changed = false;

  const remainingHistory = [];
  for (const item of history) {
    const itemTime = item.createdAt || (item.timestamp ? new Date(item.timestamp).getTime() : 0);
    // If history item was created more than 1 hour ago, remove from history display
    if (itemTime > 0 && (now - itemTime > ONE_HOUR_MS)) {
      changed = true;
      // Downloaded media files on PC/disk are NOT deleted - only the browser history entry is removed
    } else {
      remainingHistory.push(item);
    }
  }

  if (changed) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(remainingHistory, null, 2));
  }
}

// Run history cleanup every 5 minutes and on startup
setInterval(cleanupExpiredHistory, 5 * 60 * 1000);
cleanupExpiredHistory();

// Helper: save history item
function saveHistoryItem(item) {
  item.createdAt = item.createdAt || Date.now();
  const history = getHistory();
  history.unshift(item);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 100), null, 2));
}

// 1. Fetch Metadata / Info
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  await ensureYtDlp();

  const args = [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--extractor-args', 'youtube:player_client=android,web',
    '--ffmpeg-location', FFMPEG_DIR,
    url
  ];

  const proc = spawn(YTDLP_PATH, args);
  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  proc.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  proc.on('error', (err) => {
    console.error('yt-dlp spawn error:', err);
    return res.status(500).json({ error: `Downloader process error: ${err.message}` });
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error('yt-dlp error:', stderr);
      return res.status(500).json({
        error: 'Failed to extract video info. Verify the URL is valid and public.',
        details: stderr ? stderr.slice(-300).trim() : 'Exited with code ' + code
      });
    }

    try {
      const data = JSON.parse(stdout);

      // Determine available qualities
      const formats = data.formats || [];
      const has4K = formats.some(f => f.height >= 2160);
      const has1440p = formats.some(f => f.height >= 1440);
      const has1080p = formats.some(f => f.height >= 1080);
      const has720p = formats.some(f => f.height >= 720);

      // Subtitles check
      const subtitles = Object.keys(data.subtitles || {}).concat(Object.keys(data.automatic_captions || {}));

      res.json({
        id: data.id,
        title: data.title || 'Untitled Media',
        thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails.length ? data.thumbnails[data.thumbnails.length - 1].url : ''),
        duration: data.duration || 0,
        durationFormatted: formatDuration(data.duration || 0),
        uploader: data.uploader || data.channel || data.extractor_key || 'Creator',
        viewCount: data.view_count || null,
        platform: data.extractor_key || 'Web',
        webpageUrl: data.webpage_url || url,
        description: data.description ? data.description.slice(0, 400) : '',
        qualities: {
          '4K': has4K,
          '1440p': has1440p,
          '1080p': has1080p,
          '720p': has720p,
          '480p': true,
          'mp3': true
        },
        hasSubtitles: subtitles.length > 0,
        subtitleLanguages: subtitles.slice(0, 10)
      });
    } catch (err) {
      console.error('JSON parse error:', err);
      res.status(500).json({ error: 'Failed to parse metadata from extractor' });
    }
  });
});

// 2. Start Download
app.post('/api/download', (req, res) => {
  const { url, type, quality, getSubtitles } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  activeTasks.set(taskId, {
    percent: 0,
    speed: '0 KiB/s',
    eta: '--:--',
    status: 'starting',
    filename: '',
    filePath: '',
    error: null,
    clients: []
  });

  const outputTemplate = path.join(DOWNLOADS_DIR, '%(title).100s-%(id)s.%(ext)s');

  let args = [
    '--newline',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--no-abort-on-error',
    '--ffmpeg-location', FFMPEG_DIR,
    '--extractor-args', 'youtube:player_client=android,ios,mweb,web',
    '-o', outputTemplate
  ];

  if (type === 'audio') {
    args.push(
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--embed-thumbnail',
      '--embed-metadata'
    );
  } else {
    // Video format selection with resilient fallbacks
    let formatArg = 'bestvideo+bestaudio/best';
    if (quality === '4K') formatArg = 'bestvideo[height<=2160]+bestaudio/best[height<=2160]/bestvideo+bestaudio/best';
    else if (quality === '1440p') formatArg = 'bestvideo[height<=1440]+bestaudio/best[height<=1440]/bestvideo+bestaudio/best';
    else if (quality === '1080p') formatArg = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best';
    else if (quality === '720p') formatArg = 'bestvideo[height<=720]+bestaudio/best[height<=720]/bestvideo+bestaudio/best';
    else if (quality === '480p') formatArg = 'bestvideo[height<=480]+bestaudio/best[height<=480]/bestvideo+bestaudio/best';

    args.push(
      '-f', formatArg,
      '--merge-output-format', 'mp4',
      '--embed-thumbnail',
      '--embed-metadata'
    );
  }

  if (getSubtitles) {
    args.push('--write-subs', '--sub-lang', 'en,hi', '--embed-subs');
  }

  args.push(url);

  console.log('Running yt-dlp:', args.join(' '));
  const proc = spawn(YTDLP_PATH, args);

  proc.on('error', (err) => {
    console.error('yt-dlp download spawn error:', err);
    const task = activeTasks.get(taskId);
    if (task) {
      task.status = 'error';
      task.error = `Downloader process error: ${err.message}`;
      broadcastProgress(taskId, task);
    }
  });

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const task = activeTasks.get(taskId);
    if (!task) return;

    // Parse download percentage: [download]  45.2% of 25.10MiB at 4.50MiB/s ETA 00:03
    const match = text.match(/\[download\]\s+([\d\.]+)%\s+of\s+([~]?[\d\.]+\w+)\s+at\s+([\d\.]+\w+\/s)\s+ETA\s+([\d:]+)/);
    if (match) {
      task.percent = parseFloat(match[1]);
      task.totalSize = match[2];
      task.speed = match[3];
      task.eta = match[4];
      task.status = 'downloading';
      broadcastProgress(taskId, task);
    } else if (text.includes('[Merger]') || text.includes('[ExtractAudio]')) {
      task.status = 'processing';
      task.percent = 98;
      broadcastProgress(taskId, task);
    } else if (text.includes('[download] Destination:')) {
      const fn = text.split('[download] Destination:')[1].trim();
      task.filename = path.basename(fn);
      task.filePath = fn;
    }
  });

  proc.stderr.on('data', (chunk) => {
    console.warn('yt-dlp stderr:', chunk.toString());
  });

  proc.on('close', (code) => {
    const task = activeTasks.get(taskId);
    if (!task) return;

    if (code === 0) {
      task.status = 'completed';
      task.percent = 100;

      // Find the created file in downloads directory if not captured
      let finalFilename = task.filename;
      if (!finalFilename || !fs.existsSync(path.join(DOWNLOADS_DIR, finalFilename))) {
        const files = fs.readdirSync(DOWNLOADS_DIR).map(f => ({
          name: f,
          time: fs.statSync(path.join(DOWNLOADS_DIR, f)).mtime.getTime()
        })).sort((a, b) => b.time - a.time);
        if (files.length > 0) {
          finalFilename = files[0].name;
        }
      }

      task.filename = finalFilename;
      task.fileUrl = `/files/${encodeURIComponent(finalFilename)}`;
      task.isAudio = type === 'audio';

      saveHistoryItem({
        id: taskId,
        filename: finalFilename,
        title: req.body.title || finalFilename,
        type: type || 'video',
        quality: quality || 'Best',
        thumbnail: req.body.thumbnail || '',
        url: req.body.url,
        fileUrl: task.fileUrl,
        size: task.totalSize || 'N/A',
        timestamp: new Date().toLocaleString()
      });

      broadcastProgress(taskId, task);
    } else {
      task.status = 'error';
      task.error = 'Download failed. Check the video link or restrictions.';
      broadcastProgress(taskId, task);
    }
  });

  res.json({ taskId });
});

// 3. SSE Stream for Real-time Progress
app.get('/api/progress/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = activeTasks.get(taskId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!task) {
    res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`);
    return res.end();
  }

  task.clients.push(res);
  res.write(`data: ${JSON.stringify(cleanTaskData(task))}\n\n`);

  req.on('close', () => {
    task.clients = task.clients.filter(c => c !== res);
  });
});

function broadcastProgress(taskId, task) {
  const payload = `data: ${JSON.stringify(cleanTaskData(task))}\n\n`;
  task.clients.forEach(client => client.write(payload));
  if (task.status === 'completed' || task.status === 'error') {
    setTimeout(() => {
      task.clients.forEach(c => c.end());
      activeTasks.delete(taskId);
    }, 5000);
  }
}

function cleanTaskData(task) {
  return {
    percent: task.percent,
    speed: task.speed,
    eta: task.eta,
    status: task.status,
    filename: task.filename,
    fileUrl: task.fileUrl,
    isAudio: task.isAudio,
    error: task.error
  };
}

// 4. Download History
app.get('/api/history', (req, res) => {
  cleanupExpiredHistory();
  res.json(getHistory());
});

// Remove single item from browser history (preserves media file on device)
app.delete('/api/history/:id', (req, res) => {
  const { id } = req.params;
  let history = getHistory();
  const index = history.findIndex(h => h.id === id);

  if (index !== -1) {
    history.splice(index, 1);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  }

  res.json({ success: true });
});

// Clear all browser history entries (preserves media files on device)
app.delete('/api/history', (req, res) => {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
  res.json({ success: true });
});

// Direct Browser File Download (Native browser download to user's device)
app.get('/api/file/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(DOWNLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath, filename);
  } else {
    res.status(404).send('File not found');
  }
});

// Favicon handler
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public', 'logo.png')));

// 5. Open Downloads Folder in Windows Explorer
app.post('/api/open-folder', (req, res) => {
  try {
    exec(`start "" "${DOWNLOADS_DIR}"`);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: true });
  }
});

// 6. Open specific file with default player
app.post('/api/open-file', (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Filename is required' });
  const fullPath = path.join(DOWNLOADS_DIR, filename);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

  try {
    exec(`start "" "${fullPath}"`);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: true });
  }
});

// 7. Video AI Summary / Transcript Extraction
app.post('/api/summarize', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  // Extract subtitles without downloading video
  const subTempDir = path.join(__dirname, 'downloads', 'sub_temp_' + Date.now());
  fs.mkdirSync(subTempDir, { recursive: true });

  const args = [
    '--skip-download',
    '--write-auto-sub',
    '--write-sub',
    '--sub-lang', 'en,hi',
    '--sub-format', 'vtt',
    '--no-warnings',
    '--no-check-certificates',
    '--extractor-args', 'youtube:player_client=android,ios,mweb,web',
    '-o', path.join(subTempDir, 'sub.%(ext)s'),
    url
  ];

  const proc = spawn(YTDLP_PATH, args);

  proc.on('error', (err) => {
    console.error('yt-dlp summarize spawn error:', err);
    return res.status(500).json({ error: `Downloader process error: ${err.message}` });
  });

  proc.on('close', (code) => {
    try {
      const files = fs.readdirSync(subTempDir);
      const vttFile = files.find(f => f.endsWith('.vtt') || f.endsWith('.srt'));

      let transcript = '';
      if (vttFile) {
        const rawContent = fs.readFileSync(path.join(subTempDir, vttFile), 'utf-8');
        // Clean VTT timecodes and HTML tags
        transcript = rawContent
          .replace(/WEBVTT[\s\S]*?\n\n/, '')
          .replace(/-->.*?\n/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\d{2}:\d{2}:\d{2}\.\d{3}/g, '')
          .replace(/\n+/g, ' ')
          .slice(0, 4000);
      }

      // Cleanup temp folder
      fs.rmSync(subTempDir, { recursive: true, force: true });

      if (!transcript) {
        return res.json({
          summary: 'No spoken transcript or captions available for this media. You can still download the full high-definition video or MP3 audio directly.',
          transcript: ''
        });
      }

      // Generate structured breakdown
      const summary = generateQuickSummary(transcript);
      res.json({ summary, transcript: transcript.slice(0, 1500) + '...' });
    } catch (err) {
      console.error('Summary error:', err);
      res.status(500).json({ error: 'Could not extract transcript' });
    }
  });
});

function generateQuickSummary(text) {
  // Simple heuristic sentence extraction for key insights
  const sentences = text.split(/(?<=[.?!])\s+/).filter(s => s.length > 25);
  const highlights = sentences.slice(0, Math.min(5, sentences.length));

  return highlights.length > 0
    ? highlights.map((h, i) => `• ${h.trim()}`).join('\n\n')
    : 'Video transcript extracted successfully. Contains discussion of the video topics above.';
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0) {
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n============================================================`);
  console.log(`  ⚡ AURA MEDIA STUDIO - SERVER RUNNING`);
  console.log(`  🌐 Bound to: http://0.0.0.0:${PORT}`);
  console.log(`  📂 Environment: ${process.env.NODE_ENV || 'production'} (${process.platform})`);
  console.log(`  📂 Downloads:   ${DOWNLOADS_DIR}`);
  console.log(`============================================================\n`);
});
