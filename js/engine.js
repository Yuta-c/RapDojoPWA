// engine.js — ラップ道場 ゲームエンジン

// ─── Web Speech API ────────────────────────────────────────────

const TTS = (() => {
  const synth = window.speechSynthesis;
  let jpVoice = null;

  const load = () => {
    const voices = synth.getVoices();
    jpVoice = voices.find(v => v.lang === 'ja-JP') ||
              voices.find(v => v.lang.startsWith('ja')) || null;
  };
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = load;
  load();

  return {
    speak(text, rate = 0.52, pitch = 0.85, onEnd = null) {
      synth.cancel();
      setTimeout(() => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        u.rate = rate;
        u.pitch = pitch;
        if (jpVoice) u.voice = jpVoice;
        if (onEnd) u.onend = onEnd;
        u.onerror = e => {
          if (window.showBeatToast) window.showBeatToast('TTS error: ' + e.error);
          if (onEnd) onEnd();
        };
        if (window.showBeatToast) window.showBeatToast('TTS speak() 呼出 voice=' + (jpVoice ? jpVoice.name : 'none'));
        synth.speak(u);
        // speak後に実際に動いているか確認
        setTimeout(() => {
          if (window.showBeatToast) window.showBeatToast('TTS speaking=' + synth.speaking + ' pending=' + synth.pending);
        }, 300);
      }, 150);
    },
    // Chromeはユーザー操作外でspeakをブロックするため、ボタン押下時に無音で解禁する
    unlock() {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.lang = 'ja-JP';
      synth.cancel();
      synth.speak(u);
    },
    stop() { synth.cancel(); },
    get speaking() { return synth.speaking; },
  };
})();

// ─── Rave Horn (Web Audio API) ────────────────────────────────

function playRaveHorn(vol = 0.09) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const partials = [[233.08, 1.0], [349.23, 0.75], [466.16, 0.55], [698.46, 0.25]];
    const dur = 0.85;
    const now = ctx.currentTime;

    partials.forEach(([freq, amp]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp * vol, now + 0.02);
      gain.gain.setValueAtTime(amp * vol, now + dur - 0.20);
      gain.gain.linearRampToValueAtTime(0, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    });
    setTimeout(() => ctx.close(), (dur + 0.1) * 1000);
  } catch (_) {}
}

// ─── Speech Recognition ───────────────────────────────────────

class SpeechInput extends EventTarget {
  constructor() {
    super();
    const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._supported = !!SRClass;
    if (!this._supported) return;
    this._sr = new SRClass();
    this._sr.lang = 'ja-JP';
    this._sr.continuous = true;
    this._sr.interimResults = true;
    this._base = '';
    this._isRecording = false;
    this._sr.onresult = e => {
      const transcript = [...e.results].map(r => r[0].transcript).join('');
      this.dispatchEvent(Object.assign(new Event('result'), { text: this._base ? this._base + '\n' + transcript : transcript }));
    };
    this._sr.onend = () => {
      if (this._isRecording) this._sr.start(); // auto-restart
    };
    this._sr.onerror = () => { this._isRecording = false; };
  }

  start(base = '') {
    if (!this._supported) return;
    this._base = base;
    this._isRecording = true;
    try { this._sr.start(); } catch (_) {}
  }

  stop() {
    if (!this._supported) return;
    this._isRecording = false;
    try { this._sr.stop(); } catch (_) {}
  }

  setBase(text) { this._base = text; }
  get supported() { return this._supported; }
  get recording() { return this._isRecording; }
}

// ─── Rap Battle Engine ────────────────────────────────────────

const TOTAL_TURNS = 3;

const DIFFICULTIES = {
  beginner:     { label: '初級', time: 120, icon: '🐢', color: '#22c55e' },
  intermediate: { label: '中級', time: 90,  icon: '🐇', color: '#3b82f6' },
  advanced:     { label: '上級', time: 60,  icon: '⚡', color: '#f97316' },
  extreme:      { label: '超級', time: 30,  icon: '🔥', color: '#ef4444' },
};

const N8N_BASE = 'https://n8n.tomoooooooo.net/webhook';
const FETCH_TIMEOUT_MS = 120000;

