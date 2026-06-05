// beat.js — Suno AIビート管理 + 再生

const BeatManager = (() => {
  const DB_NAME    = 'RapDojoDB';
  const STORE_NAME = 'beats';
  const DB_VERSION = 1;

  let _db  = null;
  let _audio = new Audio();
  let _currentId = null;
  let _blobUrl   = null;

  _audio.loop   = true;
  _audio.volume = 0.25;

  // ─── IndexedDB ───────────────────────────────────────────────

  function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror   = e => rej(e.target.error);
    });
  }

  function tx(mode = 'readonly') {
    return _db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  function idbReq(req) {
    return new Promise((res, rej) => {
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  // ─── Public API ──────────────────────────────────────────────

  async function init() { await openDB(); }

  async function add(name, arrayBuffer, mimeType = 'audio/mpeg') {
    await openDB();
    const record = { name, data: arrayBuffer, mimeType, createdAt: Date.now() };
    const id = await idbReq(tx('readwrite').add(record));
    return id;
  }

  async function list() {
    await openDB();
    return new Promise((res, rej) => {
      const result = [];
      const req = tx().openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          result.push({ id: cursor.value.id, name: cursor.value.name, createdAt: cursor.value.createdAt });
          cursor.continue();
        } else {
          res(result);
        }
      };
      req.onerror = e => rej(e.target.error);
    });
  }

  async function remove(id) {
    await openDB();
    await idbReq(tx('readwrite').delete(id));
    if (_currentId === id) stop();
  }

  async function play(id) {
    await openDB();
    const record = await idbReq(tx().get(id));
    if (!record) return;

    stop(); // 前の再生を止める

    _blobUrl   = URL.createObjectURL(new Blob([record.data], { type: record.mimeType || 'audio/mpeg' }));
    _audio.src = _blobUrl;
    _currentId = id;
    try {
      await _audio.play();
    } catch (e) {
      // autoplay blocked — will start on next user interaction
    }
    return id;
  }

  function stop() {
    _audio.pause();
    _audio.currentTime = 0;
    if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
    _currentId = null;
  }

  function pause() { _audio.pause(); }
  function resume() { _audio.play().catch(() => {}); }
  function toggle() { _audio.paused ? resume() : pause(); }

  function setVolume(v) { _audio.volume = Math.max(0, Math.min(1, v)); }

  // 外から音量変更を監視できるよう
  _audio.onvolumechange = () => window.dispatchEvent(new Event('beat-update'));
  _audio.onplay  = () => window.dispatchEvent(new Event('beat-update'));
  _audio.onpause = () => window.dispatchEvent(new Event('beat-update'));

  return { init, add, list, remove, play, stop, pause, resume, toggle, setVolume,
           get currentId() { return _currentId; },
           get paused()    { return _audio.paused; },
           get volume()    { return _audio.volume; } };
})();
