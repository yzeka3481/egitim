/**
 * Daily History Reels Generator
 * Main Application Script - v2.0 (Turkish + Music + Cinematic)
 */

// --- Constants & Config ---
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const FPS = 30;
const DURATION_SECONDS = 15;
const PEXELS_API_URL = 'https://api.pexels.com/videos/search';

// Fallback video (Abstract Ink - Serious/Neutral)
const FALLBACK_VIDEOS = [
    'https://files.vidstack.io/sprite-fight/720p.mp4' // Using previous reliable one but we'll try to rely on user upload or API
    // Ideally we want something like: 'https://static.videezy.com/system/resources/previews/000/004/954/original/ink_drops_02.mp4'
    // But for reliability in demo, we keep the reliable link but warn user. 
    // actually, let's use a very simple color gradient generator if video fails? No, keeping video structure is better.
    // Let's try to find a better one.
];

// Reverting to the ink drops one for "serious" look, hoping it plays. 
// If it fails, the user will just have to upload local. 
const SERIOUS_FALLBACK = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4'; // Abstract-ish

// --- Application State ---
const state = {
    selectedDate: new Date().toISOString().split('T')[0],
    apiKey: '',
    isGenerating: false,
    historyData: null,
    backgroundVideo: null,
    backgroundAudio: null,
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
    btnPreview: document.getElementById('btn-preview-play'),
    musicSelect: document.getElementById('music-select'),
    localMusicInput: document.getElementById('local-music')
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
            prepareAssets(url, null).then(() => {
                console.log('Local video loaded');
            });
        }
    });

    // Music Select Helper
    if (dom.musicSelect) {
        dom.musicSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                dom.localMusicInput.classList.remove('hidden');
            } else {
                dom.localMusicInput.classList.add('hidden');
            }
        });
    }
}

// --- Handlers ---

async function handleGenerate(e) {
    e.preventDefault();
    if (state.isGenerating) return;

    state.selectedDate = dom.datePicker.value;
    state.apiKey = dom.apiKeyInput.value.trim();

    setLoading(true, 'Veriler çekiliyor...');

    try {
        // 1. Fetch History Data (TURKISH)
        const fact = await fetchHistoryData(state.selectedDate);
        if (!fact) throw new Error('Tarih verisi bulunamadı.');

        // 2. Determine Video Source
        const localInput = document.getElementById('local-video');
        let videoUrl = null;

        if (localInput.files.length > 0) {
            console.log('Using local video');
        } else {
            setLoading(true, 'Video hazırlanıyor...');
            videoUrl = await fetchBackgroundVideo(fact.keywords, state.apiKey);
        }

        // 3. Determine Audio Source
        let audioUrl = null;
        const musicChoice = dom.musicSelect ? dom.musicSelect.value : 'none';

        if (musicChoice === 'custom' && dom.localMusicInput.files.length > 0) {
            audioUrl = URL.createObjectURL(dom.localMusicInput.files[0]);
        } else if (musicChoice !== 'none' && musicChoice !== 'custom') {
            audioUrl = musicChoice;
        }

        // 4. Prepare All Assets
        await prepareAssets(videoUrl, audioUrl);

        // 5. Start Loop
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
    // 1. Get Canvas Stream
    const canvasStream = dom.canvas.captureStream(FPS);

    // 2. Get Audio Stream (MIXING)
    let finalStream = canvasStream;

    if (state.backgroundAudio) {
        // Audio Context Mixing
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(state.backgroundAudio);
        const destination = audioCtx.createMediaStreamDestination();

        source.connect(destination);
        source.connect(audioCtx.destination);

        const audioTrack = destination.stream.getAudioTracks()[0];
        if (audioTrack) {
            finalStream = new MediaStream([...canvasStream.getVideoTracks(), audioTrack]);
        }
    }

    const options = { mimeType: 'video/webm; codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        if (MediaRecorder.isTypeSupported('video/webm')) options.mimeType = 'video/webm';
        else if (MediaRecorder.isTypeSupported('video/mp4')) options.mimeType = 'video/mp4';
        else delete options.mimeType;
    }

    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(finalStream, options);

    state.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) state.recordedChunks.push(event.data);
    };

    state.mediaRecorder.onstop = () => {
        const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = `tarihte-bugun-${state.selectedDate}.webm`;
        a.click();
        window.URL.revokeObjectURL(url);
        setLoading(false);
    };

    setLoading(true, `Video Kaydediliyor... (0/${DURATION_SECONDS}s)`);

    // Reset media to start
    if (state.backgroundVideo) state.backgroundVideo.currentTime = 0;
    if (state.backgroundAudio) {
        state.backgroundAudio.currentTime = 0;
        state.backgroundAudio.play();
    }

    state.mediaRecorder.start();

    let secondsLeft = DURATION_SECONDS;
    const interval = setInterval(() => {
        secondsLeft--;
        dom.statusText.innerText = `Video Kaydediliyor... (${DURATION_SECONDS - secondsLeft}/${DURATION_SECONDS}s)`;

        if (secondsLeft <= 0) {
            clearInterval(interval);
            state.mediaRecorder.stop();
            if (state.backgroundAudio) state.backgroundAudio.pause();
        }
    }, 1000);
}