const GEN_MSGS = [
  'AIが韻を練っています…',
  'Disのネタを仕込み中…',
  '魂を込めて言葉を紡ぐ…',
  '次の一手を考え中…',
  '最高のパンチラインを探して…',
  '言葉の刃を研いでいます…',
  '相手の弱点を分析中…',
  'ライムの海を泳いでいます…',
];

const JUDGE_MSGS = [
  'Geminiが採点中…',
  '韻の精度を分析中…',
  'パンチラインを評価中…',
  'フローを採点中…',
  '独自性を検証中…',
  '勝敗を判定中…',
  '最終スコアを計算中…',
];

class RapBattleEngine extends EventTarget {
  constructor() {
    super();
    this.phase = 'intro'; // intro|generating|speaking|playing|judging|result|error
    this.difficulty = DIFFICULTIES.advanced;
    this.theme = '';
    this.currentTurnNumber = 1;
    this.currentDisRap = '';
    this.currentUserResponse = '';
    this.timeRemaining = 60;
    this.completedTurns = [];
    this.geminiResult = null;
    this.errorMsg = '';
    this.errorDetail = '';
    this.isSpeakingDis = false;
    this._timerInterval = null;
    this._timeUsedStart = 0;
    this.loadingMsg = '';
    this.loadingElapsed = 0;
    this._loadingInterval = null;
    this._speechInput = new SpeechInput();

    this._speechInput.addEventListener('result', e => {
      this.currentUserResponse = e.text;
      this.emit('update');
    });
  }

  emit(type, data = {}) {
    this.dispatchEvent(Object.assign(new Event(type), data));
  }

  // ─── Public API ─────────────────────────────────────────────

  setDifficulty(key) {
    this.difficulty = DIFFICULTIES[key];
    this.emit('update');
  }

  startGame() {
    this.completedTurns = [];
    this.currentTurnNumber = 1;
    this.geminiResult = null;
    this.theme = randomTheme();
    playRaveHorn(0.04);
    this._generateDis();
  }

  skipDisSpeech() {
    TTS.stop();
    this.isSpeakingDis = false;
    this._startInputPhase();
  }

  submitResponse() {
    this._clearTimer();
    this._speechInput.stop();
    this._finishTurn(this.difficulty.time - this.timeRemaining);
  }

  restart() {
    this._clearTimer();
    TTS.stop();
    this._speechInput.stop();
    this.phase = 'intro';
    this.emit('update');
  }

  get canSubmit() { return this.currentUserResponse.trim().length > 0; }
  get isLastTurn() { return this.currentTurnNumber >= TOTAL_TURNS; }
  get timerProgress() { return this.timeRemaining / this.difficulty.time; }

  // ─── Internal ────────────────────────────────────────────────

  _startLoading(msgs) {
    this._stopLoading();
    this.loadingMsg = msgs[0];
    this.loadingElapsed = 0;
    const start = Date.now();
    let idx = 0;
    this._loadingInterval = setInterval(() => {
      this.loadingElapsed = Math.floor((Date.now() - start) / 1000);
      idx = (idx + 1) % msgs.length;
      this.loadingMsg = msgs[idx];
      this.emit('update');
    }, 4000);
  }

  _stopLoading() {
    clearInterval(this._loadingInterval);
    this._loadingInterval = null;
  }

