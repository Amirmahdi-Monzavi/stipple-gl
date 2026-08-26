/**
 * A minimal GIF89a encoder, injected into the page by scripts/record-gif.mjs.
 *
 * It runs in the browser rather than in Node because that is where the pixels
 * already are: shipping sixty frames of raw RGBA over the debug protocol costs
 * tens of megabytes, while shipping one finished GIF costs one.
 *
 * Dependency-free by necessity — the package has no runtime dependencies and
 * this repo has no image tooling installed. Everything here is the GIF spec:
 * a global colour table, one LZW-compressed image per frame, and the Netscape
 * extension that makes it loop.
 */
(() => {
  /** Frequency-ranked palette. The field is a narrow gamut, so this is enough. */
  const buildPalette = (frames, size) => {
    const counts = new Map();
    for (const frame of frames) {
      // Every 4th pixel: a big enough sample, a quarter of the work.
      for (let i = 0; i < frame.length; i += 16) {
        // 5 bits per channel — collapses near-identical blend steps together.
        const key = ((frame[i] >> 3) << 10) | ((frame[i + 1] >> 3) << 5) | (frame[i + 2] >> 3);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, size);
    const palette = new Uint8Array(size * 3);
    ranked.forEach(([key], index) => {
      palette[index * 3] = ((key >> 10) & 31) << 3;
      palette[index * 3 + 1] = ((key >> 5) & 31) << 3;
      palette[index * 3 + 2] = (key & 31) << 3;
    });
    return palette;
  };

  /** Nearest palette entry, cached: most pixels repeat a handful of colours. */
  const makeIndexer = (palette, used) => {
    const cache = new Map();
    return (r, g, b) => {
      const key = (r << 16) | (g << 8) | b;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;

      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < used; i++) {
        const dr = r - palette[i * 3];
        const dg = g - palette[i * 3 + 1];
        const db = b - palette[i * 3 + 2];
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
          if (distance === 0) break;
        }
      }
      cache.set(key, best);
      return best;
    };
  };

  /**
   * LZW as GIF specifies it: variable-width codes, a clear code that resets the
   * dictionary, and an end code. Widths grow as the dictionary fills and reset
   * on a clear, and the decoder derives the same widths, so the two must agree
   * exactly — this is the part worth being pedantic about.
   */
  const lzw = (indices, minCodeSize) => {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;

    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    let dictionary = new Map();

    const out = [];
    let bits = 0;
    let bitCount = 0;

    const emit = (code) => {
      bits |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        out.push(bits & 0xff);
        bits >>= 8;
        bitCount -= 8;
      }
    };

    emit(clearCode);

    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const next = indices[i];
      const key = prefix * 4096 + next;
      const found = dictionary.get(key);

      if (found !== undefined) {
        prefix = found;
        continue;
      }

      emit(prefix);

      if (nextCode < 4096) {
        dictionary.set(key, nextCode);
        nextCode++;
        // Widen once the dictionary outgrows the current width. The decoder
        // widens at the same moment, having built the same dictionary.
        if (nextCode > 1 << codeSize && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        dictionary = new Map();
        nextCode = endCode + 1;
        codeSize = minCodeSize + 1;
      }

      prefix = next;
    }

    emit(prefix);
    emit(endCode);
    if (bitCount > 0) out.push(bits & 0xff);

    return out;
  };

  /** GIF carries compressed data in sub-blocks of at most 255 bytes. */
  const pushSubBlocks = (bytes, data) => {
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      bytes.push(chunk.length, ...chunk);
    }
    bytes.push(0);
  };

  const short = (value) => [value & 0xff, (value >> 8) & 0xff];

  /**
   * @param frames  RGBA Uint8Array per frame, all the same size, top-row first
   * @param delayCs frame delay in hundredths of a second
   */
  window.__encodeGif = (frames, width, height, delayCs, colours = 64) => {
    // A power of two, because the colour table size is stored as an exponent.
    const bits = Math.max(2, Math.min(8, Math.ceil(Math.log2(colours))));
    const count = 1 << bits;

    const palette = buildPalette(frames, count);
    const toIndex = makeIndexer(palette, count);

    const bytes = [];

    // Header and logical screen descriptor.
    for (const ch of 'GIF89a') bytes.push(ch.charCodeAt(0));
    bytes.push(...short(width), ...short(height));
    // Global table present | colour resolution | table size, all as `bits - 1`.
    bytes.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
    bytes.push(...palette);

    // Netscape extension: loop forever.
    bytes.push(0x21, 0xff, 11);
    for (const ch of 'NETSCAPE2.0') bytes.push(ch.charCodeAt(0));
    bytes.push(3, 1, 0, 0, 0);

    for (const frame of frames) {
      const indices = new Uint8Array(width * height);
      for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
        indices[p] = toIndex(frame[i], frame[i + 1], frame[i + 2]);
      }

      // Graphic control extension: delay, no transparency, leave in place.
      bytes.push(0x21, 0xf9, 4, 0, ...short(delayCs), 0, 0);

      // Image descriptor: full frame, no local table, not interlaced.
      bytes.push(0x2c, ...short(0), ...short(0), ...short(width), ...short(height), 0);

      bytes.push(bits); // LZW minimum code size matches the table width
      pushSubBlocks(bytes, lzw(indices, bits));
    }

    bytes.push(0x3b); // trailer
    return new Uint8Array(bytes);
  };
})();
