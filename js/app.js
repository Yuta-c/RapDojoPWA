// app.js — UI コントローラー

// ─── Screen System ─────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('visible'); el.scrollTop = 0; }
}

// ─── Engines ──────────────────────────────────────────────────

const rapEngine  = new RapBattleEngine();
const rhymeEngine = new RhymeEngine();

// ─── Home ──────────────────────────────────────────────────────

document.getElementById('btn-rap').addEventListener('click', () => {
  rapEngine.restart();
  renderRap();
  showScreen('screen-rap');
});

document.getElementById('btn-rhyme').addEventListener('click', () => {
  rhymeEngine.restart();
  renderRhyme();
  showScreen('screen-rhyme');
});

document.querySelectorAll('.back-home').forEach(btn => {
  btn.addEventListener('click', () => showScreen('screen-home'));
});

// ─── Rap Battle UI ─────────────────────────────────────────────

rapEngine.addEventListener('update', renderRap);

function renderRap() {
  const e = rapEngine;
  const ph = e.phase;

  // sub-screen visibility
  ['rap-intro','rap-generating','rap-speaking','rap-playing','rap-judging','rap-result','rap-error']
    .forEach(id => document.getElementById(id).classList.remove('visible'));
  document.getElementById('rap-' + ph)?.classList.add('visible');

  if (ph === 'intro') renderRapIntro();
  else if (ph === 'generating') renderRapGenerating();
  else if (ph === 'speaking') renderRapSpeaking();
  else if (ph === 'playing') renderRapPlaying();
  else if (ph === 'judging') renderRapJudging();
  else if (ph === 'result') renderRapResult();
  else if (ph === 'error') renderRapError();
}

// — Intro —
function renderRapIntro() {
  document.querySelectorAll('.diff-btn').forEach(btn => {
    const key = btn.dataset.diff;
    btn.classList.toggle('active', rapEngine.difficulty === DIFFICULTIES[key]);
  });
}

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => rapEngine.setDifficulty(btn.dataset.diff));
});

document.getElementById('rap-start-btn').addEventListener('click', () => {
  TTS.unlock();
  if (_selectedBeatId !== null) {
    BeatManager.play(_selectedBeatId).then(() => updateMiniPlayer('rap')).catch(() => {});
  }
  rapEngine.startGame();
});

// — Generating —
function renderRapGenerating() {
  document.getElementById('gen-theme').textContent = '「' + rapEngine.theme + '」';
  document.getElementById('gen-turn').textContent = rapEngine.currentTurnNumber + ' / ' + TOTAL_TURNS;
  document.getElementById('gen-msg').textContent = rapEngine.loadingMsg || 'AIのDisを準備中…';
  document.getElementById('gen-elapsed').textContent = rapEngine.loadingElapsed > 0 ? rapEngine.loadingElapsed + '秒経過' : '';
}

// — Judging —
function renderRapJudging() {
  document.getElementById('judge-msg').textContent = rapEngine.loadingMsg || 'Geminiが判定中…';
  document.getElementById('judge-elapsed').textContent = rapEngine.loadingElapsed > 0 ? rapEngine.loadingElapsed + '秒経過' : '';
}

// — Error —
function renderRapError() {
  document.getElementById('rap-error-msg').textContent = rapEngine.errorMsg || '接続エラー';
  document.getElementById('rap-error-detail').textContent = rapEngine.errorDetail || '—';
}

// — Speaking —
function renderRapSpeaking() {
  document.getElementById('speak-turn').textContent = rapEngine.currentTurnNumber + ' / ' + TOTAL_TURNS;
  document.getElementById('speak-theme').textContent = '「' + rapEngine.theme + '」';
  document.getElementById('speak-dis').textContent = rapEngine.currentDisRap;
  document.getElementById('speak-status').textContent = rapEngine.isSpeakingDis ? 'AIのDisを読み上げ中…' : '準備中…';
}

document.getElementById('rap-skip-tts').addEventListener('click', () => rapEngine.skipDisSpeech());

// — Playing —
let _rapTextFromSpeech = false;

