/**
 * Daily History Reels Generator
 * Main Application Script - v2.0 (Turkish + Music + Cinematic)
 */

// --- Constants & Config ---
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const FPS = 30;
const DURATION_SECONDS = 15;
const PEXELS_PHOTO_API_URL = 'https://api.pexels.com/v1/search'; // Photos
const SLIDE_DURATION = 4; // Seconds per slide

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
// --- Helpers ---

async function fetchWikiSummary(title) {
    if (!title) return null;
    try {
        const url = `https://tr.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro&explaintext&titles=${title}&origin=*`;
        const response = await fetch(url);
        const data = await response.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId === '-1') return null;

        let extract = pages[pageId].extract;
        // Limit to 2-3 sentences
        const sentences = extract.split('. ');
        return sentences.slice(0, 3).join('. ') + '.';
    } catch (e) {
        console.warn('Summary fetch failed', e);
        return null;
    }
}

function generateCaption(dateStr, year, description, detail) {
    const hashtags = `#tarih #tarihtebugun #${year} #belgesel #bilgi`;
    let detailSection = '';
    if (detail) {
        detailSection = `\n\n🔍 DETAY:\n${detail}`;
    }

    return `📅 TARİHTE BUGÜN: ${dateStr}\n\n${description}${detailSection}\n\n${hashtags}`;
}

// --- DOM Elements Update ---
// (Already defined at top, but ensure we access new ones)
// In init():
function init() {
    // ... existing init code ...
    dom.captionBox = document.getElementById('caption-box');
    dom.captionText = document.getElementById('caption-text');
    dom.btnCopy = document.getElementById('btn-copy-caption');

    dom.btnCopy.addEventListener('click', () => {
        dom.captionText.select();
        document.execCommand('copy');
        dom.btnCopy.innerText = 'Kopyalandı!';
        setTimeout(() => dom.btnCopy.innerHTML = '<span class="material-symbols-rounded">content_copy</span> Kopyala', 2000);
    });

    // ... rest of init ...
    dom.datePicker.value = state.selectedDate;
    dom.canvas.width = CANVAS_WIDTH;
    dom.canvas.height = CANVAS_HEIGHT;

    // Draw initial
    const ctx = dom.canvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#333';
    ctx.font = '50px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('Video Oluştur\'a Basın', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    dom.form.addEventListener('submit', handleGenerate);
    dom.btnDownload.addEventListener('click', handleDownload);

    document.getElementById('local-video').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            prepareAssets(url, null).then(() => console.log('Local video loaded'));
        }
    });

    if (dom.musicSelect) {
        dom.musicSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') dom.localMusicInput.classList.remove('hidden');
            else dom.localMusicInput.classList.add('hidden');
        });
    }
}

// --- Handlers Update ---

