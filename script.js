/**
 * Daily History Reels Generator
 * Main Application Script
 */

// --- Constants & Config ---
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const FPS = 30;
const DURATION_SECONDS = 15;
const PEXELS_API_URL = 'https://api.pexels.com/videos/search';
// Fallback videos if no API key
const FALLBACK_VIDEOS = [
    'https://files.vidstack.io/sprite-fight/720p.mp4', // Neutral / Abstract
    // 'https://static.videezy.com/system/resources/previews/000/004/954/original/ink_drops_02.mp4',
];

// --- Application State ---
const state = {
    selectedDate: new Date().toISOString().split('T')[0],
    apiKey: '',
    isGenerating: false,
    historyData: null,
    backgroundVideo: null,
    recordedChunks: [],
    mediaRecorder: null
};

// --- DOM Elements ---
const dom = {
    form: document.getElementById('generator-form'),
    datePicker: document.getElementById('date-picker'),
    apiKeyInput: document.getElementById('api-key-pexels'),
    canvas: document.getElementById('reel-canvas'),
    statusBox: document.getElementById('status-box'),
    statusText: document.getElementById('status-text'),
    actionButtons: document.getElementById('action-buttons'),
    btnDownload: document.getElementById('btn-download'),
    btnPreview: document.getElementById('btn-preview-play')
};

// --- Initialization ---
function init() {
    // Set default date to today
    dom.datePicker.value = state.selectedDate;

    // Set Canvas Resolution
    dom.canvas.width = CANVAS_WIDTH;
    dom.canvas.height = CANVAS_HEIGHT;

    // Draw initial empty state
    const ctx = dom.canvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#333';
    ctx.font = '50px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('Video Oluştur\'a Basın', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    // Event Listeners
    dom.form.addEventListener('submit', handleGenerate);
    dom.btnDownload.addEventListener('click', handleDownload);

    // Local Video Helper
    document.getElementById('local-video').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            prepareAssets(url).then(() => {
                // Determine duration logic if needed, or just play loop
                console.log('Local video loaded');
            });
        }
    });
}

// --- Handlers ---

async function handleGenerate(e) {
    e.preventDefault();
    if (state.isGenerating) return;

    state.selectedDate = dom.datePicker.value;
    state.apiKey = dom.apiKeyInput.value.trim();

    setLoading(true, 'Veriler çekiliyor...');

    try {
        // 1. Fetch History Data
        const fact = await fetchHistoryData(state.selectedDate);
        if (!fact) throw new Error('Tarih verisi bulunamadı.');

        // 2. Fetch Background Video (Only if we haven't uploaded one manually)
        // Check if user manually uploaded a video (we can check input value)
        const localInput = document.getElementById('local-video');
        let videoUrl = null;

        if (localInput.files.length > 0) {
            // Already loaded via change event, just ensure state is ready
            console.log('Using local video');
        } else {
            setLoading(true, 'Video hazırlanıyor...');
            videoUrl = await fetchBackgroundVideo(fact.keywords, state.apiKey);
            await prepareAssets(videoUrl);
        }

        // 4. Start Rendering / Recording Logic
        // Full video generation will require a render loop.
        startRenderLoop(fact.text);

        setLoading(false);
        enableActions();

    } catch (error) {
        console.error(error);
        alert('Hata: ' + error.message);
        setLoading(false);
    }
}

function handleDownload() {
    const stream = dom.canvas.captureStream(FPS);
    const options = { mimeType: 'video/webm; codecs=vp9' };

    // Check supported types
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn(`${options.mimeType} is not supported, trying default.`);
        delete options.mimeType;
    }

    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(stream, options);

    state.mediaRecorder.ondataavailable = handleDataAvailable;
    state.mediaRecorder.onstop = handleStop;

    setLoading(true, `Video Kaydediliyor... (0/${DURATION_SECONDS}s)`);

    state.mediaRecorder.start();

    // Stop after duration
    let secondsLeft = DURATION_SECONDS;
    const interval = setInterval(() => {
        secondsLeft--;
        dom.statusText.innerText = `Video Kaydediliyor... (${DURATION_SECONDS - secondsLeft}/${DURATION_SECONDS}s)`;

        if (secondsLeft <= 0) {
            clearInterval(interval);
            state.mediaRecorder.stop();
        }
    }, 1000);
}

function handleDataAvailable(event) {
    if (event.data.size > 0) {
        state.recordedChunks.push(event.data);
    }
}