function renderRapPlaying() {
  const e = rapEngine;
  document.getElementById('play-turn').textContent = e.currentTurnNumber + ' / ' + TOTAL_TURNS;
  document.getElementById('play-theme').textContent = '「' + e.theme + '」';
  document.getElementById('play-dis').textContent = e.currentDisRap;

  // Timer
  const t = e.timeRemaining;
  document.getElementById('play-timer-num').textContent = t;
  const prog = e.timerProgress;
  const circle = document.getElementById('play-timer-circle');
  const r = 38;
  const circ = 2 * Math.PI * r;
  circle.style.strokeDashoffset = circ * (1 - prog);
  circle.style.stroke = timerColor(e);

  // Input (avoid cursor jump when speech is updating)
  const textarea = document.getElementById('play-input');
  if (document.activeElement !== textarea) {
    textarea.value = e.currentUserResponse;
  }

  // Recording badge
  document.getElementById('play-rec-badge').style.display =
    e._speechInput.recording ? 'inline-flex' : 'none';

  // Submit button
  document.getElementById('rap-submit-btn').disabled = !e.canSubmit;
}

document.getElementById('play-input').addEventListener('input', function() {
  rapEngine.currentUserResponse = this.value;
  rapEngine._speechInput.setBase(this.value);
  document.getElementById('rap-submit-btn').disabled = !rapEngine.canSubmit;
});

document.getElementById('rap-submit-btn').addEventListener('click', () => rapEngine.submitResponse());

function timerColor(e) {
  const p = e.timerProgress;
  if (p >= 1/3) return '#ec4899';
  if (p >= 1/6) return '#f97316';
  return '#ef4444';
}

// — Result —
function renderRapResult() {
  const e = rapEngine;
  const r = e.geminiResult;

  if (r) {
    // Gemini判定あり
    const score = Math.round(((r.rhyme + r.punchline + r.flow + r.originality) / 4) * 20);
    const grade = r.winner === 'USER' ? 'WIN' : 'LOSE';
    document.getElementById('result-rap-grade').textContent = grade;
    document.getElementById('result-rap-grade').style.color = r.winner === 'USER' ? 'var(--green)' : 'var(--red)';
    document.getElementById('result-rap-score').textContent =
      `韻${r.rhyme} パンチ${r.punchline} フロー${r.flow} 独自性${r.originality}`;
    const commentEl = document.getElementById('result-rap-comment');
    commentEl.textContent = '⚖️ ' + r.comment;
    commentEl.style.display = 'block';
  } else {
    // Gemini失敗時フォールバック
    document.getElementById('result-rap-grade').textContent = '—';
    document.getElementById('result-rap-score').textContent = '判定失敗';
    document.getElementById('result-rap-comment').style.display = 'none';
  }

  document.getElementById('result-rap-theme').textContent = e.theme;

  // Turn cards
  const cardsEl = document.getElementById('rap-turn-cards');
  cardsEl.innerHTML = '';
  e.completedTurns.forEach(turn => {
    const card = document.createElement('div');
    card.className = 'turn-card';
    card.innerHTML = `
      <div class="turn-card-header">
        <span class="turn-badge">T${turn.turnNumber}</span>
        <span class="turn-time">${turn.timeUsed.toFixed(1)}秒</span>
      </div>
      <div class="dis-box">${escHtml(turn.disRap)}</div>
      <div class="response-box">${turn.userResponse?.trim() ? escHtml(turn.userResponse) : '<em>（タイムアップ・未回答）</em>'}</div>
    `;
    cardsEl.appendChild(card);
  });
}

document.getElementById('rap-next-btn').addEventListener('click', () => {
  TTS.unlock();
  if (_selectedBeatId !== null) {
    BeatManager.play(_selectedBeatId).then(() => updateMiniPlayer('rap')).catch(() => {});
  }
  rapEngine.startGame();
});
document.getElementById('rap-home-btn').addEventListener('click', () => showScreen('screen-home'));

document.getElementById('rap-error-retry').addEventListener('click', () => {
  TTS.unlock();
  if (_selectedBeatId !== null) {
    BeatManager.play(_selectedBeatId).then(() => updateMiniPlayer('rap')).catch(() => {});
  }
  rapEngine.startGame();
});

// ─── Rhyme Practice UI ─────────────────────────────────────────

rhymeEngine.addEventListener('update', renderRhyme);

