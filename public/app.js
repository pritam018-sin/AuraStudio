/**
 * AURA MEDIA STUDIO - Client Application Logic
 * Supports 4K Video/MP3 Downloads, Real-Time SSE Progress & Audio Waveforms
 */

(function () {
  'use strict';

  // State
  let currentMedia = null;
  let selectedType = 'video'; // 'video' | 'audio'
  let selectedQuality = '1080p';
  let activeEventSource = null;

  // DOM Elements
  const DOM = {
    urlInput: document.getElementById('urlInput'),
    btnPaste: document.getElementById('btnPaste'),
    btnFetch: document.getElementById('btnFetch'),
    fetchSpinner: document.getElementById('fetchSpinner'),
    errorBox: document.getElementById('errorBox'),
    errorMessage: document.getElementById('errorMessage'),

    // Preview
    previewSection: document.getElementById('previewSection'),
    mediaThumb: document.getElementById('mediaThumb'),
    mediaDuration: document.getElementById('mediaDuration'),
    mediaPlatform: document.getElementById('mediaPlatform'),
    mediaTitle: document.getElementById('mediaTitle'),
    mediaUploader: document.getElementById('mediaUploader'),
    mediaViews: document.getElementById('mediaViews'),

    // Options
    tabVideo: document.getElementById('tabVideo'),
    tabAudio: document.getElementById('tabAudio'),
    qualityWrap: document.getElementById('qualityWrap'),
    qualityPills: document.querySelectorAll('.q-pill'),
    checkSubs: document.getElementById('checkSubs'),
    subsOptionWrap: document.getElementById('subsOptionWrap'),
    btnStartDownload: document.getElementById('btnStartDownload'),
    downloadBtnText: document.getElementById('downloadBtnText'),
    btnSummarize: document.getElementById('btnSummarize'),

    // Active Progress
    progressSection: document.getElementById('progressSection'),
    dlStatusText: document.getElementById('dlStatusText'),
    dlSpeed: document.getElementById('dlSpeed'),
    dlEta: document.getElementById('dlEta'),
    progressFill: document.getElementById('progressFill'),
    dlPercent: document.getElementById('dlPercent'),
    dlActions: document.getElementById('dlActions'),
    btnSaveFile: document.getElementById('btnSaveFile'),

    // History
    historyGrid: document.getElementById('historyGrid'),
    emptyHistory: document.getElementById('emptyHistory'),
    btnRefreshHistory: document.getElementById('btnRefreshHistory'),

    // Modal
    summaryModal: document.getElementById('summaryModal'),
    btnCloseSummary: document.getElementById('btnCloseSummary'),
    summaryLoading: document.getElementById('summaryLoading'),
    summaryContent: document.getElementById('summaryContent'),
    transcriptPreview: document.getElementById('transcriptPreview'),
    transcriptText: document.getElementById('transcriptText'),

    // View Switching
    navBtnStudio: document.getElementById('navBtnStudio'),
    navBtnAbout: document.getElementById('navBtnAbout'),
    viewStudio: document.getElementById('viewStudio'),
    viewAbout: document.getElementById('viewAbout'),
    btnBackToStudio: document.getElementById('btnBackToStudio')
  };

  // Initialization
  function init() {
    setupEventListeners();
    fetchHistory();
  }

  function setupEventListeners() {
    // Top Nav Tab Switching
    if (DOM.navBtnStudio) {
      DOM.navBtnStudio.addEventListener('click', () => switchMainView('studio'));
    }
    if (DOM.navBtnAbout) {
      DOM.navBtnAbout.addEventListener('click', () => switchMainView('about'));
    }
    if (DOM.btnBackToStudio) {
      DOM.btnBackToStudio.addEventListener('click', () => switchMainView('studio'));
    }

    // Paste from clipboard
    DOM.btnPaste.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          DOM.urlInput.value = text.trim();
          fetchMediaInfo();
        }
      } catch (err) {
        console.warn('Clipboard read failed:', err);
      }
    });

    // Enter in URL input
    DOM.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') fetchMediaInfo();
    });

    // Fetch button
    DOM.btnFetch.addEventListener('click', fetchMediaInfo);

    // Format Tabs (Video vs Audio)
    DOM.tabVideo.addEventListener('click', () => setFormatType('video'));
    DOM.tabAudio.addEventListener('click', () => setFormatType('audio'));

    // Quality selection
    DOM.qualityPills.forEach(pill => {
      pill.addEventListener('click', () => {
        DOM.qualityPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedQuality = pill.dataset.quality;
        updateDownloadButtonText();
      });
    });

    // Start Download
    DOM.btnStartDownload.addEventListener('click', startDownload);

    // AI Summarize
    DOM.btnSummarize.addEventListener('click', openAISummary);
    DOM.btnCloseSummary.addEventListener('click', () => {
      DOM.summaryModal.classList.remove('open');
    });

    DOM.summaryModal.addEventListener('click', (e) => {
      if (e.target === DOM.summaryModal) DOM.summaryModal.classList.remove('open');
    });

    // Refresh history
    if (DOM.btnRefreshHistory) {
      DOM.btnRefreshHistory.addEventListener('click', fetchHistory);
    }
  }

  function switchMainView(viewName) {
    if (viewName === 'about') {
      if (DOM.viewStudio) DOM.viewStudio.style.display = 'none';
      if (DOM.viewAbout) DOM.viewAbout.style.display = 'block';
      if (DOM.navBtnStudio) DOM.navBtnStudio.classList.remove('active');
      if (DOM.navBtnAbout) DOM.navBtnAbout.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      if (DOM.viewAbout) DOM.viewAbout.style.display = 'none';
      if (DOM.viewStudio) DOM.viewStudio.style.display = 'block';
      if (DOM.navBtnAbout) DOM.navBtnAbout.classList.remove('active');
      if (DOM.navBtnStudio) DOM.navBtnStudio.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Set Video vs Audio format
  function setFormatType(type) {
    selectedType = type;
    if (type === 'video') {
      DOM.tabVideo.classList.add('active');
      DOM.tabAudio.classList.remove('active');
      DOM.qualityWrap.style.display = 'block';
      DOM.subsOptionWrap.style.display = 'inline-flex';
    } else {
      DOM.tabAudio.classList.add('active');
      DOM.tabVideo.classList.remove('active');
      DOM.qualityWrap.style.display = 'none';
      DOM.subsOptionWrap.style.display = 'none';
    }
    updateDownloadButtonText();
  }

  function updateDownloadButtonText() {
    if (selectedType === 'video') {
      DOM.downloadBtnText.textContent = `Download MP4 (${selectedQuality})`;
    } else {
      DOM.downloadBtnText.textContent = `Download High Quality MP3 (320k)`;
    }
  }

  // Fetch Media Information
  async function fetchMediaInfo() {
    const url = DOM.urlInput.value.trim();
    if (!url) return;

    hideError();
    DOM.previewSection.style.display = 'none';
    DOM.btnFetch.disabled = true;
    DOM.fetchSpinner.style.display = 'inline-block';

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch media');

      currentMedia = data;
      renderPreview(data);
    } catch (err) {
      showError(err.message || 'Error communicating with downloader backend');
    } finally {
      DOM.btnFetch.disabled = false;
      DOM.fetchSpinner.style.display = 'none';
    }
  }

  function renderPreview(data) {
    DOM.mediaThumb.src = data.thumbnail;
    DOM.mediaTitle.textContent = data.title;
    DOM.mediaUploader.textContent = data.uploader;
    DOM.mediaDuration.textContent = data.durationFormatted;
    DOM.mediaPlatform.textContent = data.platform;
    DOM.mediaViews.textContent = data.viewCount ? `${Number(data.viewCount).toLocaleString()} views` : '';

    // Adjust quality pill availability
    const q4k = document.getElementById('q4k');
    const q1080 = document.getElementById('q1080');

    if (q4k) q4k.style.display = data.qualities && data.qualities['4K'] ? 'inline-block' : 'none';
    if (q1080) q1080.style.display = data.qualities && data.qualities['1080p'] ? 'inline-block' : 'inline-block';

    DOM.previewSection.style.display = 'block';
    DOM.previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateDownloadButtonText();
  }

  // Start Download & Listen to Progress
  async function startDownload() {
    if (!currentMedia) return;

    const url = currentMedia.webpageUrl || DOM.urlInput.value.trim();
    const type = selectedType;
    const quality = selectedQuality;
    const getSubtitles = DOM.checkSubs.checked;

    DOM.btnStartDownload.disabled = true;
    DOM.progressSection.style.display = 'block';
    DOM.dlActions.style.display = 'none';
    DOM.progressFill.style.width = '0%';
    DOM.dlPercent.textContent = '0%';
    DOM.dlSpeed.textContent = 'Starting...';
    DOM.dlEta.textContent = 'ETA: --:--';
    DOM.dlStatusText.textContent = `Downloading ${type === 'audio' ? 'MP3 Audio' : 'MP4 Video'}...`;

    DOM.progressSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          type,
          quality,
          getSubtitles,
          title: currentMedia.title,
          thumbnail: currentMedia.thumbnail
        })
      });

      const { taskId } = await res.json();
      subscribeToProgress(taskId);
    } catch (err) {
      showError('Failed to start download task');
      DOM.btnStartDownload.disabled = false;
    }
  }

  // Server-Sent Events (SSE) Listener
  function subscribeToProgress(taskId) {
    if (activeEventSource) activeEventSource.close();

    activeEventSource = new EventSource(`/api/progress/${taskId}`);

    activeEventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.status === 'downloading') {
        DOM.progressFill.style.width = `${data.percent}%`;
        DOM.dlPercent.textContent = `${Math.round(data.percent)}%`;
        DOM.dlSpeed.textContent = data.speed || 'Downloading';
        DOM.dlEta.textContent = data.eta ? `ETA: ${data.eta}` : '';
        DOM.dlStatusText.textContent = `Downloading ${data.percent}%`;
      } else if (data.status === 'processing') {
        DOM.progressFill.style.width = `98%`;
        DOM.dlPercent.textContent = `98%`;
        DOM.dlStatusText.textContent = `Processing & Encoding Media...`;
        DOM.dlSpeed.textContent = `FFmpeg Merger`;
        DOM.dlEta.textContent = `Almost done`;
      } else if (data.status === 'completed') {
        DOM.progressFill.style.width = `100%`;
        DOM.dlPercent.textContent = `100%`;
        DOM.dlStatusText.textContent = `Completed Successfully!`;
        DOM.dlSpeed.textContent = `Saved to Downloads`;
        DOM.dlEta.textContent = `Ready`;
        DOM.btnStartDownload.disabled = false;
        activeEventSource.close();

        // Setup Direct Device Save
        DOM.dlActions.style.display = 'flex';
        DOM.btnSaveFile.onclick = () => {
          window.saveFileToDevice(data.filename);
        };

        // Automatically trigger browser download save prompt
        window.saveFileToDevice(data.filename);

        fetchHistory();
      } else if (data.status === 'error') {
        showError(data.error || 'Download failed');
        DOM.btnStartDownload.disabled = false;
        activeEventSource.close();
      }
    };

    activeEventSource.onerror = () => {
      activeEventSource.close();
    };
  }

  // AI Video Summary
  async function openAISummary() {
    if (!currentMedia) return;
    DOM.summaryModal.classList.add('open');
    DOM.summaryLoading.style.display = 'block';
    DOM.summaryContent.innerHTML = '';
    DOM.transcriptPreview.style.display = 'none';

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: currentMedia.webpageUrl || DOM.urlInput.value })
      });
      const data = await res.json();
      DOM.summaryLoading.style.display = 'none';
      DOM.summaryContent.textContent = data.summary;

      if (data.transcript) {
        DOM.transcriptPreview.style.display = 'block';
        DOM.transcriptText.textContent = data.transcript;
      }
    } catch (err) {
      DOM.summaryLoading.style.display = 'none';
      DOM.summaryContent.textContent = 'Failed to extract video summary. Ensure the video has public captions or subtitles.';
    }
  }

  // History
  async function fetchHistory() {
    try {
      const res = await fetch('/api/history');
      const items = await res.json();

      if (!items || items.length === 0) {
        DOM.emptyHistory.style.display = 'block';
        return;
      }

      DOM.emptyHistory.style.display = 'none';
      DOM.historyGrid.innerHTML = items.map(item => `
        <div class="history-card">
          <div class="hist-thumb">
            <img src="${item.thumbnail || 'data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"%231e293b\"><rect width=\"24\" height=\"24\"/></svg>'}" alt="">
          </div>
          <div class="hist-details">
            <span class="hist-title" title="${item.title}">${item.title}</span>
            <div class="hist-meta">
              <span>${item.type.toUpperCase()} • ${item.quality}</span>
              <span>•</span>
              <span>${item.size || ''}</span>
            </div>
            <div class="hist-actions">
              <button class="hist-btn primary-save" onclick="saveFileToDevice('${item.filename}')" title="Save file to PC">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>Save</span>
              </button>
              <button class="hist-btn danger-del" onclick="deleteHistoryItem('${item.id}')" title="Remove from list (Downloaded file remains 100% safe on your device)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;display:inline-block;vertical-align:middle;margin-right:2px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span>Remove</span>
              </button>
            </div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.warn('Could not fetch history:', err);
    }
  }

  window.saveFileToDevice = function(filename) {
    if (!filename) return;
    const a = document.createElement('a');
    a.href = `/api/file/${encodeURIComponent(filename)}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  window.deleteHistoryItem = async function(id) {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      fetchHistory();
    } catch (err) {
      console.warn('Delete item failed:', err);
    }
  };

  function showError(msg) {
    DOM.errorMessage.textContent = msg;
    DOM.errorBox.style.display = 'flex';
  }

  function hideError() {
    DOM.errorBox.style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