// --- Data & Content Engine (TURKISH) ---

const TR_MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

async function fetchHistoryData(dateStr) {
    // Local File Protocol Check
    if (window.location.protocol === 'file:') {
        const [year, month, day] = dateStr.split('-');
        return {
            text: `TARİHTE BUGÜN (${day}.${month}.1969)\n\nİnsanlık Ay'a ilk kez ayak bastı. Apollo 11 görevi başarıyla tamamlandı. "Benim için küçük, insanlık için büyük bir adım." (Demo Modu)`,
            keywords: 'space moon cinematic',
            year: '1969'
        };
    }

    const dateObj = new Date(dateStr);
    const day = dateObj.getDate();
    const monthIndex = dateObj.getMonth();
    const monthName = TR_MONTHS[monthIndex];
    // Wikipedia Format: "21_Aralık"
    const pageTitle = `${day}_${monthName}`;

    try {
        const url = `https://tr.wikipedia.org/w/api.php?action=parse&format=json&page=${pageTitle}&prop=text&section=1&disabletoc=1&origin=*`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.parse || !data.parse.text) throw new Error('Veri yok');

        const htmlContent = data.parse.text['*'];
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const listItems = doc.querySelectorAll('li');

        const validEvents = Array.from(listItems).map(li => {
            return li.innerText.replace(/\[.*?\]/g, '').trim();
        }).filter(t => t.length > 20 && /^\d+/.test(t));

        if (validEvents.length === 0) throw new Error('Olay yok');

        const randomEventStr = validEvents[Math.floor(Math.random() * validEvents.length)];

        // Extract year
        let year = 'Tarih';
        let description = randomEventStr;
        const match = randomEventStr.match(/^(\d+)\s*[-–:]\s*(.*)/);
        if (match) {
            year = match[1];
            description = match[2];
        }

        // Keywords for serious/cinematic video
        const keywords = description.replace(/[^\w\sğüşıöçĞÜŞİÖÇ]/g, '')
            .split(' ')
            .filter(w => w.length > 4)
            .slice(0, 3)
            .join(' ');

        return {
            text: `TARİHTE BUGÜN (${day} ${monthName})\n\n${description}`,
            keywords: keywords + ' cinematic documentary history',
            year: year
        };

    } catch (err) {
        console.warn('Wiki Error', err);
        return {
            text: `TARİHTE BUGÜN (${day} ${monthName})\n\nVeri kaynağına erişilemedi. Lütfen internet bağlantınızı kontrol edin.`,
            keywords: 'abstract technology',
            year: '----'
        };
    }
}

async function fetchBackgroundVideo(query, apiKey) {
    if (!apiKey) {
        return SERIOUS_FALLBACK;
    }

    try {
        const response = await fetch(`${PEXELS_API_URL}?query=${query}&per_page=1&orientation=portrait&size=medium`, {
            headers: { Authorization: apiKey }
        });
        const data = await response.json();
        if (data.videos && data.videos.length > 0) {
            const videoFile = data.videos[0].video_files.find(f => f.quality === 'hd' && f.file_type === 'video/mp4') || data.videos[0].video_files[0];
            return videoFile.link;
        }
    } catch (err) {
        console.error('Pexels Error', err);
    }
    return SERIOUS_FALLBACK;
}

