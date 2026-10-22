/*
 * Cuts a child's drawing out of a photo of white paper, entirely on the phone.
 *
 * 1. Estimate the paper's brightness across the photo (so shadows and uneven
 *    light don't count as ink).
 * 2. Mark "ink": pixels clearly darker than the paper, or clearly coloured.
 * 3. Drop dust specks and the table/edge around the paper.
 * 4. Close small gaps in outlines, then keep everything the outside can't
 *    reach, so un-coloured areas inside an outline stay part of the hero.
 * 5. Add a white sticker border and crop.
 *
 * Exposes window.cutoutDrawing(file) -> Promise<{ canvas, ok }>.
 */
(function () {
  'use strict';

  var MAX_SIDE = 1000;

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        resolve(img);
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1000);
      };
      img.onerror = function () {
        reject(new Error('Could not read that photo.'));
      };
      img.src = url;
    });
  }

  // Two-pass chamfer (3-4) distance transform from "on" pixels. Returns
  // distances in units where 3 = one pixel step.
  function distanceFrom(mask, w, h) {
    var INF = 1 << 28;
    var d = new Int32Array(w * h);
    var i, x, y, v;
    for (i = 0; i < w * h; i++) d[i] = mask[i] ? 0 : INF;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        v = d[i];
        if (v === 0) continue;
        if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
        if (y > 0) {
          if (d[i - w] + 3 < v) v = d[i - w] + 3;
          if (x > 0 && d[i - w - 1] + 4 < v) v = d[i - w - 1] + 4;
          if (x < w - 1 && d[i - w + 1] + 4 < v) v = d[i - w + 1] + 4;
        }
        d[i] = v;
      }
    }
    for (y = h - 1; y >= 0; y--) {
      for (x = w - 1; x >= 0; x--) {
        i = y * w + x;
        v = d[i];
        if (v === 0) continue;
        if (x < w - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
        if (y < h - 1) {
          if (d[i + w] + 3 < v) v = d[i + w] + 3;
          if (x < w - 1 && d[i + w + 1] + 4 < v) v = d[i + w + 1] + 4;
          if (x > 0 && d[i + w - 1] + 4 < v) v = d[i + w - 1] + 4;
        }
        d[i] = v;
      }
    }
    return d;
  }

  function dilate(mask, w, h, radius) {
    var d = distanceFrom(mask, w, h);
    var out = new Uint8Array(w * h);
    var limit = radius * 3;
    for (var i = 0; i < w * h; i++) out[i] = d[i] <= limit ? 1 : 0;
    return out;
  }

  /** Returns a mask of the paper sheet (shrunk a little from its edge), or null if no clear sheet. */
  function findSheet(L, S, w, h, paperLevel) {
    var n = w * h;
    var paper = new Uint8Array(n);
    for (var i = 0; i < n; i++) paper[i] = L[i] >= paperLevel * 0.72 && S[i] < 0.22 ? 1 : 0;
    // Largest connected paper area.
    var label = new Int32Array(n);
    var queue = new Int32Array(n);
    var bestLabel = 0,
      bestArea = 0,
      cur = 0;
    for (i = 0; i < n; i++) {
      if (!paper[i] || label[i]) continue;
      cur++;
      var head = 0,
        tail = 0;
      queue[tail++] = i;
      label[i] = cur;
      while (head < tail) {
        var k = queue[head++];
        var kx = k % w,
          ky = (k / w) | 0;
        if (kx > 0 && paper[k - 1] && !label[k - 1]) ((label[k - 1] = cur), (queue[tail++] = k - 1));
        if (kx < w - 1 && paper[k + 1] && !label[k + 1]) ((label[k + 1] = cur), (queue[tail++] = k + 1));
        if (ky > 0 && paper[k - w] && !label[k - w]) ((label[k - w] = cur), (queue[tail++] = k - w));
        if (ky < h - 1 && paper[k + w] && !label[k + w]) ((label[k + w] = cur), (queue[tail++] = k + w));
      }
      if (tail > bestArea) {
        bestArea = tail;
        bestLabel = cur;
      }
    }
    if (bestArea < n * 0.15) return null; // close-up with no clear sheet: keep the old behaviour
    // Everything the outside world can reach without crossing the sheet is "off the sheet".
    var off = new Uint8Array(n);
    var h2 = 0,
      t2 = 0;
    function seed(j) {
      if (label[j] !== bestLabel && !off[j]) {
        off[j] = 1;
        queue[t2++] = j;
      }
    }
    for (var x = 0; x < w; x++) {
      seed(x);
      seed((h - 1) * w + x);
    }
    for (var y = 0; y < h; y++) {
      seed(y * w);
      seed(y * w + w - 1);
    }
    while (h2 < t2) {
      var c = queue[h2++];
      var cx = c % w,
        cy = (c / w) | 0;
      if (cx > 0) seed(c - 1);
      if (cx < w - 1) seed(c + 1);
      if (cy > 0) seed(c - w);
      if (cy < h - 1) seed(c + w);
    }
    // Shrink the sheet a little so the shadow/glare along its edge is dropped too.
    var margin = Math.max(4, Math.round(Math.max(w, h) / 60));
    var nearOff = dilate(off, w, h, margin);
    var sheet = new Uint8Array(n);
    for (i = 0; i < n; i++) sheet[i] = nearOff[i] ? 0 : 1;
    return sheet;
  }

  function percentile(arr, p) {
    var sorted = Array.prototype.slice.call(arr).sort(function (a, b) {
      return a - b;
    });
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  }

  function cutout(img) {
    var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    var src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    var sctx = src.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, w, h);
    var data = sctx.getImageData(0, 0, w, h).data;
    var n = w * h;

    // Luminance and saturation per pixel.
    var L = new Float32Array(n);
    var S = new Float32Array(n);
    for (var i = 0, p = 0; i < n; i++, p += 4) {
      var r = data[p],
        g = data[p + 1],
        b = data[p + 2];
      var mx = Math.max(r, g, b),
        mn = Math.min(r, g, b);
      L[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      S[i] = mx === 0 ? 0 : (mx - mn) / mx;
    }

    // 1. Paper brightness on a coarse grid (bright percentile per cell), then
    //    spread with a 5x5 max so heavily coloured cells borrow nearby paper.
    var G = 24;
    var cw = w / G,
      ch = h / G;
    var cell = new Float32Array(G * G);
    for (var gy = 0; gy < G; gy++) {
      for (var gx = 0; gx < G; gx++) {
        var vals = [];
        var x0 = Math.floor(gx * cw),
          x1 = Math.max(x0 + 1, Math.floor((gx + 1) * cw));
        var y0 = Math.floor(gy * ch),
          y1 = Math.max(y0 + 1, Math.floor((gy + 1) * ch));
        for (var yy = y0; yy < y1; yy += 2) for (var xx = x0; xx < x1; xx += 2) vals.push(L[yy * w + xx]);
        cell[gy * G + gx] = vals.length ? percentile(vals, 0.9) : 255;
      }
    }
    var globalPaper = percentile(cell, 0.7);
    var bgCell = new Float32Array(G * G);
    for (gy = 0; gy < G; gy++) {
      for (gx = 0; gx < G; gx++) {
        var best = 0;
        for (var dy = -2; dy <= 2; dy++)
          for (var dx = -2; dx <= 2; dx++) {
            var ny = gy + dy,
              nx = gx + dx;
            if (ny >= 0 && ny < G && nx >= 0 && nx < G) best = Math.max(best, cell[ny * G + nx]);
          }
        bgCell[gy * G + gx] = Math.max(best, globalPaper * 0.7);
      }
    }
    function bgAt(x, y) {
      var fx = Math.min(G - 1.001, Math.max(0, x / cw - 0.5));
      var fy = Math.min(G - 1.001, Math.max(0, y / ch - 0.5));
      var ix = Math.floor(fx),
        iy = Math.floor(fy);
      var tx = fx - ix,
        ty = fy - iy;
      var a = bgCell[iy * G + ix],
        b2 = bgCell[iy * G + ix + 1];
      var c = bgCell[(iy + 1) * G + ix],
        d2 = bgCell[(iy + 1) * G + ix + 1];
      return (a * (1 - tx) + b2 * tx) * (1 - ty) + (c * (1 - tx) + d2 * tx) * ty;
    }

    // 2. Ink mask.
    var ink = new Uint8Array(n);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        i = y * w + x;
        var bg = bgAt(x, y);
        var diff = bg - L[i];
        if (diff > Math.max(22, bg * 0.14) || (S[i] > 0.28 && diff > 6) || S[i] > 0.42) ink[i] = 1;
      }
    }

    // 2b. Find the sheet of paper: the biggest bright, colourless area, plus
    //     everything it surrounds (the drawing). Anything outside it (the
    //     table, a lamp's glare, a hand, the shadow along the paper's edge)
    //     is not part of the drawing.
    var onSheet = findSheet(L, S, w, h, globalPaper);
    if (onSheet) for (i = 0; i < n; i++) if (!onSheet[i]) ink[i] = 0;

    // 3. Remove specks and large regions hugging the photo edge (table, hands).
    var label = new Int32Array(n);
    var queue = new Int32Array(n);
    var minArea = Math.max(30, Math.round(n * 0.0008));
    var current = 0;
    for (i = 0; i < n; i++) {
      if (!ink[i] || label[i]) continue;
      current++;
      var head = 0,
        tail = 0;
      queue[tail++] = i;
      label[i] = current;
      var area = 0,
        minX = w,
        maxX = 0,
        minY = h,
        maxY = 0,
        touches = false;
      while (head < tail) {
        var k = queue[head++];
        area++;
        var kx = k % w,
          ky = (k / w) | 0;
        if (kx < minX) minX = kx;
        if (kx > maxX) maxX = kx;
        if (ky < minY) minY = ky;
        if (ky > maxY) maxY = ky;
        if (kx === 0 || ky === 0 || kx === w - 1 || ky === h - 1) touches = true;
        for (var oy = -1; oy <= 1; oy++)
          for (var ox = -1; ox <= 1; ox++) {
            var qx = kx + ox,
              qy = ky + oy;
            if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
            var q = qy * w + qx;
            if (ink[q] && !label[q]) {
              label[q] = current;
              queue[tail++] = q;
            }
          }
      }
      var edgeJunk = touches && (maxX - minX > w * 0.6 || maxY - minY > h * 0.6);
      if (area < minArea || edgeJunk) {
        for (var t = 0; t < tail; t++) ink[queue[t]] = 0;
      }
    }

    // 4. Close gaps in outlines, then flood the outside from the border.
    var gap = Math.max(3, Math.round(Math.max(w, h) / 200));
    var barrier = dilate(ink, w, h, gap);
    var outside = new Uint8Array(n);
    var head2 = 0,
      tail2 = 0;
    function seed(idx) {
      if (!barrier[idx] && !outside[idx]) {
        outside[idx] = 1;
        queue[tail2++] = idx;
      }
    }
    for (x = 0; x < w; x++) {
      seed(x);
      seed((h - 1) * w + x);
    }
    for (y = 0; y < h; y++) {
      seed(y * w);
      seed(y * w + w - 1);
    }
    while (head2 < tail2) {
      var c2 = queue[head2++];
      var cx = c2 % w,
        cy = (c2 / w) | 0;
      if (cx > 0) seed(c2 - 1);
      if (cx < w - 1) seed(c2 + 1);
      if (cy > 0) seed(c2 - w);
      if (cy < h - 1) seed(c2 + w);
    }
    var inside = new Uint8Array(n);
    var insideCount = 0;
    for (i = 0; i < n; i++) {
      if (!outside[i]) {
        inside[i] = 1;
        insideCount++;
      }
    }

    var ok = insideCount > n * 0.01 && insideCount < n * 0.92;
    if (!ok) {
      // Couldn't find a clear drawing: fall back to the whole photo.
      for (i = 0; i < n; i++) inside[i] = 1;
    }

    // 5. Sticker border and soft edge.
    var border = Math.max(6, Math.round(Math.max(w, h) / 70));
    var sticker = ok ? dilate(inside, w, h, border) : inside;

    var bx0 = w,
      by0 = h,
      bx1 = 0,
      by1 = 0;
    for (y = 0; y < h; y++)
      for (x = 0; x < w; x++)
        if (sticker[y * w + x]) {
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
    var pad = 4;
    bx0 = Math.max(0, bx0 - pad);
    by0 = Math.max(0, by0 - pad);
    bx1 = Math.min(w - 1, bx1 + pad);
    by1 = Math.min(h - 1, by1 + pad);
    var ow = bx1 - bx0 + 1,
      oh = by1 - by0 + 1;

    var out = document.createElement('canvas');
    out.width = ow;
    out.height = oh;
    var octx = out.getContext('2d');
    var outImg = octx.createImageData(ow, oh);
    var od = outImg.data;
    for (y = 0; y < oh; y++) {
      for (x = 0; x < ow; x++) {
        var si = (y + by0) * w + (x + bx0);
        var di = (y * ow + x) * 4;
        if (inside[si]) {
          var sp = si * 4;
          // Clean paper inside the drawing to an even warm white.
          var paperLike = !ink[si] && L[si] > globalPaper * 0.8 && S[si] < 0.18;
          if (paperLike) {
            od[di] = 255;
            od[di + 1] = 253;
            od[di + 2] = 246;
          } else {
            od[di] = data[sp];
            od[di + 1] = data[sp + 1];
            od[di + 2] = data[sp + 2];
          }
          od[di + 3] = 255;
        } else if (sticker[si]) {
          od[di] = 255;
          od[di + 1] = 255;
          od[di + 2] = 255;
          od[di + 3] = 255;
        } else {
          od[di + 3] = 0;
        }
      }
    }
    // Areas a child could colour in: the empty paper inside the drawing,
    // split into separate regions by the drawn lines (body, eyes, hat…).
    var fill = new Int32Array(ow * oh);
    var areas = [0];
    var fq = new Int32Array(ow * oh);
    var regionCount = 0;
    if (ok) {
      for (y = 0; y < oh; y++)
        for (x = 0; x < ow; x++) {
          var fi = y * ow + x;
          var srcI = (y + by0) * w + (x + bx0);
          fill[fi] = inside[srcI] && !ink[srcI] && L[srcI] > globalPaper * 0.8 && S[srcI] < 0.18 ? -1 : 0;
        }
      for (i = 0; i < ow * oh; i++) {
        if (fill[i] !== -1) continue;
        regionCount++;
        var fh = 0,
          ft = 0,
          rim = false;
        fq[ft++] = i;
        fill[i] = regionCount;
        while (fh < ft) {
          var fk = fq[fh++];
          var fx = fk % ow,
            fy = (fk / ow) | 0;
          // Touching the area outside the drawing: it's the sliver between the
          // outline and the sticker border, not a part to colour in.
          var sxi = fy + by0,
            syi = fx + bx0;
          if (fx === 0 || fy === 0 || fx === ow - 1 || fy === oh - 1 || !inside[(sxi - 1) * w + syi] || !inside[(sxi + 1) * w + syi] || !inside[sxi * w + syi - 1] || !inside[sxi * w + syi + 1]) rim = true;
          if (fx > 0 && fill[fk - 1] === -1) ((fill[fk - 1] = regionCount), (fq[ft++] = fk - 1));
          if (fx < ow - 1 && fill[fk + 1] === -1) ((fill[fk + 1] = regionCount), (fq[ft++] = fk + 1));
          if (fy > 0 && fill[fk - ow] === -1) ((fill[fk - ow] = regionCount), (fq[ft++] = fk - ow));
          if (fy < oh - 1 && fill[fk + ow] === -1) ((fill[fk + ow] = regionCount), (fq[ft++] = fk + ow));
        }
        areas.push(rim ? 0 : ft);
      }
    }
    var base = new Uint8ClampedArray(od);

    // 3x3 alpha blur for a smooth sticker edge.
    var alpha = new Uint8Array(ow * oh);
    for (i = 0; i < ow * oh; i++) alpha[i] = od[i * 4 + 3];
    for (y = 1; y < oh - 1; y++)
      for (x = 1; x < ow - 1; x++) {
        var s = 0;
        for (var ay = -1; ay <= 1; ay++) for (var ax = -1; ax <= 1; ax++) s += alpha[(y + ay) * ow + x + ax];
        od[(y * ow + x) * 4 + 3] = Math.round(s / 9);
      }
    octx.putImageData(outImg, 0, 0);

    // Final size: at most 900px on the long side.
    var fs = Math.min(1, 900 / Math.max(ow, oh));
    function finish(c) {
      if (fs >= 1) return c;
      var fin = document.createElement('canvas');
      fin.width = Math.round(ow * fs);
      fin.height = Math.round(oh * fs);
      fin.getContext('2d').drawImage(c, 0, 0, fin.width, fin.height);
      return fin;
    }
    var alphaBlurred = new Uint8ClampedArray(ow * oh);
    for (i = 0; i < ow * oh; i++) alphaBlurred[i] = od[i * 4 + 3];

    /**
     * Colours the empty areas like a colouring book. `colors` is a list of
     * [r,g,b]: one colour fills the main body; several give each big area its
     * own colour (rainbow). Small areas such as eyes stay white.
     */
    function paint(colors) {
      var c = document.createElement('canvas');
      c.width = ow;
      c.height = oh;
      var cx2 = c.getContext('2d');
      var im = cx2.createImageData(ow, oh);
      var d = im.data;
      d.set(base);
      for (var j = 0; j < ow * oh; j++) d[j * 4 + 3] = alphaBlurred[j];
      if (colors && colors.length && regionCount) {
        var order = [];
        for (var r = 1; r <= regionCount; r++) order.push(r);
        order.sort(function (a, b) {
          return areas[b] - areas[a];
        });
        var biggest = areas[order[0]];
        var colorOf = {};
        var used = 0;
        order.forEach(function (r) {
          if (areas[r] < biggest * 0.06 || areas[r] < 40) return; // eyes, tiny gaps: keep white
          colorOf[r] = colors[colors.length === 1 ? 0 : used++ % colors.length];
        });
        for (j = 0; j < ow * oh; j++) {
          var col = colorOf[fill[j]];
          if (!col) continue;
          // A touch of the paper's texture so it looks coloured-in, not printed.
          var shade = 0.88 + 0.12 * (base[j * 4] / 255);
          d[j * 4] = col[0] * shade;
          d[j * 4 + 1] = col[1] * shade;
          d[j * 4 + 2] = col[2] * shade;
        }
      }
      cx2.putImageData(im, 0, 0);
      return finish(c);
    }

    // The paper photo (small JPEG) and where the cut-out sits in it, so the TV
    // can show the drawing peeling off the page.
    var ps = Math.min(1, 720 / Math.max(w, h));
    var photo = document.createElement('canvas');
    photo.width = Math.round(w * ps);
    photo.height = Math.round(h * ps);
    photo.getContext('2d').drawImage(src, 0, 0, photo.width, photo.height);
    var crop = [bx0 / w, by0 / h, ow / w, oh / h];

    return { canvas: finish(out), ok: ok, paint: paint, colorable: ok && regionCount > 0, photo: photo, crop: crop, photoAspect: w / h };
  }

  window.cutoutDrawing = function (file) {
    return loadImage(file).then(cutout);
  };
})();
