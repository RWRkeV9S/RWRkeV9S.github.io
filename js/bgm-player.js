/* ════════════════════════════════════════════════════════════════════
   首页背景音乐播放器
   --------------------------------------------------------------------
   · 只在首页渲染（其他页面直接 return，不产生任何 DOM）
   · 进页面先尝试自动播放；被浏览器策略拦下时显示「点我播放」，
     并在用户第一次点击 / 按键后自动补播
   · 手动暂停会记进 sessionStorage，本次会话内不再自动播
   · 离开首页时记住播放位置，回到首页接着放
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    src: '/music/hitchcock.mp3',
    cover: '/music/hitchcock-cover.jpg',
    title: 'ヒッチコック',
    artist: 'ヨルシカ',
    volume: 0.55
  };

  /* ── 只在首页 ── */
  var path = location.pathname;
  if (!(path === '/' || /\/index\.html?$/i.test(path))) return;

  var ICON_PLAY =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.4v13.2a1 1 0 0 0 1.53.85l10.1-6.6a1 1 0 0 0 0-1.7L9.53 4.55A1 1 0 0 0 8 5.4z"/></svg>';
  var ICON_PAUSE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 4.6h3a1 1 0 0 1 1 1v12.8a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5.6a1 1 0 0 1 1-1zm6.6 0h3a1 1 0 0 1 1 1v12.8a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5.6a1 1 0 0 1 1-1z"/></svg>';

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function init() {
    /* ── DOM ── */
    var root = document.createElement('div');
    root.className = 'bgm-player';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', '背景音乐播放器');
    root.innerHTML =
      '<div class="bgm-tip">点我播放 ♪</div>' +
      '<div class="bgm-disc" title="播放 / 暂停"><img alt="" src="' + CFG.cover + '"></div>' +
      '<div class="bgm-info">' +
        '<div class="bgm-head">' +
          '<span class="bgm-title"></span>' +
          '<span class="bgm-dot"></span>' +
          '<span class="bgm-artist"></span>' +
        '</div>' +
        '<div class="bgm-foot">' +
          '<div class="bgm-bar" role="slider" tabindex="0" aria-label="播放进度"' +
            ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
            '<i></i><b></b>' +
          '</div>' +
          '<span class="bgm-time">0:00 / 0:00</span>' +
        '</div>' +
      '</div>' +
      '<button class="bgm-toggle" type="button" aria-label="播放">' + ICON_PLAY + '</button>';

    root.querySelector('.bgm-title').textContent = CFG.title;
    root.querySelector('.bgm-artist').textContent = CFG.artist;

    var $disc = root.querySelector('.bgm-disc');
    var $bar = root.querySelector('.bgm-bar');
    var $fill = $bar.querySelector('i');
    var $thumb = $bar.querySelector('b');
    var $time = root.querySelector('.bgm-time');
    var $toggle = root.querySelector('.bgm-toggle');
    var $tip = root.querySelector('.bgm-tip');

    /* ── audio ── */
    var audio = new Audio();
    audio.src = CFG.src;
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = CFG.volume;

    /* ── 状态 ── */
    function setPlaying(on) {
      root.classList.toggle('is-playing', on);
      root.dataset.state = on ? 'playing' : 'paused';
      $toggle.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
      $toggle.setAttribute('aria-label', on ? '暂停' : '播放');
    }

    function setBlocked(on) {
      root.classList.toggle('is-blocked', on);
      if (on) root.dataset.state = 'blocked';
    }

    function setProgress() {
      var d = audio.duration || 0;
      var t = audio.currentTime || 0;
      var pct = d ? (t / d) * 100 : 0;
      $fill.style.width = pct + '%';
      $thumb.style.left = pct + '%';
      $time.textContent = fmtTime(t) + ' / ' + fmtTime(d);
      $bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    /* ── 播放控制 ── */
    function play() {
      var pr = audio.play();
      if (pr && typeof pr.catch === 'function') {
        pr.catch(function () {
          setBlocked(true);
          setPlaying(false);
          armResume();
        });
      }
    }

    function pause() {
      audio.pause();
      try {
        sessionStorage.setItem('bgm_paused', '1');
        sessionStorage.setItem('bgm_time', String(audio.currentTime || 0));
      } catch (e) { /* 隐私模式下 sessionStorage 可能不可用 */ }
    }

    function toggle() {
      if (audio.paused) {
        try { sessionStorage.removeItem('bgm_paused'); } catch (e) {}
        play();
      } else {
        pause();
      }
    }

    /* ── 被拦后：等用户第一次交互再补播 ── */
    var armed = false;
    function armResume() {
      if (armed) return;
      armed = true;
      var events = ['pointerdown', 'keydown', 'touchstart'];
      function handler() {
        events.forEach(function (e) {
          document.removeEventListener(e, handler, true);
        });
        armed = false;
        if (audio.paused) play();
      }
      events.forEach(function (e) {
        document.addEventListener(e, handler, true);
      });
    }

    /* ── 进度条拖动 / 点击 ── */
    function seekTo(clientX) {
      var r = $bar.getBoundingClientRect();
      if (!r.width) return;
      var pct = (clientX - r.left) / r.width;
      pct = Math.min(1, Math.max(0, pct));
      if (audio.duration) {
        audio.currentTime = pct * audio.duration;
        setProgress();
      }
    }

    $bar.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      seekTo(e.clientX);
      if ($bar.setPointerCapture) {
        try { $bar.setPointerCapture(e.pointerId); } catch (err) {}
      }
      var onMove = function (ev) { seekTo(ev.clientX); };
      var onUp = function () {
        $bar.removeEventListener('pointermove', onMove);
        $bar.removeEventListener('pointerup', onUp);
        $bar.removeEventListener('pointercancel', onUp);
      };
      $bar.addEventListener('pointermove', onMove);
      $bar.addEventListener('pointerup', onUp);
      $bar.addEventListener('pointercancel', onUp);
    });

    $bar.addEventListener('keydown', function (e) {
      var step = 0;
      if (e.key === 'ArrowLeft') step = -5;
      else if (e.key === 'ArrowRight') step = 5;
      else if (e.key === 'Home') { audio.currentTime = 0; setProgress(); return; }
      else return;
      e.preventDefault();
      audio.currentTime = Math.min(audio.duration || 0, Math.max(0, audio.currentTime + step));
      setProgress();
    });

    /* ── 事件 ── */
    $toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    $disc.addEventListener('click', toggle);

    audio.addEventListener('playing', function () {
      setBlocked(false);
      setPlaying(true);
    });

    audio.addEventListener('pause', function () {
      setPlaying(false);
    });

    audio.addEventListener('timeupdate', function () {
      setProgress();
      var now = Date.now();
      if (now - lastSave > 2000) {
        lastSave = now;
        try { sessionStorage.setItem('bgm_time', String(audio.currentTime || 0)); } catch (e) {}
      }
    });

    audio.addEventListener('loadedmetadata', setProgress);
    audio.addEventListener('error', function () {
      root.dataset.state = 'error';
      $tip.textContent = '音频加载失败';
      setBlocked(true);
    });

    var lastSave = 0;

    window.addEventListener('pagehide', function () {
      try { sessionStorage.setItem('bgm_time', String(audio.currentTime || 0)); } catch (e) {}
    });

    /* ── 挂载 ── */
    document.body.appendChild(root);
    requestAnimationFrame(function () {
      root.classList.add('is-ready');
    });
    setProgress();

    /* ── 接着上次的位置 ── */
    var saved = 0;
    try { saved = parseFloat(sessionStorage.getItem('bgm_time') || '0'); } catch (e) {}
    if (saved > 1) {
      var restore = function () {
        audio.removeEventListener('loadedmetadata', restore);
        if (audio.duration && saved < audio.duration - 3) {
          audio.currentTime = saved;
        }
        setProgress();
      };
      audio.addEventListener('loadedmetadata', restore);
    }

    /* ── 进页面就播 ── */
    var wasPaused = false;
    try { wasPaused = sessionStorage.getItem('bgm_paused') === '1'; } catch (e) {}
    if (wasPaused) {
      setPlaying(false);
    } else {
      root.dataset.state = 'loading';
      play();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