async function handleGenerate(e) {
    e.preventDefault();
    if (state.isGenerating) return;

    state.selectedDate = dom.datePicker.value;
    state.apiKey = dom.apiKeyInput.value.trim();

    setLoading(true, 'Veriler çekiliyor...');
    if (dom.captionBox) dom.captionBox.classList.add('hidden');

    try {
        // 1. Fetch History Data (TURKISH)
        const fact = await fetchHistoryData(state.selectedDate);
        if (!fact) throw new Error('Tarih verisi bulunamadı.');

        // 2. Determine Asset Source (Photos)
        const localInput = document.getElementById('local-video');
        let imageUrls = [];

        // Note: New engine supports Photos (Array). Local video upload temporarily ignored or treated as fallback.
        if (localInput.files.length > 0) {
            console.warn('Local video ignored in Photo Mode. Fetching photos instead.');
        }

        setLoading(true, 'Fotoğraflar hazırlanıyor...');
        imageUrls = await fetchBackgroundPhotos(fact.keywords, state.apiKey);

        // 3. Determine Audio Source
        let audioUrl = null;
        const musicChoice = dom.musicSelect ? dom.musicSelect.value : 'none';

        if (musicChoice === 'custom' && dom.localMusicInput.files.length > 0) {
            audioUrl = URL.createObjectURL(dom.localMusicInput.files[0]);
        } else if (musicChoice !== 'none' && musicChoice !== 'custom') {
            audioUrl = musicChoice;
        }

        // 4. Prepare All Assets
        await prepareAssets(imageUrls, audioUrl);

        // 5. Start Loop
        startRenderLoop(fact.text);

        // 6. Generate Caption & Details
        setLoading(true, 'Detaylar oluşturuluyor...');
        let wikiDetail = null;
        if (fact.topicTitle) {
            wikiDetail = await fetchWikiSummary(fact.topicTitle);
        }

        // Music Recommendation Logic (Instagram Reels Friendly)
        const getMusicRecommendation = (keywords) => {
            const k = keywords.toLowerCase();
            if (k.includes('war') || k.includes('battle') || k.includes('army')) return "⚔️ Öneri: 'Two Steps From Hell - Victory' veya 'Hans Zimmer - Mombasa'";
            if (k.includes('space') || k.includes('moon') || k.includes('galaxy')) return "🌌 Öneri: 'Hans Zimmer - Cornfield Chase' veya 'M83 - Outro'";
            if (k.includes('science') || k.includes('tech')) return "🔬 Öneri: 'Oppenheimer - Can You Hear The Music' veya 'Tron Legacy - The Grid'";
            if (k.includes('sad') || k.includes('death')) return "🥀 Öneri: 'Ludovico Einaudi - Experience' veya 'Schindler\'s List Theme'";
            return "🎵 Öneri: 'Hans Zimmer - Time' veya 'Audiomachine - Breath and Life'";
        };
        const musicRec = getMusicRecommendation(fact.keywords);

        const caption = generateCaption(state.selectedDate, fact.year, fact.rawDescription || '', wikiDetail || '', ''); // Removed music from caption text

        if (dom.captionText) {
            dom.captionText.value = caption;

            // Update dedicated music suggestion box
            const musicDisplay = document.getElementById('music-suggestion-text');
            if (musicDisplay) musicDisplay.innerText = musicRec;

            dom.captionBox.classList.remove('hidden');
        }

        setLoading(false);
        enableActions();

    } catch (error) {
        console.error(error);
        alert('Hata: ' + error.message);
        setLoading(false);
    }
}

// ... (Rest of existing functions like handleDownload, scoreEvent etc) ...