function renderRhyme() {
  const e = rhymeEngine;
  const ph = e.phase;

  ['rhyme-intro','rhyme-playing','rhyme-rating','rhyme-result']
    .forEach(id => document.getElementById(id).classList.remove('visible'));
  document.getElementById('rhyme-' + ph)?.classList.add('visible');

  if (ph === 'intro') renderRhymeIntro();
  else if (ph === 'playing') renderRhymePlaying();
  else if (ph === 'rating') renderRhymeRating();
  else if (ph === 'result') renderRhymeResult();
}

function renderRhymeIntro() {
  document.getElementById('rhyme-intro-prompt').textContent = rhymeEngine.prompt;
  document.getElementById('rhyme-intro-vowel').textContent = rhymeEngine.vowelHint;
}

document.getElementById('rhyme-start-btn').addEventListener('click', () => {
  if (_selectedBeatId !== null) BeatManager.play(_selectedBeatId).then(() => updateMiniPlayer('rhyme'));
  rhymeEngine.startGame();
});

function renderRhymePlaying() {
  const e = rhymeEngine;
  document.getElementById('rhyme-play-prompt').textContent = e.prompt;
  document.getElementById('rhyme-play-vowel').textContent = e.vowelHint;
  const textarea = document.getElementById('rhyme-input');
  if (document.activeElement !== textarea) textarea.value = e.response;
  document.getElementById('rhyme-proceed-btn').disabled = !e.canProceed;
}

document.getElementById('rhyme-input').addEventListener('input', function() {
  rhymeEngine.response = this.value;
  document.getElementById('rhyme-proceed-btn').disabled = !rhymeEngine.canProceed;
});

document.getElementById('rhyme-proceed-btn').addEventListener('click', () => rhymeEngine.proceedToRating());

function renderRhymeRating() {
  const e = rhymeEngine;
  document.getElementById('rhyme-rating-response').textContent = e.response;
  renderStars('rhyme-rating', e.rating, (axis, val) => {
    e.rating[axis] = val;
    renderRhyme();
  });
  document.getElementById('rhyme-rating-submit').disabled = !e.ratingComplete;
}

document.getElementById('rhyme-rating-submit').addEventListener('click', () => rhymeEngine.submitRating());
document.getElementById('rhyme-rating-skip').addEventListener('click', () => rhymeEngine.skipRating());

function renderRhymeResult() {
  const e = rhymeEngine;
  const score = Math.round(e.abilityScore);
  document.getElementById('rhyme-result-grade').textContent = e.grade;
  document.getElementById('rhyme-result-score').textContent = score + '点';
  document.getElementById('rhyme-result-prompt').textContent = e.prompt;
  document.getElementById('rhyme-result-response').textContent = e.response;
}

document.getElementById('rhyme-next-btn').addEventListener('click', () => {
  rhymeEngine.nextProblem();
  renderRhyme();
});
document.getElementById('rhyme-home-btn').addEventListener('click', () => showScreen('screen-home'));

// ─── Star Rating Component ─────────────────────────────────────

const RAP_RATING_AXES = [
  { key: 'rhyme',        label: 'ライム',        icon: '🎵' },
  { key: 'punchline',    label: 'パンチライン',  icon: '⚡' },
  { key: 'story',        label: 'ストーリー',    icon: '📖' },
  { key: 'originality',  label: 'オリジナリティ', icon: '✨' },
];

const RHYME_RATING_AXES = [
  { key: 'accuracy',   label: '韻の精度', icon: '🎯' },
  { key: 'flow',       label: 'フロウ',   icon: '🎵' },
  { key: 'creativity', label: '創造性',   icon: '✨' },
];

function renderStars(containerId, ratingObj, onChange) {
  const axes = containerId.startsWith('rap') ? RAP_RATING_AXES : RHYME_RATING_AXES;
  const container = document.getElementById(containerId + '-axes');
  if (!container) return;
  container.innerHTML = '';
  axes.forEach(({ key, label, icon }) => {
    const row = document.createElement('div');
    row.className = 'rating-row';
    row.innerHTML = `<div class="rating-label">${icon} ${label}</div>
      <div class="stars" data-axis="${key}">
        ${[1,2,3,4,5].map(n =>
          `<button class="star ${ratingObj[key] >= n ? 'filled' : ''}" data-val="${n}">★</button>`
        ).join('')}
      </div>`;
    row.querySelectorAll('.star').forEach(btn => {
      btn.addEventListener('click', () => onChange(key, +btn.dataset.val));
    });
    container.appendChild(row);
  });
}

