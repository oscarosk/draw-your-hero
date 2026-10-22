(function () {
  'use strict';
  var id = location.pathname.split('/').pop();
  var $ = function (x) {
    return document.getElementById(x);
  };
  var audio = new Audio();
  var queue = null;

  function sceneUrl(setting, layer, variant) {
    return '/static/scenes/' + setting + '/' + (variant ? 'v' + variant + '/' : '') + layer + (layer === 'sky' ? '.jpg' : '.png');
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function render(book) {
    document.title = book.title + ' · Draw Your Hero';
    $('title').textContent = book.title;
    $('coverHero').src = book.hero.imageUrl;
    $('byline').textContent = 'Starring ' + book.hero.name + ', ' + book.hero.look + '. Drawn and dreamed up by a young storyteller' + (book.bedtime ? ', at bedtime 🌙' : '') + '.';
    var main = $('pages');
    book.pages.forEach(function (p, i) {
      var page = el('section', 'page');
      page.id = 'p' + i;
      var art = el('div', 'art');
      var sky = el('img', 'layer');
      sky.src = sceneUrl(p.setting, 'sky', p.variant);
      sky.alt = '';
      art.appendChild(sky);
      ['far', 'mid', 'front'].forEach(function (l) {
        var img = el('img', 'layer wide');
        img.src = sceneUrl(p.setting, l, p.variant);
        img.alt = '';
        art.appendChild(img);
      });
      if (p.mood && p.mood !== 'day' && ['night', 'space', 'cave'].indexOf(p.setting) < 0) art.appendChild(el('div', 'tint ' + p.mood));
      var side = p.heroSide || 'center';
      var hero = el('img', 'hero ' + side);
      hero.src = book.hero.imageUrl;
      hero.alt = book.hero.name;
      art.appendChild(hero);
      var spot = side === 'left' ? '64%' : side === 'right' ? '12%' : '12%';
      if (p.drawing) {
        var thing = el('img', 'thing');
        thing.src = p.drawing;
        thing.alt = 'drawn by the child';
        thing.style.left = spot;
        art.appendChild(thing);
      } else if (p.props && p.props[0]) {
        var em = el('span', 'emoji', p.props[0]);
        em.style.left = spot;
        art.appendChild(em);
      }
      page.appendChild(art);
      var words = el('div', 'words');
      var txt = el('p', '', p.text);
      words.appendChild(txt);
      if (p.audioUrl) {
        var b = el('button', 'play', '▶');
        b.setAttribute('aria-label', 'Read page ' + (i + 1) + ' aloud');
        b.onclick = function () {
          queue = null;
          playPage(i);
        };
        words.appendChild(b);
      }
      page.appendChild(words);
      main.appendChild(page);
    });
    $('endLine').textContent = book.hero.name + ' can’t wait for the next adventure.';
    $('theend').hidden = false;
    if (!book.pages.some(function (p) {
      return p.audioUrl;
    })) $('playAll').hidden = true;

    function playPage(i) {
      var p = book.pages[i];
      document.querySelectorAll('.page.playing').forEach(function (n) {
        n.classList.remove('playing');
      });
      if (!p || !p.audioUrl) return;
      var node = $('p' + i);
      node.classList.add('playing');
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      audio.src = p.audioUrl;
      audio.play().catch(function () {});
      audio.onended = function () {
        node.classList.remove('playing');
        if (queue !== null) {
          queue = i + 1;
          if (queue < book.pages.length) playPage(queue);
          else queue = null;
        }
      };
    }
    $('playAll').onclick = function () {
      queue = 0;
      playPage(0);
    };
  }

  $('saveBtn').onclick = function () {
    window.print();
  };
  if (navigator.share) {
    $('shareBtn').hidden = false;
    $('shareBtn').onclick = function () {
      navigator.share({ title: document.title, text: 'A story my child made up with Draw Your Hero', url: location.href }).catch(function () {});
    };
  }

  fetch('/api/books/' + id)
    .then(function (r) {
      if (!r.ok) throw new Error('gone');
      return r.json();
    })
    .then(render)
    .catch(function () {
      $('title').textContent = 'This storybook could not be opened';
      $('byline').textContent = 'Storybooks are kept for 24 hours. Make a new story on the TV any time!';
    });
})();
