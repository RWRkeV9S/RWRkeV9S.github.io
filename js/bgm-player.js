/* ════════════════════════════════════════════════════════════════════
   首页背景音乐播放器
   --------------------------------------------------------------------
   · 只在首页渲染（其他页面直接 return，不产生任何 DOM）
   · 默认是左下角一个 44px 小圆盘，进度用外圈圆环表示，不遮挡正文；
     鼠标移上去才向右展开完整卡片（触屏设备不展开）
   · 进页面先尝试自动播放；被浏览器策略拦下时圆环脉冲提示，
     并在用户第一次点击 / 按键后自动补播
   · 每次进首页都会自动播放；点圆盘在「暂停 / 继续」之间切换
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
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.2v11.6a.9.9 0 0 0 1.38.76l8.9-5.8a.9.9 0 0 0 0-1.52l-8.9-5.8A.9.9 0 0 0 9 6.2z"/></svg>';
  var ICON_PAUSE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 5.6h2.4a.8.8 0 0 1 .8.8v11.2a.8.8 0 0 1-.8.8H8.4a.8.8 0 0 1-.8-.8V6.4a.8.8 0 0 1 .8-.8zm4.8 0h2.4a.8.8 0 0 1 .8.8v11.2a.8.8 0 0 1-.8.8h-2.4a.8.8 0 0 1-.8-.8V6.4a.8.8 0 0 1 .8-.8z"/></svg>';

  /* 圆环半径要和 CSS 里 44px 的 svg 对齐 */
  var RING_R = 20.5;
  var RING_C = 2 * Math.PI * RING_R;

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
      '<button class="bgm-btn" type="button" aria-label="播放">' +
        '<svg class="bgm-ring" viewBox="0 0 44 44" aria-hidden="true">' +
          '<circle class="bgm-ring-track" cx="22" cy="22" r="' + RING_R + '"></circle>' +
          '<circle class="bgm-ring-bar" cx="22" cy="22" r="' + RING_R + '"></circle>' +
        '</svg>' +
        '<img class="bgm-cover" alt="" src="' + CFG.cover + '">' +
        '<span class="bgm-icon">' + ICON_PLAY + '</span>' +
      '</button>' +
      '<div class="bgm-panel">' +
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
      '</div>';

    root.querySelector('.bgm-title').textContent = CFG.title;
    root.querySelector('.bgm-artist').textContent = CFG.artist;

    var $btn = root.querySelector('.bgm-btn');
    var $icon = root.querySelector('.bgm-icon');
    var $ring = root.querySelector('.bgm-ring-bar');
    var $bar = root.querySelector('.bgm-bar');
    var $fill = $bar.querySelector('i');
    var $thumb = $bar.querySelector('b');
    var $time = root.querySelector('.bgm-time');

    $ring.style.strokeDasharray = String(RING_C);
    $ring.style.strokeDashoffset = String(RING_C);

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
      $icon.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
      $btn.setAttribute('aria-label', on ? '暂停' : '播放');
    }

    function setBlocked(on) {
      root.classList.toggle('is-blocked', on);
      if (on) root.dataset.state = 'blocked';
    }

    function setProgress() {
      var d = audio.duration || 0;
      var t = audio.currentTime || 0;
      var pct = d ? (t / d) * 100 : 0;
      /* 圆环 */
      $ring.style.strokeDashoffset = String(RING_C * (1 - pct / 100));
      /* 展开面板里的进度条 */
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
        sessionStorage.setItem('bgm_time', String(audio.currentTime || 0));
      } catch (e) { /* 隐私模式下 sessionStorage 可能不可用 */ }
    }

    function toggle() {
      if (audio.paused) {
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
      e.stopPropagation();
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
    $btn.addEventListener('click', toggle);

    audio.addEventListener('playing', function () {
      setBlocked(false);
      setPlaying(true);
    });

    audio.addEventListener('pause', function () {
      setPlaying(false);
    });

    var lastSave = 0;

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
      setPlaying(false);
      $btn.setAttribute('aria-label', '音频加载失败');
    });

    window.addEventListener('pagehide', function () {
      try { sessionStorage.setItem('bgm_time', String(audio.currentTime || 0)); } catch (e) {}
    });

    /* ── 挂载 ── */
    document.body.appendChild(root);
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

    /* ── 进页面就播（每次进首页都播；点圆盘暂停） ── */
    root.dataset.state = 'loading';
    play();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
