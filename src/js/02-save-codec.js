// ==== Save file codec (BRG container) ====
// .sav layout: 16-byte header ("BRG\0", then fields, bytes 12-15 = "ZLIB"), followed by repeated
// chunks of [4 bytes unknown/size][uint32 LE compressed length][zlib data]. The inflated chunks
// concatenate to one UTF-8 JSON document.
// The browser's built-in streams are used so no compression library has to be bundled or downloaded.
/** Inflate a zlib stream using the browser's DecompressionStream('deflate'). Async. */
async function inflateZlib(bytes) {
  const stream = new Blob([ bytes ]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Zlib-compress bytes with CompressionStream('deflate'). Async. */
async function deflateZlib(bytes) {
  const stream = new Blob([ bytes ]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** True if the bytes start with the 'BRG' magic and are at least header length. */
function isBrgSav(bytes) {
  return bytes.length >= 16 && bytes[0] === 66 && bytes[1] === 82 && bytes[2] === 71;
}

/**
 * Parse a BRG .sav into its JSON root object.
 * Verifies the inner 'ZLIB' tag, walks the chunks (stopping at a bad length), inflates and joins them,
 * then parses via parseSaveJsonText. Copies the repair count onto parseBrgSav.lastRepairCount.
 * @param {Uint8Array} bytes
 * @throws if the inner magic is not ZLIB or the JSON is unparseable
 */
async function parseBrgSav(bytes) {
  // DataView honours byteOffset/byteLength so this works even when bytes is a view into a larger buffer.
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const zlibMagic = (new TextDecoder).decode(bytes.slice(12, 16));
  if (zlibMagic !== 'ZLIB') throw new Error(`Unexpected inner magic "${zlibMagic}" (expected "ZLIB")`);
  let offset = 16;
  const outChunks = [];
  while (offset + 8 <= bytes.length) {
    const compLen = dv.getUint32(offset + 4, true);
    offset += 8;
    // A zero or oversized length means a truncated or garbled tail; stop and keep the chunks already read instead of throwing past the end.
    if (compLen <= 0 || offset + compLen > bytes.length) break;
    outChunks.push(await inflateZlib(bytes.slice(offset, offset + compLen)));
    offset += compLen;
  }
  // Join the bytes before decoding: a multi-byte UTF-8 character could be split across a chunk boundary.
  const text = (new TextDecoder).decode(u8concat(outChunks));
  const root = parseSaveJsonText(text);
  parseBrgSav.lastRepairCount = parseSaveJsonText.lastRepairCount;
  return root;
}

/**
 * JSON.parse with a repair fallback: strips a BOM; if parsing fails, escapes raw control characters
 * that appear inside string values (seen in corrupt saves) and retries. The number of repaired
 * characters is stored in parseSaveJsonText.lastRepairCount; rethrows the original error if none.
 */
function parseSaveJsonText(text) {
  parseSaveJsonText.lastRepairCount = 0;
  // JSON.parse rejects a leading byte order mark (U+FEFF).
  if (text.charCodeAt(0) === 65279) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch (err) {
    const {text: fixed, count: count} = escapeControlCharsInJsonStrings(text);
    // Nothing we know how to repair, so surface the real parse error rather than a misleading one.
    if (!count) throw err;
    const root = JSON.parse(fixed);
    console.warn(`parseSaveJsonText: escaped ${count} raw control character(s) inside string values`);
    parseSaveJsonText.lastRepairCount = count;
    return root;
  }
}

/** Heuristic: does this parsed JSON look like a full save dump (has soul plus bodyuser/chr/part/deathbag)? */
// A loose shape check (not a schema): it only needs to tell a real save from some other JSON file before adapting it.
function looksLikeFullDump(root) {
  return !!(root && typeof root === 'object' && root.soul && (root.bodyuser || root.soul.chr || root.part || root.soul.deathbag));
}

/**
 * Scan JSON text and replace raw control characters (<0x20) found inside string literals with \\uXXXX.
 * Tracks string/escape state manually, so structure outside strings is untouched.
 * @returns {{text:string,count:number}}
 */
function escapeControlCharsInJsonStrings(text) {
  // Slices of untouched text are collected and joined once at the end; cheaper than building the string char by char on a large save.
  const out = [];
  let inStr = false, esc = false, count = 0, last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (!inStr) {
      if (c === 34) inStr = true;
      continue;
    }
    if (esc) {
      esc = false;
      continue;
    }
    if (c === 92) {
      esc = true;
      continue;
    }
    if (c === 34) {
      inStr = false;
      continue;
    }
    if (c < 32) {
      out.push(text.slice(last, i), '\\u' + c.toString(16).padStart(4, '0'));
      last = i + 1;
      count++;
    }
  }
  if (!count) return {
    text: text,
    count: 0
  };
  out.push(text.slice(last));
  return {
    text: out.join(''),
    count: count
  };
}

/**
 * Serialize a root object back into a BRG .sav: JSON -> UTF-8 -> single zlib chunk with a 24-byte
 * header (magic 'BRG\0', version 2, JSON length, 'ZLIB', JSON length, compressed length).
 * Async; returns a Uint8Array ready to download.
 */
async function buildBrgSav(rootObj) {
  // Compact JSON (no indentation) and one big chunk: the reader accepts any number of chunks, so there is no need to split the output.
  const jsonBytes = (new TextEncoder).encode(JSON.stringify(rootObj));
  const compressed = await deflateZlib(jsonBytes);
  const header = new Uint8Array(24);
  const hdv = new DataView(header.buffer);
  header.set((new TextEncoder).encode('BRG\0'), 0);
  hdv.setUint32(4, 2, true);
  hdv.setUint32(8, jsonBytes.length, true);
  header.set((new TextEncoder).encode('ZLIB'), 12);
  hdv.setUint32(16, jsonBytes.length, true);
  hdv.setUint32(20, compressed.length, true);
  return u8concat([ header, compressed ]);
}

