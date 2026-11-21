// Fast drop-in for csv-reader 1.0.0 (make.fun's own reference program): run(input) returns
// exactly csv-reader's answer {columns, rows, errors} for every input {text, header}.
//
// Semantics, copied from the reference (vendor/csv-reader/index.js in the kit):
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it
//     one quote and each CRLF or lone CR inside it read as LF; what follows its closing quote,
//     up to the next comma or line break, is appended as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character, and the text after it is read
//     again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings;
//   - columns is the first record when header is true, else null; rows holds the records after
//     it, each padded (short_row, with fields: its field count) or cut (long_row, with extra:
//     the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met; line is the 1-based line its record
//     starts on, row its record's index in rows (null for the header).
//
// Speed: the reference walks one character at a time and builds every field by +=. This
// reader instead jumps with indexOf/slice: a record with no quote before its line end is
// split in one C++ split(',') call, an unquoted field is one slice, and a quoted field jumps
// from quote to quote. Stray CRs, doubled quotes and quoted line breaks take a slow path
// that runs only where they occur. Field results travel in closure variables, not in a
// fresh object per field. Pure: nothing is kept from one call to the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and (for the junk after a closing quote)
  // how many characters the unquoted tail kept.
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // `s` with every stray CR dropped, one stray_cr error each. Only called when s holds a CR.
  function cleanField(s) {
    let out = '';
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) === 13) {
        pushError('stray_cr');
        out += s.slice(start, i);
        start = i + 1;
      }
    }
    return out + s.slice(start);
  }

  // How many LFs `s` holds.
  function countLF(s) {
    let c = 0;
    let i = -1;
    while ((i = s.indexOf('\n', i + 1)) !== -1) c++;
    return c;
  }

  // Reads unquoted characters from pos up to the next comma or line break. `lineEnd` is the
  // index of the next LF at or after pos, or -1 when there is none: the field ends at the
  // first comma or at lineEnd. `init` is the value it starts from ('' for a plain field, the
  // quoted value for the junk after a closing quote). Sets fValue, fEnded, fAdded.
  function readUnquoted(init, lineEnd) {
    const iComma = text.indexOf(',', pos);
    let end;
    let ended;
    if (lineEnd === -1) {
      if (iComma === -1) {
        end = n;
        ended = END;
      } else {
        end = iComma;
        ended = COMMA;
      }
    } else if (iComma !== -1 && iComma < lineEnd) {
      end = iComma;
      ended = COMMA;
    } else {
      end = lineEnd;
      ended = LINE_BREAK;
    }
    // A CR right before the LF is the CRLF half, not a stray CR.
    let segEnd = end;
    if (ended === LINE_BREAK && end > pos && text.charCodeAt(end - 1) === 13) segEnd = end - 1;
    let value = init;
    let added = 0;
    if (segEnd > pos) {
      const raw = text.slice(pos, segEnd);
      if (raw.indexOf('\r') === -1) {
        value = init + raw;
        added = raw.length;
      } else {
        const cleaned = cleanField(raw);
        value = init + cleaned;
        added = cleaned.length;
      }
    }
    if (ended === COMMA) pos = end + 1;
    else if (ended === LINE_BREAK) {
      pos = end + 1;
      line += 1;
    } else {
      pos = n;
    }
    fValue = value;
    fEnded = ended;
    fAdded = added;
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue, fEnded, fAdded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos = open + 1;
    let value = '';
    let segStart = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is read
        // again as unquoted.
        line = openLine;
        pos = open + 1;
        pushError('unterminated_quote');
        readUnquoted('"', text.indexOf('\n', pos));
        return;
      }
      const seg = text.slice(segStart, q);
      if (seg.indexOf('\n') !== -1 || seg.indexOf('\r') !== -1) {
        // Each CRLF or lone CR inside quotes is one LF.
        const t = seg.replace(/\r\n?/g, '\n');
        line += countLF(t);
        value += t;
      } else {
        value += seg;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote.
        value += '"';
        pos = q + 2;
        segStart = pos;
        continue;
      }
      pos = q + 1;
      if (pos >= n) {
        fValue = value;
        fEnded = END;
        fAdded = 0;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fValue = value;
        fEnded = COMMA;
        fAdded = 0;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = 0;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = 0;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the next comma or
      // line break.
      readUnquoted(value, text.indexOf('\n', pos));
      if (fAdded > 0) pushError('quote_junk');
      return;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const iLF = text.indexOf('\n', pos);
    const iQ = text.indexOf('"', pos);
    let fields;
    let lastQuoted;
    if (iQ !== -1 && (iLF === -1 || iQ < iLF)) {
      // The record holds a quote before its line end: read it field by field. Unquoted
      // fields reuse the line end found here until a quoted field (which may span lines)
      // moves past it.
      fields = [];
      let lineEnd = iLF;
      let ended;
      do {
        const quoted = text.charCodeAt(pos) === 34;
        lastQuoted = quoted;
        if (quoted) {
          readQuoted();
          lineEnd = text.indexOf('\n', pos);
        } else {
          readUnquoted('', lineEnd);
        }
        fields.push(fValue);
        ended = fEnded;
      } while (ended === COMMA);
    } else {
      // No quote before the line end: split the whole record at once.
      lastQuoted = false;
      const lineEnd = iLF === -1 ? n : iLF;
      let segEnd = lineEnd;
      let ended;
      if (iLF === -1) {
        ended = END;
      } else {
        ended = LINE_BREAK;
        if (segEnd > pos && text.charCodeAt(segEnd - 1) === 13) segEnd -= 1; // CRLF
      }
      const seg = text.slice(pos, segEnd);
      if (seg.indexOf('\r') === -1) {
        fields = seg.split(',');
      } else {
        // Rare: stray CRs inside the record; drop them field by field.
        fields = seg.split(',');
        for (let i = 0; i < fields.length; i++) {
          if (fields[i].indexOf('\r') !== -1) fields[i] = cleanField(fields[i]);
        }
      }
      pos = iLF === -1 ? n : iLF + 1;
      if (ended === LINE_BREAK) line += 1;
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr
    // errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