// Updated fetchHistoryData to return raw description and topic link
async function fetchHistoryData(dateStr) {
    if (window.location.protocol === 'file:') {
        // ... demo logic ...
        return {
            text: `TARİHTE BUGÜN (...)\n\nDemo...`,
            keywords: 'space',
            year: '1969',
            rawDescription: 'İnsanlık Ay\'a çıktı.',
            topicTitle: 'Apollo_11'
        };
    }

    const dateObj = new Date(dateStr);
    const day = dateObj.getDate();
    const monthIndex = dateObj.getMonth();
    const monthName = TR_MONTHS[monthIndex];
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
            // Store original HTML element to extract links later
            const text = li.innerText.replace(/\[.*?\]/g, '').trim();
            return { element: li, text: text };
        }).filter(item => item.text.length > 20 && /^\d+/.test(item.text));

        if (validEvents.length === 0) throw new Error('Geçerli olay yok');

        // Scoring Logic 
        // We reuse the scoring logic but apply it to the object
        const scoreEvent = (text) => {
            let score = 0;
            const textLower = text.toLowerCase();
            const tier1 = ['savaş', 'devrim', 'darbe', 'işgal', 'bağımsızlık', 'ilan edildi', 'imparatorluğu', 'cumhuriyet', 'fetih', 'atom', 'nükleer', 'uzay', 'aya ayak', 'nobel', 'icat', 'keşif'];
            const tier2 = ['dünya', 'uluslararası', 'abd', 'sovyet', 'rusya', 'almanya', 'ingiltere', 'fransa', 'çin', 'japonya', 'birleşmiş milletler', 'nato', 'avrupa birliği'];
            const tier3Val = ['ilçe', 'ilçesi', 'köyü', 'beldesi', 'mahallesi', 'belediye', 'valisi', 'kaymakam', 'muhtar', 'hizmete girdi', 'temeli atıldı', 'ziyaret etti', 'heyeti'];

            if (tier1.some(k => textLower.includes(k))) score += 10;
            if (tier2.some(k => textLower.includes(k))) score += 5;
            if (tier3Val.some(k => textLower.includes(k))) score -= 20;
            return score;
        };

        validEvents.sort((a, b) => scoreEvent(b.text) - scoreEvent(a.text));

        const poolSize = Math.max(3, Math.floor(validEvents.length * 0.3));
        const topEvents = validEvents.slice(0, poolSize);
        const selectedItem = topEvents[Math.floor(Math.random() * topEvents.length)];

        // Extract Topic Title from Links
        let topicTitle = null;
        const links = selectedItem.element.querySelectorAll('a');
        for (let link of links) {
            const href = link.getAttribute('href');
            // Skip year links (usually starts with digit) or internal irrelevant ones
            if (href && href.startsWith('/wiki/') && !/^\/wiki\/\d+$/.test(href)) {
                topicTitle = href.replace('/wiki/', '');
                break; // Take the first relevant link
            }
        }

        const randomEventStr = selectedItem.text;
        let year = 'Tarih';
        let description = randomEventStr;
        const match = randomEventStr.match(/^(\d+)\s*[-–:]\s*(.*)/);
        if (match) {
            year = match[1];
            description = match[2];
        }

        // Generate keywords for visual search (Contextual Translation)
        const getEnglishContext = (txt) => {
            const t = txt.toLowerCase();
            let keys = [];

            // War / Conflict
            if (t.includes('savaş') || t.includes('cephe') || t.includes('muharebe')) keys.push('war battle army soldier');
            if (t.includes('işgal') || t.includes('fetih')) keys.push('invader historical-map army');
            if (t.includes('darbe') || t.includes('isyan') || t.includes('devrim')) keys.push('protest crowd revolution riot');
            if (t.includes('suikast') || t.includes('öldürüldü')) keys.push('crime cemetery pistol');
            if (t.includes('antlaşma') || t.includes('imzalandı')) keys.push('document signing pen writing');

            // Science / Tech
            if (t.includes('uzay') || t.includes('ay\'a') || t.includes('nasa') || t.includes('uydu')) keys.push('space moon astronaut rocket galaxy');
            if (t.includes('icat') || t.includes('keşif') || t.includes('bilim')) keys.push('science laboratory invention physics old-tech');
            if (t.includes('uçak') || t.includes('havacılık')) keys.push('airplane vintage-plane flight');
            if (t.includes('tren') || t.includes('demiryolu')) keys.push('steam-train railway');

            // Daily / Culture
            if (t.includes('film') || t.includes('sinema')) keys.push('cinema old-movie hollywood');
            if (t.includes('kitap') || t.includes('yazar') || t.includes('roman')) keys.push('library old-books writing typewriter');
            if (t.includes('spor') || t.includes('futbol') || t.includes('olimpiyat')) keys.push('sports olympics stadium');
            if (t.includes('kral') || t.includes('kraliçe') || t.includes('prens')) keys.push('royalty crown palace');

            // Default
            if (keys.length === 0) return 'history vintage antique cinematic';

            return keys.join(' ');
        };

        const contextKeywords = getEnglishContext(randomEventStr);
        let searchKeywords = contextKeywords;

        // Append Year if available for styling (e.g. "1969 space")
        if (year && year.length === 4) {
            searchKeywords = `${year} ${contextKeywords}`;
        }

        return {
            text: `TARİHTE BUGÜN (${day} ${monthName} ${year})\n\n${description}`,
            keywords: searchKeywords,
            year: year,
            rawDescription: description,
            topicTitle: topicTitle
        };

    } catch (err) {
        console.warn('Wiki Error', err);
        return {
            text: `TARİHTE BUGÜN (${day} ${monthName})\n\nVeri kaynağına erişilemedi.`,
            keywords: 'abstract technology',
            year: '----',
            rawDescription: 'Hata',
            topicTitle: null
        };
    }
}