  async _fetchWithTimeout(url, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async _generateDis() {
    this.phase = 'generating';
    this.currentUserResponse = '';
    this._startLoading(GEN_MSGS);
    this.emit('update');
    try {
      const res = await this._fetchWithTimeout(`${N8N_BASE}/rap-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: this.theme }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const dis = (data.dis || '').trim();
      if (!dis || dis.startsWith('エラー') || dis.startsWith('Error:')) {
        throw new Error(dis || 'レスポンスが空です');
      }
      this.currentDisRap = dis;
    } catch (e) {
      this._stopLoading();
      this.phase = 'error';
      this.errorMsg = 'AI生成エラー';
      this.errorDetail = e.name === 'AbortError'
        ? 'タイムアウト（120秒）。AIの応答が遅すぎました。'
        : (e.message || '不明なエラー');
      this.emit('update');
      return;
    }
    this._stopLoading();
    this.phase = 'speaking';
    this.isSpeakingDis = true;
    this.emit('update');
    playRaveHorn();
    setTimeout(() => {
      TTS.speak(this.currentDisRap, 0.52, 0.85, () => {
        this.isSpeakingDis = false;
        this.emit('update');
        this._startInputPhase();
      });
    }, 1000);
  }

  _startInputPhase() {
    this.phase = 'playing';
    this.timeRemaining = this.difficulty.time;
    this._timeUsedStart = Date.now();
    this.emit('update');
    this._startTimer();
    this._speechInput.start('');
  }

  _startTimer() {
    this._clearTimer();
    this._timerInterval = setInterval(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining--;
        this.emit('update');
      } else {
        this._clearTimer();
        this._speechInput.stop();
        this._finishTurn(this.difficulty.time);
      }
    }, 1000);
  }

  _clearTimer() {
    clearInterval(this._timerInterval);
    this._timerInterval = null;
  }

  _finishTurn(timeUsed) {
    playRaveHorn();
    this.completedTurns.push({
      turnNumber: this.currentTurnNumber,
      disRap: this.currentDisRap,
      userResponse: this.currentUserResponse,
      timeUsed,
    });
    if (this.isLastTurn) {
      this.phase = 'judging';
      this.emit('update');
      this._judgeByGemini().then(result => {
        this.geminiResult = result;
        this.phase = 'result';
        this.emit('update');
      });
    } else {
      this.currentTurnNumber++;
      this._generateDis();
    }
  }

  async _judgeByGemini() {
    this._startLoading(JUDGE_MSGS);
    this.emit('update');
    try {
      const aiDis = this.completedTurns.map((t, i) => `【T${i+1}】${t.disRap}`).join('\n');
      const userResponse = this.completedTurns.map((t, i) => `【T${i+1}】${t.userResponse || '（無回答）'}`).join('\n');
      const res = await this._fetchWithTimeout(`${N8N_BASE}/rap-judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: this.theme, aiDis, userResponse }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = (data.result || '').trim();
      if (!raw || raw.startsWith('エラー') || raw.startsWith('Error:')) {
        throw new Error(raw || 'レスポンスが空です');
      }
      const match = raw.match(/\{[\s\S]*\}/);
      this._stopLoading();
      return match ? JSON.parse(match[0]) : null;
    } catch {
      this._stopLoading();
      return null;
    }
  }
}

// ─── Rhyme Practice Engine ────────────────────────────────────

class RhymeEngine extends EventTarget {
  constructor() {
    super();
    this.phase = 'intro'; // intro|playing|rating|result
    this.prompt = randomPrompt();
    this.response = '';
    this.rating = { accuracy: 0, flow: 0, creativity: 0 };
    this.elapsed = 0;
    this._startTime = 0;
  }

  emit(type, data = {}) {
    this.dispatchEvent(Object.assign(new Event(type), data));
  }

  get vowelHint() { return '母音: ' + extractVowels(this.prompt); }
  get canProceed() { return this.response.trim().length > 0; }
  get ratingComplete() {
    const r = this.rating;
    return r.accuracy > 0 && r.flow > 0 && r.creativity > 0;
  }
  get abilityScore() {
    if (!this.ratingComplete) return 0;
    const r = this.rating;
    return ((r.accuracy + r.flow + r.creativity) / 3) * 20;
  }
  get grade() { return gradeFromScore(this.abilityScore); }

  startGame() {
    this.response = '';
    this._startTime = Date.now();
    this.phase = 'playing';
    this.emit('update');
  }

  proceedToRating() {
    this.elapsed = (Date.now() - this._startTime) / 1000;
    this.phase = 'rating';
    this.emit('update');
  }

  submitRating() {
    this.phase = 'result';
    this.emit('update');
  }

  skipRating() {
    this.phase = 'result';
    this.emit('update');
  }

  nextProblem() {
    this.prompt = randomPrompt();
    this.response = '';
    this.rating = { accuracy: 0, flow: 0, creativity: 0 };
    this.elapsed = 0;
    this.phase = 'intro';
    this.emit('update');
  }

  restart() {
    this.phase = 'intro';
    this.emit('update');
  }
}
