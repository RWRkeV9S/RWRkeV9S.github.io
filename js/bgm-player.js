/* ════════════════════════════════════════════════════════════════════
   首页背景音乐播放器
   --------------------------------------------------------------------
   · 只在首页渲染（其他页面直接 return，不产生任何 DOM）
   · 形态永远只有左下角一个 44px 小圆环：
       中间是旋转的专辑封面，外圈圆环 = 播放进度，鼠标移上去出现 ▶ / ⏸
     没有展开面板，不遮挡正文
   · 进页面先尝试自动播放；浏览器不允许有声自动播放时，
     退成「静音自动播放」，用户第一次点 / 滚 / 按键就立刻出声
   · 左键 = 暂停 / 从当前位置继续
   · 右键 = 从头开始放（拦掉系统菜单）
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

  /* 圆环半径，和 CSS 里 44px 的 svg 对齐 */
  var RING_R = 20.5;
  var RING_C = 2 * Math.PI * RING_R;

  function init() {
    /* ── DOM：只有一个圆环 ── */
    var root = document.createElement('div');
    root.className = 'bgm-player';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', '背景音乐播放器');
    root.innerHTML =
      '<button class="bgm-btn" type="button" aria-label="播放"' +
        ' title="' + CFG.title + ' / ' + CFG.artist +
        ' · 左键播放或暂停，右键从头播放">' +
        '<svg class="bgm-ring" viewBox="0 0 44 44" aria-hidden="true">' +
          '<circle class="bgm-ring-track" cx="22" cy="22" r="' + RING_R + '"></circle>' +
          '<circle class="bgm-ring-bar" cx="22" cy="22" r="' + RING_R + '"></circle>' +
        '</svg>' +
        '<img class="bgm-cover" alt="" src="' + CFG.cover + '">' +
        '<span class="bgm-icon">' + ICON_PLAY + '</span>' +
      '</button>';

    var $btn = root.querySelector('.bgm-btn');
    var $icon = root.querySelector('.bgm-icon');
    var $ring = root.querySelector('.bgm-ring-bar');

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
      root.dataset.muted = audio.muted ? '1' : '0';
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
      $ring.style.strokeDashoffset = String(RING_C * (1 - pct / 100));
    }

    /* ── 播放控制 ──
       浏览器不允许「有声音的自动播放」。策略：
       1) 先直接 play()——如果浏览器已经允许，就正常出声
       2) 被拒 → 退成静音播放，歌其实已经在走，只是没声音
       3) 用户第一次点 / 滚 / 按键 → 解除静音，声音立刻出来
       4) 连静音都被拒（少数环境）→ 等第一次交互再直接播 */
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
      if (audio.muted) {          /* 还在「静音待启动」，点一下先开声音 */
        unmute();
        return;
      }
      if (audio.paused) {
        play();
      } else {
        pause();
      }
    }

    /* ── 右键：不管现在放到哪，一律回到 0:00 重新放 ── */
    function restart() {
      disarmUnmute();
      root.classList.remove('is-muted-wait');
      audio.muted = false;
      audio.volume = CFG.volume;
      try { audio.currentTime = 0; } catch (e) { /* 元数据还没到，等 loadedmetadata */ }
      if (audio.readyState < 1) {
        var seekZero = function () {
          audio.removeEventListener('loadedmetadata', seekZero);
          try { audio.currentTime = 0; } catch (e) {}
          setProgress();
        };
        audio.addEventListener('loadedmetadata', seekZero);
      }
      setBlocked(false);
      setProgress();
      try { sessionStorage.setItem('bgm_time', '0'); } catch (e) {}
      play();
    }

    /* ── 静音自动播放 + 首次交互解除静音 ── */
    var unmuteEvents = null;

    function disarmUnmute() {
      if (!unmuteEvents) return;
      unmuteEvents.forEach(function (pair) {
        document.removeEventListener(pair[0], pair[1], true);
      });
      unmuteEvents = null;
    }

    function unmute() {
      disarmUnmute();
      root.classList.remove('is-muted-wait');
      if (!audio.muted) return;
      audio.muted = false;
      audio.volume = CFG.volume;
      if (audio.paused) play();
    }

    function armUnmute() {
      if (unmuteEvents) return;
      var events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
      unmuteEvents = events.map(function (name) {
        var handler = function (e) {
          /* 点在圆环自己身上就交给 toggle，别抢 */
          if (root.contains(e.target)) return;
          unmute();
        };
        document.addEventListener(name, handler, true);
        return [name, handler];
      });
    }

    function markMutedWait() {
      root.classList.add('is-muted-wait');
      root.dataset.state = 'muted';
      setPlaying(true);          /* 静音也算在播，圆环照常转 */
      armUnmute();
    }

    function startAutoplay() {
      audio.muted = false;
      var pr = audio.play();
      if (!pr || typeof pr.catch !== 'function') return;
      pr.catch(function () {
        audio.muted = true;
        var pr2 = audio.play();
        if (!pr2 || typeof pr2.catch !== 'function') {
          markMutedWait();
          return;
        }
        pr2.then(markMutedWait, function () {
          audio.muted = false;
          setBlocked(true);
          setPlaying(false);
          armResume();
        });
      });
    }

    /* ── 被拦后：等用户第一次交互再补播 ── */
    var armed = false;
    function armResume() {
      if (armed) return;
      armed = true;
      var events = ['pointerdown', 'keydown', 'touchstart'];
      function handler(e) {
        if (root.contains(e.target)) return;
        events.forEach(function (n) {
          document.removeEventListener(n, handler, true);
        });
        armed = false;
        if (audio.paused) play();
      }
      events.forEach(function (n) {
        document.addEventListener(n, handler, true);
      });
    }

    /* ── 事件 ── */
    /* 长按后浏览器还会补一个 click，用它挡掉，免得刚从头放又被暂停 */
    var longPressed = false;

    $btn.addEventListener('click', function (e) {
      if (longPressed) {
        longPressed = false;
        e.preventDefault();
        return;
      }
      toggle();
    });

    /* 右键从头放：先拦掉浏览器自带的右键菜单 */
    $btn.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      restart();
    });

    /* 触屏：部分环境长按不派发 contextmenu，自己识别一次长按 */
    var pressTimer = null;
    var pressStart = null;

    function cancelPress() {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }

    $btn.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0];
      pressStart = t ? { x: t.clientX, y: t.clientY } : null;
      cancelPress();
      pressTimer = setTimeout(function () {
        pressTimer = null;
        longPressed = true;
        restart();
        setTimeout(function () { longPressed = false; }, 800);
      }, 550);
    }, { passive: true });

    $btn.addEventListener('touchmove', function (e) {
      if (!pressTimer || !pressStart) return;
      var t = e.touches && e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - pressStart.x) > 10 || Math.abs(t.clientY - pressStart.y) > 10) {
        cancelPress();
      }
    }, { passive: true });

    $btn.addEventListener('touchend', cancelPress, { passive: true });
    $btn.addEventListener('touchcancel', cancelPress, { passive: true });

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

    /* ── 进页面就播；清掉旧版留下的「暂停过就别自动播」标记 ── */
    try { sessionStorage.removeItem('bgm_paused'); } catch (e) {}
    startAutoplay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