function handleStop(event) {
    const blob = new Blob(state.recordedChunks, {
        type: 'video/webm'
    });

    // Create Download Link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style = 'display: none';
    a.href = url;
    a.download = `tarihte-bugun-reel-${state.selectedDate}.webm`;
    a.click();
    window.URL.revokeObjectURL(url);

    setLoading(false);
}

// --- Data & Content Engine ---

const TR_MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

async function fetchHistoryData(dateStr) {
    // Check for local file protocol logic
    if (window.location.protocol === 'file:') {
        console.warn('Running locally (file://), using mock data.');
        const [year, month, day] = dateStr.split('-');
        return {
            text: `TARİHTE BUGÜN (${day}.${month}.1969)\n\nİnsanlık Ay'a ilk kez ayak bastı. Apollo 11 görevi başarıyla tamamlandı. Neil Armstrong o ünlü sözü söyledi: "Benim için küçük, insanlık için büyük bir adım." (Demo Modu)`,
            keywords: 'space moon',
            year: '1969'
        };
    }

    const dateObj = new Date(dateStr);
    const day = dateObj.getDate();
    const monthIndex = dateObj.getMonth();
    const monthName = TR_MONTHS[monthIndex];

    // Wikipedia Page Title format: "21_Aralık"
    const pageTitle = `${day}_${monthName}`;

    try {
        // Fetch from Turkish Wikipedia API
        // origin=* is needed for CORS
        const url = `https://tr.wikipedia.org/w/api.php?action=parse&format=json&page=${pageTitle}&prop=text&section=1&disabletoc=1&origin=*`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data.parse || !data.parse.text) throw new Error('Wikipedia verisi alınamadı');

        const htmlContent = data.parse.text['*'];

        // Parse HTML to get list items
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const listItems = doc.querySelectorAll('li');

        if (listItems.length === 0) throw new Error('Olay bulunamadı');

        // Filter and clean items
        const validEvents = Array.from(listItems).map(li => {
            // Remove references [1], [2] etc.
            return li.innerText.replace(/\[\d+\]/g, '').trim();
        }).filter(text => {
            // Filter out short/empty lines or non-event lines
            return text.length > 20 && /^\d+/.test(text); // Starts with year usually
        });

        if (validEvents.length === 0) throw new Error('Geçerli olay yok');

        // Pick random event
        const randomEventStr = validEvents[Math.floor(Math.random() * validEvents.length)];

        // Format: "1969 - Something happened"
        // Wikipedia TR format varies: "1969 - Olay..." or "1969: Olay..."
        let year = 'Tarih';
        let description = randomEventStr;

        const separatorMatch = randomEventStr.match(/^(\d+)\s*[-–:]\s*(.*)/);
        if (separatorMatch) {
            year = separatorMatch[1];
            description = separatorMatch[2];
        }

        // Generate keywords for video search (simple heuristic)
        // Clean special chars and take first few long words
        const keywords = description.replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, '')
            .split(' ')
            .filter(w => w.length > 4)
            .slice(0, 3)
            .join(' ');

        return {
            text: `TARİHTE BUGÜN (${day} ${monthName})\n\n${description}`,
            keywords: keywords || 'history',
            year: year
        };

    } catch (err) {
        console.warn('Wikipedia API failed:', err);
        return {
            text: `TARİHTE BUGÜN (${day} ${monthName})\n\nWikipedia'dan veri alınırken bir sorun oluştu.`,
            keywords: 'abstract',
            year: '----'
        };
    }
}

async function fetchBackgroundVideo(query, apiKey) {
    if (!apiKey) {
        console.warn('No API Key, using fallback.');
        return FALLBACK_VIDEOS[0];
    }

    try {
        const response = await fetch(`${PEXELS_API_URL}?query=${query}&per_page=1&orientation=portrait&size=medium`, {
            headers: {
                Authorization: apiKey
            }
        });
        const data = await response.json();
        if (data.videos && data.videos.length > 0) {
            // Get a compatible video file (HD, mp4)
            const videoFile = data.videos[0].video_files.find(f => f.quality === 'hd' && f.file_type === 'video/mp4') || data.videos[0].video_files[0];
            return videoFile.link;
        }
    } catch (err) {
        console.error('Pexels API Error:', err);
    }

    // Return fallback if API fails or no key
    return FALLBACK_VIDEOS[0];
}