async function prepareAssets(videoUrl, audioUrl) {
    const p1 = new Promise((resolve, reject) => {
        if (videoUrl) {
            // Re-use or create video element
            state.backgroundVideo = state.backgroundVideo || document.createElement('video');
            const vid = state.backgroundVideo;
            vid.crossOrigin = 'anonymous';
            vid.loop = true;
            vid.muted = true;
            vid.setAttribute('playsinline', '');
            vid.src = videoUrl;

            const onReady = () => {
                vid.play().catch(() => { });
                resolve();
            };

            if (vid.readyState >= 3) onReady();
            else vid.oncanplay = onReady;
            vid.onerror = (e) => {
                console.warn('Video load fail', e);
                // Don't reject, just resolve to allow app to continue (white background)
                resolve();
            };
        } else resolve();
    });

    const p2 = new Promise((resolve) => {
        if (audioUrl) {
            state.backgroundAudio = new Audio();
            const aud = state.backgroundAudio;
            aud.crossOrigin = 'anonymous';
            aud.loop = true;
            aud.src = audioUrl;
            aud.oncanplaythrough = () => {
                aud.play().catch(() => { });
                resolve();
            };
            aud.onerror = () => {
                console.warn('Audio load fail');
                resolve();
            };
        } else {
            if (state.backgroundAudio) {
                state.backgroundAudio.pause();
                state.backgroundAudio = null;
            }
            resolve();
        }
    });

    return Promise.all([p1, p2]);
}

// --- Rendering Engine ---
let animationFrameId;

function startRenderLoop(text) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const ctx = dom.canvas.getContext('2d');
    const vid = state.backgroundVideo;

    function draw() {
        if (vid && vid.readyState >= 2) {
            drawImageProp(ctx, vid, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            if (vid.paused) {
                vid.currentTime += 1 / FPS; // Manual advance
                if (vid.currentTime >= vid.duration) vid.currentTime = 0;
            }
        } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }

        // Vignette
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
        gradient.addColorStop(0.5, 'rgba(0,0,0,0.1)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Text
        ctx.textAlign = 'center';

        ctx.font = '800 50px Outfit';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 15;
        ctx.fillText('TARİHTE BUGÜN', CANVAS_WIDTH / 2, 200);

        ctx.font = '600 56px Outfit';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 10;
        wrapText(ctx, text.split('\n\n')[1] || text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100, 900, 90);

        ctx.font = '300 30px Outfit';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.shadowBlur = 0;
        ctx.fillText('@gunluktarih', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 100);

        animationFrameId = requestAnimationFrame(draw);
    }

    draw();
}

// Helpers
function drawImageProp(ctx, img, x, y, w, h, offsetX, offsetY) {
    if (arguments.length === 2) { x = y = 0; w = ctx.canvas.width; h = ctx.canvas.height; }
    offsetX = typeof offsetX === 'number' ? offsetX : 0.5;
    offsetY = typeof offsetY === 'number' ? offsetY : 0.5;
    if (offsetX < 0) offsetX = 0; if (offsetY < 0) offsetY = 0; if (offsetX > 1) offsetX = 1; if (offsetY > 1) offsetY = 1;

    var iw = img.videoWidth || img.width, ih = img.videoHeight || img.height,
        r = Math.min(w / iw, h / ih), nw = iw * r, nh = ih * r, cx, cy, cw, ch, ar = 1;

    if (nw < w) ar = w / nw; if (Math.abs(ar - 1) < 1e-14 && nh < h) ar = h / nh;
    nw *= ar; nh *= ar; cw = iw / (nw / w); ch = ih / (nh / h);
    cx = (iw - cw) * offsetX; cy = (ih - ch) * offsetY;
    if (cx < 0) cx = 0; if (cy < 0) cy = 0; if (cw > iw) cw = iw; if (ch > ih) ch = ih;
    ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) { ctx.fillText(line, x, y); line = words[n] + ' '; y += lineHeight; }
        else line = testLine;
    }
    ctx.fillText(line, x, y);
}

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