// --- MP4 Encoding (WebCodecs + mp4-muxer) ---
async function handleDownload() {
    // Check if WebCodecs is supported
    if (!('VideoEncoder' in window) || !('AudioEncoder' in window)) {
        alert('Tarayıcınız gelişmiş MP4 kaydını desteklemiyor (WebCodecs API yok). Standart yöntem deneniyor...');
        handleDownloadFallback();
        return;
    }

    setLoading(true, 'MP4 Kayıt Hazırlanıyor... Lütfen Bekleyin.');

    try {
        // Load mp4-muxer dynamically
        const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.0.0/+esm');

        // 1. Setup Muxer
        const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc', // H.264
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT
            },
            audio: state.backgroundAudio ? {
                codec: 'aac',
                sampleRate: 44100,
                numberOfChannels: 2
            } : undefined,
            fastStart: 'in-memory'
        });

        // 2. Setup Video Encoder
        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => console.error('Video Encoder Error:', e)
        });

        videoEncoder.configure({
            codec: 'avc1.42001f', // Baseline Profile (High Compatibility)
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            bitrate: 5_000_000, // 5 Mbps
            framerate: FPS
        });

        // 3. Setup Audio Encoder
        let audioEncoder = null;
        if (state.backgroundAudio) {
            audioEncoder = new AudioEncoder({
                output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                error: (e) => console.error('Audio Encoder Error:', e)
            });
            audioEncoder.configure({
                codec: 'mp4a.40.2', // AAC LC
                sampleRate: 44100,
                numberOfChannels: 2,
                bitrate: 128_000
            });
        }

        // 4. Decode Audio Info
        let audioBuffer = null;
        if (state.backgroundAudio && state.backgroundAudio.src) {
            try {
                const response = await fetch(state.backgroundAudio.src);
                const arrayBuffer = await response.arrayBuffer();
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            } catch (e) {
                console.warn('Audio decode failed, proceeding silent', e);
            }
        }

        // 5. Recording Loop (Faster than Realtime possible)
        const frameDuration = 1 / FPS;
        const totalFrames = DURATION_SECONDS * FPS;

        // Temporarily pause main render loop
        if (animationFrameId) cancelAnimationFrame(animationFrameId);

        // We render frames one by one
        const ctx = dom.canvas.getContext('2d');
        const images = state.backgroundImages;

        // Re-calculate moves for consistency
        const moves = images.map(() => ({
            originX: Math.random() * 0.2,
            originY: Math.random() * 0.2,
            direction: Math.random() > 0.5 ? 1 : -1,
            scaleStart: 1.1,
            scaleEnd: 1.25
        }));

        console.log('Starting Encoding...');

        for (let i = 0; i < totalFrames; i++) {
            const time = i * frameDuration; // Seconds
            const progress = i / totalFrames; // 0..1

            // UI Update
            if (i % 10 === 0) {
                dom.statusText.innerText = `MP4 Oluşturuluyor... %${Math.round(progress * 100)}`;
                await new Promise(r => requestAnimationFrame(r)); // Breathe
            }

            // --- Render Frame Logic (Duplicated from startRenderLoop for sync) ---
            const slideIndex = Math.floor(time / SLIDE_DURATION) % images.length;
            const nextSlideIndex = (slideIndex + 1) % images.length;
            const slideProgress = (time % SLIDE_DURATION) / SLIDE_DURATION;

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            if (images[slideIndex]) {
                drawKenBurns(ctx, images[slideIndex], slideProgress, moves[slideIndex], 1);
            }

            if (slideProgress > 0.75 && images[nextSlideIndex]) {
                const alpha = (slideProgress - 0.75) * 4;
                drawKenBurns(ctx, images[nextSlideIndex], 0, moves[nextSlideIndex], alpha);
            }

            const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
            gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
            gradient.addColorStop(0.5, 'rgba(0,0,0,0.1)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            ctx.textAlign = 'center';
            const textToRender = state.currentText || 'TARİHTE BUGÜN...\n\n(Veri Yok)';
            const parts = textToRender.split('\n\n');
            const headerText = parts[0] || 'TARİHTE BUGÜN';
            const bodyText = parts[1] || textToRender;

            ctx.font = '800 42px Outfit';
            ctx.fillStyle = '#FFD700';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 15;
            ctx.fillText(headerText.toUpperCase(), CANVAS_WIDTH / 2, 200);

            ctx.font = '600 56px Outfit';
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10;
            wrapText(ctx, bodyText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100, 900, 90);

            ctx.font = '300 30px Outfit';
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.shadowBlur = 0;
            ctx.fillText('@gunluktarih', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 100);
        }

        // 6. Save File using Muxer
        await muxer.finalize();
        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = `tarihte-bugun-${state.selectedDate}.mp4`;
        a.click();
        window.URL.revokeObjectURL(url);

        setLoading(false);
        // Resume preview
        startRenderLoop(state.currentText);

    } catch (err) {
        console.error('MP4 Gen Error:', err);
        alert('MP4 oluşturma hatası: ' + err.message + '\nStandart kayıt deneniyor...');
        handleDownloadFallback();
    }
}