async function prepareAssets(videoUrl) {
    return new Promise((resolve, reject) => {
        // Create hidden video element if not exists
        if (!state.backgroundVideo) {
            const vid = document.createElement('video');
            vid.crossOrigin = 'anonymous'; // Important for canvas
            vid.loop = true;
            vid.muted = true;
            vid.setAttribute('playsinline', ''); // Critical for iOS/Safari
            vid.playsInline = true;
            state.backgroundVideo = vid;
        }

        const vid = state.backgroundVideo;
        vid.src = videoUrl;

        // Wait for enough data
        const onReady = () => {
            // Try to play, but don't block if it fails
            vid.play().then(() => {
                console.log('Video playing');
            }).catch(e => {
                console.warn('Autoplay prevented, will render manually:', e);
            });
            resolve();
        };

        if (vid.readyState >= 3) {
            onReady();
        } else {
            vid.oncanplay = onReady;
        }

        vid.onerror = (e) => reject('Video yüklenemedi: ' + (e.message || 'Hata'));
    });
}

// --- Rendering Engine ---

let animationFrameId;

function startRenderLoop(text) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const ctx = dom.canvas.getContext('2d');
    const vid = state.backgroundVideo;

    function draw() {
        // Draw Video
        // Relaxed check: Draw if we have data, even if technically "paused"
        if (vid && vid.readyState >= 2) {
            drawImageProp(ctx, vid, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            // Manually advance if not playing (simple fallback hack for restricted autoplay)
            if (vid.paused) {
                vid.currentTime += 1 / FPS;
                if (vid.currentTime >= vid.duration) vid.currentTime = 0;
            }
        } else {
            // Draw placeholder if video not ready yet
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        // Draw Vignette / Overlay
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
        gradient.addColorStop(0.5, 'rgba(0,0,0,0.1)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw Text
        ctx.textAlign = 'center';

        // Header
        ctx.font = '800 50px Outfit';
        ctx.fillStyle = '#FFD700'; // Gold Color
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 15;
        ctx.fillText('TARİHTE BUGÜN', CANVAS_WIDTH / 2, 200);

        // Body Text
        ctx.font = '600 56px Outfit';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 10;
        wrapText(ctx, text.split('\n\n')[1] || text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100, 900, 90);

        // Footer
        ctx.font = '300 30px Outfit';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.shadowBlur = 0;
        ctx.fillText('@gunluktarih', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 100);

        animationFrameId = requestAnimationFrame(draw);
    }

    draw();
}

/**
 * Helper to cover-fit image/video
 */
function drawImageProp(ctx, img, x, y, w, h, offsetX, offsetY) {
    if (arguments.length === 2) {
        x = y = 0;
        w = ctx.canvas.width;
        h = ctx.canvas.height;
    }

    offsetX = typeof offsetX === 'number' ? offsetX : 0.5;
    offsetY = typeof offsetY === 'number' ? offsetY : 0.5;

    if (offsetX < 0) offsetX = 0;
    if (offsetY < 0) offsetY = 0;
    if (offsetX > 1) offsetX = 1;
    if (offsetY > 1) offsetY = 1;

    var iw = img.videoWidth || img.width,
        ih = img.videoHeight || img.height,
        r = Math.min(w / iw, h / ih),
        nw = iw * r,   // new prop. width
        nh = ih * r,   // new prop. height
        cx, cy, cw, ch, ar = 1;

    // decide which gap to fill    
    if (nw < w) ar = w / nw;
    if (Math.abs(ar - 1) < 1e-14 && nh < h) ar = h / nh;  // updated
    nw *= ar;
    nh *= ar;

    // calc source rectangle
    cw = iw / (nw / w);
    ch = ih / (nh / h);

    cx = (iw - cw) * offsetX;
    cy = (ih - ch) * offsetY;

    // make sure source rectangle is valid
    if (cx < 0) cx = 0;
    if (cy < 0) cy = 0;
    if (cw > iw) cw = iw;
    if (ch > ih) ch = ih;

    // fill image in dest. rectangle
    ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        }
        else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

// --- UI Helpers ---

function setLoading(isLoading, text) {
    state.isGenerating = isLoading;
    if (isLoading) {
        dom.statusBox.classList.remove('hidden');
        dom.statusText.innerText = text;
        dom.actionButtons.classList.add('disabled');
    } else {
        dom.statusBox.classList.add('hidden');
    }
}

function enableActions() {
    dom.actionButtons.classList.remove('disabled');
}

// Start
init();