// ─── Util ──────────────────────────────────────────────────────

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\n/g,'<br>');
}

// ─── Beat Manager UI ───────────────────────────────────────────

let _beats = [];           // キャッシュ
// localStorageから前回の選択を復元
const _savedBeatId = localStorage.getItem('selectedBeatId');
let _selectedBeatId = _savedBeatId ? Number(_savedBeatId) : null;

async function loadBeats() {
  _beats = await BeatManager.list();
  renderBeatList('rap');
  renderBeatList('rhyme');
}

function renderBeatList(mode) {
  const listEl = document.getElementById(mode + '-beat-list');
  const noneBtn = document.getElementById(mode + '-beat-none');
  if (!listEl) return;

  if (_beats.length === 0) {
    listEl.innerHTML = '<div class="beat-empty">SunoAIで作った曲を追加してみよう</div>';
  } else {
    listEl.innerHTML = '';
    _beats.forEach(beat => {
      const item = document.createElement('div');
      item.className = 'beat-item' + (_selectedBeatId === beat.id ? ' selected' : '');
      item.dataset.id = beat.id;
      item.innerHTML = `
        <span class="beat-play-icon">${_selectedBeatId === beat.id ? '♪' : '▷'}</span>
        <span class="beat-name">${escHtml(beat.name)}</span>
        <button class="beat-del-btn" data-id="${beat.id}" title="削除">✕</button>
      `;
      item.addEventListener('click', e => {
        if (e.target.classList.contains('beat-del-btn')) return;
        selectBeat(beat.id);
      });
      item.querySelector('.beat-del-btn').addEventListener('click', async e => {
        e.stopPropagation();
        await BeatManager.remove(beat.id);
        if (_selectedBeatId === beat.id) _selectedBeatId = null;
        await loadBeats();
        updateMiniPlayer('rap');
        updateMiniPlayer('rhyme');
      });
      listEl.appendChild(item);
    });
  }

  noneBtn.classList.toggle('active', _selectedBeatId === null);
}

function selectBeat(id) {
  _selectedBeatId = id;
  localStorage.setItem('selectedBeatId', id);
  renderBeatList('rap');
  renderBeatList('rhyme');
}

// アップロード処理（rap/rhyme共通）
// 拡張子からMIMEタイプを推定（iOS Safariはfile.typeが空になることがある）
function guessMime(file) {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop().toLowerCase();
  const map = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
                wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
                webm: 'audio/webm', mp4: 'audio/mp4' };
  return map[ext] || 'audio/mpeg';
}

window.showBeatToast = function showBeatToast(msg) {
  let t = document.getElementById('beat-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'beat-toast';
    Object.assign(t.style, {
      position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
      background:'#1e1e2e', border:'1px solid #444', borderRadius:'10px',
      padding:'10px 20px', fontSize:'.85rem', color:'#f1f5f9',
      zIndex:'9999', pointerEvents:'none', opacity:'0', transition:'opacity .2s'
    });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

async function handleBeatUpload(file) {
  if (!file) return;
  const MAX_MB = 30;
  if (file.size > MAX_MB * 1024 * 1024) {
    alert(`ファイルが大きすぎます（最大${MAX_MB}MB）。`);
    return;
  }
  showBeatToast('⏳ 追加中…');
  try {
    const buf = await file.arrayBuffer();
    const name = file.name.replace(/\.[^.]+$/, '');
    const mime = guessMime(file);
    const newId = await BeatManager.add(name, buf, mime);
    _selectedBeatId = newId;
    localStorage.setItem('selectedBeatId', newId);
    await loadBeats();
    showBeatToast(`✅ "${name}" を追加・選択しました`);
  } catch (err) {
    console.error('beat upload error:', err);
    showBeatToast('❌ 追加失敗：' + (err.message || err));
  }
}

// ボタンクリック → input.click() でファイルピッカーを開く
document.getElementById('rap-beat-upload-btn').addEventListener('click', () => {
  document.getElementById('rap-beat-upload').click();
});
document.getElementById('rhyme-beat-upload-btn').addEventListener('click', () => {
  document.getElementById('rhyme-beat-upload').click();
});

document.getElementById('rap-beat-upload').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) await handleBeatUpload(file);
});
document.getElementById('rhyme-beat-upload').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) await handleBeatUpload(file);
});