// Fallback to old MediaRecorder
function handleDownloadFallback() {
    // 1. Get Canvas Stream
    const canvasStream = dom.canvas.captureStream(FPS);
    // ... (rest of old code)



    // Check supported types, prioritize MP4
    const mimeTypes = [
        'video/mp4; codecs=h264,aac',
        'video/mp4',
        'video/webm; codecs=vp9',
        'video/webm'
    ];

    const options = {};
    let selectedMimeType = '';

    for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            selectedMimeType = type;
            options.mimeType = type;
            console.log('Using MIME type:', type);
            break;
        }
    }

    if (!selectedMimeType) {
        console.warn('No preferred MIME type supported, letting browser decide.');
    }

    state.recordedChunks = [];
    try {
        state.mediaRecorder = new MediaRecorder(finalStream, options);
    } catch (e) {
        console.error('MediaRecorder create failed:', e);
        // Fallback without options
        state.mediaRecorder = new MediaRecorder(finalStream);
    }

    state.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) state.recordedChunks.push(event.data);
    };

    state.mediaRecorder.onstop = () => {
        const isMp4 = selectedMimeType.includes('mp4');
        const type = isMp4 ? 'video/mp4' : 'video/webm';
        const ext = isMp4 ? 'mp4' : 'webm';

        const blob = new Blob(state.recordedChunks, { type: type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = `tarihte-bugun-${state.selectedDate}.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);

        setLoading(false);
        if (!isMp4) {
            alert('Tarayıcınız MP4 kaydını desteklemiyor olabilir, bu yüzden .webm olarak indirildi. MP4 için VLC player ile dönüştürebilirsiniz.');
        }
    };

    setLoading(true, `Video Kaydediliyor... (0/${DURATION_SECONDS}s)`);

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

async function fetchBackgroundPhotos(query, apiKey) {
    // If no API key, return a placeholder array
    if (!apiKey) {
        // Fallback Abstract Images
        return [
            'https://images.pexels.com/photos/2085998/pexels-photo-2085998.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
            'https://images.pexels.com/photos/1103970/pexels-photo-1103970.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
            'https://images.pexels.com/photos/36006/renaissance-schallaburg-figures-facade.jpg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2'
        ];
    }

    const fetchFromPexels = async (searchQuery) => {
        try {
            // Fetch 15 photos, pick 5 random
            const response = await fetch(`${PEXELS_PHOTO_API_URL}?query=${searchQuery}&per_page=15&orientation=portrait`, {
                headers: { Authorization: apiKey }
            });
            if (response.status === 401) throw new Error('API_KEY_INVALID');
            const data = await response.json();
            return data.photos || [];
        } catch (e) {
            if (e.message === 'API_KEY_INVALID') throw e;
            return [];
        }
    };

    try {
        console.log(`Pexels Photos: Searching for "${query}"...`);
        let photos = await fetchFromPexels(query);

        if (photos.length === 0) photos = await fetchFromPexels('history museum'); // Fallback

        if (photos.length > 0) {
            // Shuffle and pick 5 unique
            const shuffled = photos.sort(() => 0.5 - Math.random());
            return shuffled.slice(0, 5).map(p => p.src.large2x || p.src.large);
        }

    } catch (err) {
        if (err.message === 'API_KEY_INVALID') alert('API Anahtarı Hatalı!');
        console.error(err);
    }

    // Final fallback
    return ['https://images.pexels.com/photos/2085998/pexels-photo-2085998.jpeg'];
}

async function prepareAssets(imageUrls, audioUrl) {
    // Load Images
    const imagePromises = imageUrls.map(url => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = url;
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null); // Continue even if one fails
        });
    });

    const loadedImages = await Promise.all(imagePromises);
    state.backgroundImages = loadedImages.filter(img => img !== null);

    // Load Audio (Same as before)
    const audioPromise = new Promise((resolve) => {
        if (audioUrl) {
            state.backgroundAudio = new Audio();
            const aud = state.backgroundAudio;
            aud.crossOrigin = 'anonymous';
            aud.loop = true;
            aud.src = audioUrl;
            aud.oncanplaythrough = () => { aud.play().catch(() => { }); resolve(); };
            aud.onerror = () => resolve();
        } else {
            if (state.backgroundAudio) { state.backgroundAudio.pause(); state.backgroundAudio = null; }
            resolve();
        }
    });

    return audioPromise;
}

// --- Rendering Engine ---
let animationFrameId;

// Kenneth Burns Slideshow Effect
function startRenderLoop(text) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Store text for MP4 Encoder to access later
    state.currentText = text;

    const ctx = dom.canvas.getContext('2d');
    const images = state.backgroundImages;
    let startTime = Date.now();

    // Pre-calculate Ken Burns params for each image
    const moves = images.map(() => ({
        originX: Math.random() * 0.2, // 0% to 20%
        originY: Math.random() * 0.2,
        direction: Math.random() > 0.5 ? 1 : -1,
        scaleStart: 1.1,
        scaleEnd: 1.25
    }));

    function draw() {
        const now = Date.now();
        const elapsed = (now - startTime) / 1000;

        // Determine current slide indices
        // We want a smooth transition.
        // Cycle duration = SLIDE_DURATION
        const totalDuration = elapsed;
        const slideIndex = Math.floor(totalDuration / SLIDE_DURATION) % images.length;
        const nextSlideIndex = (slideIndex + 1) % images.length;

        const slideProgress = (totalDuration % SLIDE_DURATION) / SLIDE_DURATION; // 0.0 to 1.0

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw Current Slide
        if (images[slideIndex]) {
            drawKenBurns(ctx, images[slideIndex], slideProgress, moves[slideIndex], 1);
        }

        // Crossfade to Next Slide (last 1 second)
        if (slideProgress > 0.75 && images[nextSlideIndex]) {
            const alpha = (slideProgress - 0.75) * 4; // 0 to 1
            drawKenBurns(ctx, images[nextSlideIndex], 0, moves[nextSlideIndex], alpha);
        }

        // Vignette
        const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
        gradient.addColorStop(0.5, 'rgba(0,0,0,0.1)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Text Overlay
        ctx.textAlign = 'center';

        const parts = text.split('\n\n');
        const headerText = parts[0] || 'TARİHTE BUGÜN';
        const bodyText = parts[1] || text;

        ctx.font = '800 42px Outfit';
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 15;
        ctx.fillText(headerText.toUpperCase(), CANVAS_WIDTH / 2, 200);

        ctx.font = '600 56px Outfit';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 10;
        wrapText(ctx, bodyText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100, 900, 90);

        ctx.font = '300 30px Outfit';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.shadowBlur = 0;
        ctx.fillText('@gunluktarih', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 100);

        animationFrameId = requestAnimationFrame(draw);
    }

    draw();
}

function drawKenBurns(ctx, img, progress, move, globalAlpha) {
    if (!img) return;

    ctx.save();
    ctx.globalAlpha = globalAlpha;

    // Calculate scale and position based on progress
    const scale = move.scaleStart + (move.scaleEnd - move.scaleStart) * progress;

    // Pan calculation
    // We want to move from (OriginX, OriginY) slightly
    const panRange = 0.05; // 5% movement
    const panX = move.originX + (panRange * progress * move.direction);
    const panY = move.originY;

    // Draw parameters
    const iw = img.width;
    const ih = img.height;

    // We render a slice of the image
    // Source rect
    const sw = iw / scale;
    const sh = ih / scale;
    const sx = panX * iw;
    const sy = panY * ih;

    // Destination rect is full canvas
    // But we need to maintain aspect ratio cover logic roughly?
    // Actually simpler: Draw Image scaled up, then center.
    // Let's use standard drawImageProp but with virtual scaling.

    // Better simplified Ken Burns:
    // Scale canvas context? No, expensive.
    // Calculate source rectangle (crop) that moves over time.

    // Center crop logic:
    // We need to fill CANVAS_WIDTH x CANVAS_HEIGHT
    // Basic scaling to Cover
    const ratio = Math.max(CANVAS_WIDTH / iw, CANVAS_HEIGHT / ih);
    const centerW = iw * ratio;
    const centerH = ih * ratio;

    // Apply zoom
    const zoomW = centerW * scale;
    const zoomH = centerH * scale;

    // Offsets
    let dx = (CANVAS_WIDTH - zoomW) / 2;
    let dy = (CANVAS_HEIGHT - zoomH) / 2;

    // Apply Pan
    dx += (move.direction * 50 * progress); // Move 50px horizontally over time

    ctx.drawImage(img, dx, dy, zoomW, zoomH);
    ctx.restore();
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
