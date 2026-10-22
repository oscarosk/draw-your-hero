(function () {
  'use strict';

  var code = (location.pathname.split('/').pop() || '').toUpperCase();
  var ws = null;
  var retry = 0;
  var stage = 'connecting';
  var lastState = null;
  var cutoutCanvas = null;
  var sentThisStage = false;
  var everJoined = false;
  var drawingFor = 'hero'; // or 'prop' when the story asks for a drawing
  var lastCut = null;

  var $ = function (id) {
    return document.getElementById(id);
  };

  function show(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.toggle('active', screens[i].getAttribute('data-screen') === name);
    }
    if (name !== 'talk') stopListening();
  }

  // Little rewards: a buzz and a burst of confetti.
  function buzz(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms || 30);
    } catch (e) {}
  }

  var COLORS = ['#FFD23F', '#FF6B6B', '#2EC4B6', '#B8A9FF', '#FF9F1C', '#FFFFFF'];
  function confetti(count) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var box = $('confetti');
    for (var i = 0; i < (count || 40); i++) {
      var c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = COLORS[i % COLORS.length];
      c.style.setProperty('--x', (Math.random() - 0.5) * 160 + 'px');
      c.style.setProperty('--r', (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540) + 'deg');
      c.style.setProperty('--d', 1.8 + Math.random() * 1.4 + 's');
      c.style.animationDelay = Math.random() * 0.3 + 's';
      if (Math.random() < 0.3) c.style.borderRadius = '50%';
      box.appendChild(c);
    }
    setTimeout(function () {
      box.innerHTML = '';
    }, 3800);
  }

  function setLink(on, text) {
    $('link').classList.toggle('on', on);
    $('linkText').textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws/phone?code=' + encodeURIComponent(code));
    ws.onopen = function () {
      retry = 0;
      setLink(true, 'TV ' + code);
    };
    ws.onmessage = function (ev) {
      var msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (msg.t === 'state') onState(msg);
      if (msg.t === 'state') everJoined = true;
      // The TV may still be reconnecting (e.g. the story service restarted): keep trying.
      if (msg.t === 'error' && everJoined) {
        setLink(false, 'Waiting for the TV…');
        return;
      }
      if (msg.t === 'error') showError(msg.message);
    };
    ws.onclose = function () {
      setLink(false, 'Reconnecting…');
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 500 * retry);
    };
  }

  function sendMsg(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function showError(message) {
    $('errorText').textContent = message || 'Something went wrong.';
    show('error');
  }

  // ---------------------------------------------------------------------------
  // Server state -> screen
  // ---------------------------------------------------------------------------

  function onState(s) {
    var changed = s.stage !== stage || (s.question && (!lastState || !lastState.question || lastState.question.prompt !== s.question.prompt));
    stage = s.stage;
    lastState = s;
    if (changed) sentThisStage = false;

    if (s.heroImageUrl) {
      $('heroThumb').src = s.heroImageUrl;
      $('heroThumb2').src = s.heroImageUrl;
      $('heroThumb3').src = s.heroImageUrl;
    }

    switch (s.stage) {
      case 'waiting-phone':
      case 'need-drawing':
        // Don't yank the child out of the preview they're looking at.
        if (!document.querySelector('[data-screen="preview"].active')) show('need-drawing');
        break;
      case 'reading-drawing':
        show('reading-drawing');
        break;
      case 'need-idea':
        if (sentThisStage) return;
        setupTalk('idea', 'What adventure should ' + (s.heroName || 'your hero') + ' go on?', s.ideaSuggestions || []);
        break;
      case 'question':
        if (sentThisStage) return;
        if (s.question && s.question.kind === 'draw') {
          setupDraw(s.question);
          break;
        }
        drawingFor = 'hero';
        setupTalk('answer', s.question ? s.question.prompt : 'What happens next?', s.question ? s.question.options : []);
        break;
      case 'telling':
        $('tellingText').textContent = 'Your story is being painted…';
        show('telling');
        break;
      case 'done':
        if (changed) confetti(60);
        if (s.bookUrl) {
          $('bookLink').href = s.bookUrl;
          $('bookLink').hidden = false;
          $('bookShare').hidden = !navigator.share;
          $('bookShare').onclick = function () {
            navigator.share({ title: 'Our storybook', text: 'A story made up with Draw Your Hero', url: s.bookUrl }).catch(function () {});
          };
        } else {
          $('bookLink').hidden = true;
          $('bookShare').hidden = true;
        }
        show('done');
        break;
      case 'error':
        showError(s.message);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Talking: idea or answer
  // ---------------------------------------------------------------------------

  var talkKind = 'idea';

  function setupTalk(kind, title, suggestions) {
    talkKind = kind;
    $('talkTitle').textContent = title;
    $('heardText').textContent = '';
    $('typeInput').value = '';
    var chips = $('chips');
    chips.innerHTML = '';
    suggestions.forEach(function (text) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = text;
      b.onclick = function () {
        buzz(15);
        submit(text);
      };
      chips.appendChild(b);
    });
    $('micBtn').hidden = !Recognition;
    $('bedtimeBtn').hidden = kind !== 'idea';
    $('micLabel').textContent = 'Tap and tell me!';
    show('talk');
  }

  var pendingQuestion = null;
  function setupDraw(q) {
    pendingQuestion = q;
    drawingFor = 'prop';
    $('drawTitle').textContent = q.prompt;
    $('drawWhat').textContent = q.drawWhat || 'it';
    buzz([20, 40, 20]);
    show('draw-prop');
  }

  $('sayInsteadBtn').addEventListener('click', function () {
    drawingFor = 'hero';
    var q = pendingQuestion || {};
    setupTalk('answer', q.prompt || 'What happens next?', q.options || []);
  });

  function submit(text) {
    text = (text || '').trim();
    if (!text || sentThisStage) return;
    sentThisStage = true;
    stopListening();
    buzz([20, 40, 20]);
    confetti(36);
    sendMsg(talkKind === 'idea' ? { t: 'idea', text: text, bedtime: bedtime } : { t: talkKind, text: text });
    $('tellingText').textContent = 'You said: “' + text + '”';
    show('telling');
  }

  var bedtime = false;
  $('bedtimeBtn').addEventListener('click', function () {
    bedtime = !bedtime;
    buzz(15);
    this.setAttribute('aria-pressed', String(bedtime));
    this.textContent = bedtime ? '🌙 Bedtime story: ON' : '☀️ Bedtime story: off';
  });

  $('typeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    submit($('typeInput').value);
  });

  // Speech recognition (Chrome / Android / recent Safari). Typing always works too.
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null;
  var listening = false;
  var finalText = '';

  function startListening() {
    if (!Recognition || listening) return;
    rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    finalText = '';
    rec.onresult = function (ev) {
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      $('heardText').textContent = (finalText + ' ' + interim).trim();
    };
    rec.onerror = function (ev) {
      listening = false;
      $('micBtn').classList.remove('listening');
      $('micLabel').textContent = ev.error === 'not-allowed' ? 'Mic blocked: type instead' : 'Tap and try again';
    };
    rec.onend = function () {
      listening = false;
      $('micBtn').classList.remove('listening');
      var said = (finalText || $('heardText').textContent || '').trim();
      if (said) {
        $('micLabel').textContent = 'Sending…';
        setTimeout(function () {
          submit(said);
        }, 700);
      } else {
        $('micLabel').textContent = 'Tap and tell me!';
      }
    };
    try {
      rec.start();
      buzz(25);
      listening = true;
      $('micBtn').classList.add('listening');
      $('micLabel').textContent = "I'm listening…";
      $('heardText').textContent = '';
    } catch (e) {
      listening = false;
    }
  }

  function stopListening() {
    if (rec && listening) {
      try {
        rec.stop();
      } catch (e) {}
    }
  }

  $('micBtn').addEventListener('click', function () {
    if (listening) stopListening();
    else startListening();
  });

  // ---------------------------------------------------------------------------
  // Photo -> cut-out -> upload
  // ---------------------------------------------------------------------------

  function onPhoto(input) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    $('magicHero').removeAttribute('src');
    show('reading-drawing');
    window
      .cutoutDrawing(file)
      .then(function (res) {
        cutoutCanvas = res.canvas;
        lastCut = res;
        showPreview(res.canvas);
        setupPaint(res);
        $('previewTitle').textContent = drawingFor === 'prop' ? 'Is this your drawing?' : 'Is this your hero?';
        $('useBtn').textContent = drawingFor === 'prop' ? '✨ Put it in the story!' : '✨ Bring it to life!';
        show('preview');
      })
      .catch(function (e) {
        showError(e.message);
      });
  }

  function showPreview(canvas) {
    var pc = $('previewCanvas');
    pc.width = canvas.width;
    pc.height = canvas.height;
    pc.getContext('2d').drawImage(canvas, 0, 0);
  }

  // "Colour it!": tap a colour to fill the empty parts of the drawing.
  var SWATCHES = [
    ['#FF6B6B', [255, 107, 107]],
    ['#FF9F1C', [255, 159, 28]],
    ['#FFD23F', [255, 210, 63]],
    ['#7BD96B', [123, 217, 107]],
    ['#2EC4B6', [46, 196, 182]],
    ['#4D96FF', [77, 150, 255]],
    ['#B8A9FF', [184, 169, 255]],
    ['#FF8FCF', [255, 143, 207]],
  ];
  var RAINBOW = [[255, 107, 107], [255, 210, 63], [46, 196, 182], [77, 150, 255], [184, 169, 255], [255, 159, 28]];
  function setupPaint(res) {
    var row = $('paintRow');
    var box = $('swatches');
    box.innerHTML = '';
    row.hidden = !res.colorable;
    if (!res.colorable) return;
    function add(cls, bg, label, colors) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch ' + cls;
      if (bg) b.style.background = bg;
      b.setAttribute('aria-label', label);
      if (cls === 'none') b.textContent = '↺';
      b.onclick = function () {
        buzz(12);
        var all = box.querySelectorAll('.swatch');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('on');
        b.classList.add('on');
        cutoutCanvas = colors ? res.paint(colors) : res.canvas;
        showPreview(cutoutCanvas);
      };
      box.appendChild(b);
    }
    add('none', '', 'No colour', null);
    SWATCHES.forEach(function (sw) {
      add('', sw[0], 'Colour ' + sw[0], [sw[1]]);
    });
    add('rainbow', '', 'Rainbow', RAINBOW);
  }

  ['cameraInput', 'galleryInput', 'newHeroInput'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      drawingFor = 'hero';
      onPhoto(this);
    });
  });
  ['propCameraInput', 'propGalleryInput'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      drawingFor = 'prop';
      onPhoto(this);
    });
  });

  $('retakeBtn').addEventListener('click', function () {
    show(drawingFor === 'prop' ? 'draw-prop' : 'need-drawing');
  });

  // A 16x16 silhouette of the drawing (256 bits as hex) so the story service can
  // recognise the same hero next time. Only this pattern is compared, never the photo.
  function fingerprint(canvas) {
    try {
      var c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      var g = c.getContext('2d');
      g.drawImage(canvas, 0, 0, 16, 16);
      var d = g.getImageData(0, 0, 16, 16).data;
      var hex = '';
      for (var i = 0; i < 256; i += 4) {
        var nib = 0;
        for (var k = 0; k < 4; k++) nib = (nib << 1) | (d[(i + k) * 4 + 3] > 96 ? 1 : 0);
        hex += nib.toString(16);
      }
      return hex;
    } catch (e) {
      return undefined;
    }
  }

  $('useBtn').addEventListener('click', function () {
    if (!cutoutCanvas) return;
    var btn = $('useBtn');
    btn.disabled = true;
    buzz([30, 60, 30]);
    $('magicHero').src = cutoutCanvas.toDataURL('image/png');
    $('magicTitle').textContent = drawingFor === 'prop' ? 'Adding it to the story…' : 'Sprinkling some magic…';
    if (drawingFor === 'prop') sentThisStage = true;
    show('reading-drawing');
    fetch('/api/rooms/' + code + '/drawing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        drawingFor === 'hero' && lastCut && lastCut.ok
          ? {
              image: cutoutCanvas.toDataURL('image/png'),
              fingerprint: fingerprint(cutoutCanvas),
              photo: lastCut.photo.toDataURL('image/jpeg', 0.72),
              crop: lastCut.crop,
              photoAspect: lastCut.photoAspect,
            }
          : { image: cutoutCanvas.toDataURL('image/png'), fingerprint: drawingFor === 'hero' ? fingerprint(cutoutCanvas) : undefined },
      ),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
      })
      .catch(function (e) {
        showError(e.message);
      })
      .finally(function () {
        btn.disabled = false;
      });
  });

  // Keep the screen awake while playing, where supported.
  if (navigator.wakeLock) {
    navigator.wakeLock.request('screen').catch(function () {});
  }

  show('connecting');
  connect();
})();