document.getElementById('rap-beat-none').addEventListener('click', () => {
  _selectedBeatId = null;
  localStorage.removeItem('selectedBeatId');
  renderBeatList('rap');
  renderBeatList('rhyme');
});
document.getElementById('rhyme-beat-none').addEventListener('click', () => {
  _selectedBeatId = null;
  localStorage.removeItem('selectedBeatId');
  renderBeatList('rap');
  renderBeatList('rhyme');
});

// ─── Mini Player ──────────────────────────────────────────────

function updateMiniPlayer(mode) {
  const prefix = mode === 'rap' ? '' : 'rhyme-';
  const playerEl   = document.getElementById(prefix + 'mini-player');
  const trackEl    = document.getElementById(prefix + 'mini-track-name');
  const playBtnEl  = document.getElementById(prefix + 'mini-play-btn');
  const volEl      = document.getElementById(prefix + 'mini-vol');

  if (!playerEl) return;

  if (_selectedBeatId === null || BeatManager.currentId !== _selectedBeatId) {
    // 選択なし or 再生してない
    const beat = _beats.find(b => b.id === _selectedBeatId);
    if (beat) {
      playerEl.classList.add('active');
      trackEl.textContent = beat.name;
      playBtnEl.textContent = BeatManager.paused ? '▷' : '⏸';
    } else {
      playerEl.classList.remove('active');
    }
  } else {
    playerEl.classList.add('active');
    const beat = _beats.find(b => b.id === _selectedBeatId);
    if (beat) trackEl.textContent = beat.name;
    playBtnEl.textContent = BeatManager.paused ? '▷' : '⏸';
  }

  volEl.value = Math.round(BeatManager.volume * 100);
}

// ビート状態が変わったらミニプレイヤーを更新
window.addEventListener('beat-update', () => {
  updateMiniPlayer('rap');
  updateMiniPlayer('rhyme');
});

// ミニプレイヤー操作
document.getElementById('mini-play-btn').addEventListener('click', () => BeatManager.toggle());
document.getElementById('mini-vol').addEventListener('input', function() {
  BeatManager.setVolume(this.value / 100);
});
document.getElementById('rhyme-mini-play-btn').addEventListener('click', () => BeatManager.toggle());
document.getElementById('rhyme-mini-vol').addEventListener('input', function() {
  BeatManager.setVolume(this.value / 100);
});

// ─── ビート再生/停止のフック ──────────────────────────────────

// ラップバトル: playing フェーズ開始時にビートを再生
const _origRapUpdate = rapEngine.addEventListener.bind(rapEngine);
rapEngine.addEventListener('update', () => {
  const ph = rapEngine.phase;
  if ((ph === 'playing' || ph === 'generating' || ph === 'speaking') && _selectedBeatId !== null) {
    updateMiniPlayer('rap');
  } else if (ph === 'rating' || ph === 'result' || ph === 'intro' || ph === 'error') {
    if (BeatManager.currentId !== null) {
      BeatManager.stop();
      updateMiniPlayer('rap');
    }
  }
});

// 韻踏み: playing フェーズ開始時にビートを再生
rhymeEngine.addEventListener('update', () => {
  const ph = rhymeEngine.phase;
  if (ph === 'playing') {
    updateMiniPlayer('rhyme');
  } else if (ph === 'rating' || ph === 'result' || ph === 'intro') {
    if (BeatManager.currentId !== null) {
      BeatManager.stop();
      updateMiniPlayer('rhyme');
    }
  }
});

// ホームに戻るときもビートを止める
document.querySelectorAll('.back-home').forEach(btn => {
  btn.addEventListener('click', () => BeatManager.stop());
});

// ─── Init ──────────────────────────────────────────────────────

BeatManager.init().then(() => loadBeats());
showScreen('screen-home');
