// Minimal MP4 (ISO BMFF) demuxer: just enough to feed the H.264 video track of
// a regular .mp4 file to WebCodecs (sample table, timing and the avcC config).

const fourcc = (dv, p) => String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));

function* boxes(dv, start, end) {
  let p = start;
  while (p + 8 <= end) {
    let size = dv.getUint32(p);
    let header = 8;
    if (size === 1) {
      size = Number(dv.getBigUint64(p + 8));
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header) return;
    yield { type: fourcc(dv, p + 4), start: p + header, end: p + size };
    p += size;
  }
}

const child = (dv, box, type) => {
  for (const b of boxes(dv, box.start, box.end)) if (b.type === type) return b;
  return null;
};

const hex = (n) => n.toString(16).padStart(2, '0');

export function demux(buffer) {
  const dv = new DataView(buffer);
  const moov = [...boxes(dv, 0, buffer.byteLength)].find((b) => b.type === 'moov');
  if (!moov) return null;

  for (const trak of boxes(dv, moov.start, moov.end)) {
    if (trak.type !== 'trak') continue;
    const mdia = child(dv, trak, 'mdia');
    const hdlr = mdia && child(dv, mdia, 'hdlr');
    if (!hdlr || fourcc(dv, hdlr.start + 8) !== 'vide') continue;

    const mdhd = child(dv, mdia, 'mdhd');
    const timescale = dv.getUint32(mdhd.start + (dv.getUint8(mdhd.start) === 1 ? 20 : 12));
    const stbl = child(dv, child(dv, mdia, 'minf'), 'stbl');

    // Sample description: only H.264 is handled here (everything else falls back to <video>).
    const stsd = child(dv, stbl, 'stsd');
    const entry = boxes(dv, stsd.start + 8, stsd.end).next().value;
    if (!entry || (entry.type !== 'avc1' && entry.type !== 'avc3')) return null;
    const avcC = child(dv, { start: entry.start + 78, end: entry.end }, 'avcC');
    if (!avcC) return null;
    const description = new Uint8Array(buffer, avcC.start, avcC.end - avcC.start);
    const codec = `avc1.${hex(description[1])}${hex(description[2])}${hex(description[3])}`;

    const stsz = child(dv, stbl, 'stsz');
    const fixedSize = dv.getUint32(stsz.start + 4);
    const count = dv.getUint32(stsz.start + 8);
    const sizes = Array.from({ length: count }, (_, i) => fixedSize || dv.getUint32(stsz.start + 12 + i * 4));

    const co64 = child(dv, stbl, 'co64');
    const stco = co64 || child(dv, stbl, 'stco');
    const chunks = Array.from({ length: dv.getUint32(stco.start + 4) }, (_, i) =>
      co64 ? Number(dv.getBigUint64(stco.start + 8 + i * 8)) : dv.getUint32(stco.start + 8 + i * 4),
    );

    const stsc = child(dv, stbl, 'stsc');
    const runs = Array.from({ length: dv.getUint32(stsc.start + 4) }, (_, i) => ({
      first: dv.getUint32(stsc.start + 8 + i * 12) - 1,
      perChunk: dv.getUint32(stsc.start + 12 + i * 12),
    }));

    const samples = [];
    let run = 0;
    for (let c = 0; c < chunks.length && samples.length < count; c++) {
      while (run + 1 < runs.length && runs[run + 1].first <= c) run++;
      let offset = chunks[c];
      for (let k = 0; k < runs[run].perChunk && samples.length < count; k++) {
        const size = sizes[samples.length];
        samples.push({ offset, size, dts: 0, cts: 0, key: false });
        offset += size;
      }
    }

    const stts = child(dv, stbl, 'stts');
    for (let i = 0, s = 0, t = 0, n = dv.getUint32(stts.start + 4); i < n; i++) {
      const runCount = dv.getUint32(stts.start + 8 + i * 8);
      const delta = dv.getUint32(stts.start + 12 + i * 8);
      for (let k = 0; k < runCount && s < samples.length; k++, s++, t += delta) {
        samples[s].dts = t;
        samples[s].duration = delta;
      }
    }

    const ctts = child(dv, stbl, 'ctts');
    if (ctts) {
      for (let i = 0, s = 0, n = dv.getUint32(ctts.start + 4); i < n; i++) {
        const runCount = dv.getUint32(ctts.start + 8 + i * 8);
        const offset = dv.getInt32(ctts.start + 12 + i * 8);
        for (let k = 0; k < runCount && s < samples.length; k++, s++) samples[s].cts = offset;
      }
    }

    const stss = child(dv, stbl, 'stss');
    if (stss) {
      for (let i = 0, n = dv.getUint32(stss.start + 4); i < n; i++) {
        const s = samples[dv.getUint32(stss.start + 8 + i * 4) - 1];
        if (s) s.key = true;
      }
    } else {
      samples.forEach((s) => (s.key = true));
    }

    return {
      codec,
      description,
      codedWidth: dv.getUint16(entry.start + 24),
      codedHeight: dv.getUint16(entry.start + 26),
      timescale,
      samples,
    };
  }
  return null;
}
