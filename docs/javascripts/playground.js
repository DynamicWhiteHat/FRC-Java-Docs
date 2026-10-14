/*
 * Interactive widgets for the FRC Java course.
 *
 * Turns two kinds of fenced blocks into live widgets:
 *
 *   ```playground      editable Java that runs in the browser (MiniJava),
 *                      optionally a graded challenge, a "predict the output"
 *                      question, or a robot simulator with a virtual controller.
 *   ```quiz            a multiple-choice quiz.
 *
 * Authoring format for `playground` blocks (everything is optional):
 *
 *   //@ title: Count to five            header lines (only before the code)
 *   //@ goal: Print 1 through 5.
 *   //@ mode: predict                   run (default) | predict
 *   //@ prelude: wpilib                 load the fake WPILib
 *   //@ panel: robot                    show the robot simulator
 *   //@ require: for | Use a for loop   regex | message shown if missing
 *   <starter code>
 *   //@@ harness      hidden Java statements appended when checking
 *   //@@ expect       exact output the check must produce
 *   //@@ hint         (repeat) revealed one at a time
 *   //@@ solution     revealed after a failed check
 *   //@@ explain      shown after the challenge is passed
 *   //@@ setup        robot panel: statements run once at start
 *
 * Quiz format:
 *
 *   @ title: Lesson 1 quiz
 *   ? Which type holds 3.14?
 *   | optional code line(s) shown under the question
 *   - int
 *   + double            ("+" = correct; several "+" = pick all that apply)
 *   > Explanation shown after answering.
 */
(function () {
  'use strict';
  var MJ = window.MiniJava;
  if (!MJ) { if (window.console) console.warn('playground.js: MiniJava is missing'); return; }

  /* ================================================================== *
   * small helpers
   * ================================================================== */

  function h(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /* `code`, **bold**, *italic* in short strings written by course authors */
  function inline(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } }
  };
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function trimBlank(lines) {
    var a = 0, b = lines.length;
    while (a < b && !lines[a].trim()) a++;
    while (b > a && !lines[b - 1].trim()) b--;
    return lines.slice(a, b).join('\n');
  }
  function norm(s) {
    return String(s).replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join('\n').replace(/^\n+|\n+$/g, '');
  }

  /* ================================================================== *
   * progress (stored in this browser only)
   * ================================================================== */

  var pageKey = 'frcjava:' + location.pathname.replace(/index\.html$/, '');
  var progress = { total: 0, done: 0, chip: null };
  function progressChip() {
    if (progress.chip) return progress.chip;
    var title = document.querySelector('.md-content__inner h1');
    var chip = h('div', { class: 'mj-progress', role: 'status' }, [
      h('span', { class: 'mj-progress-text' }),
      h('span', { class: 'mj-progress-bar' }, [h('span', { class: 'mj-progress-fill' })])
    ]);
    if (title && title.parentNode) title.parentNode.insertBefore(chip, title.nextSibling);
    progress.chip = chip;
    return chip;
  }
  function renderProgress() {
    if (!progress.total) return;
    var chip = progressChip();
    chip.querySelector('.mj-progress-text').textContent =
      progress.done === progress.total ? 'All ' + progress.total + ' challenges on this page complete.' :
        'Challenges on this page: ' + progress.done + ' of ' + progress.total + ' complete';
    chip.querySelector('.mj-progress-fill').style.width = (100 * progress.done / progress.total) + '%';
    chip.classList.toggle('mj-progress-all', progress.done === progress.total);
  }

  /* ================================================================== *
   * parsing a playground block
   * ================================================================== */

  function parseBlock(text) {
    var lines = text.replace(/\r/g, '').split('\n');
    var meta = {}, secs = { code: [], harness: [], expect: [], solution: [], explain: [], setup: [] }, hints = [];
    var cur = 'code', curHint = null, inHeader = true;
    lines.forEach(function (line) {
      var m = /^\/\/@@\s*([a-z]+)\s*$/.exec(line);
      if (m) {
        cur = m[1];
        if (cur === 'hint') { curHint = []; hints.push(curHint); }
        else if (!secs[cur]) secs[cur] = [];
        return;
      }
      if (cur === 'code' && inHeader) {
        var hm = /^\/\/@\s*([a-z-]+)\s*:\s*(.*)$/.exec(line);
        if (hm) {
          if (hm[1] === 'require') (meta.require = meta.require || []).push(hm[2]);
          else meta[hm[1]] = hm[2];
          return;
        }
        if (line.trim()) inHeader = false;
        else if (!secs.code.length) return;
      }
      if (cur === 'hint') curHint.push(line); else secs[cur].push(line);
    });
    var out = { meta: meta, hints: hints.map(trimBlank) };
    Object.keys(secs).forEach(function (k) { out[k] = trimBlank(secs[k]); });
    return out;
  }

  /* ================================================================== *
   * the code editor (a textarea on top of a highlighted <pre>)
   * ================================================================== */

  var KEYWORDS = /^(abstract|assert|boolean|break|byte|case|catch|char|class|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|new|package|private|protected|public|return|short|static|super|switch|this|throw|throws|try|void|volatile|while|var|true|false|null)$/;
  var TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(@[A-Za-z_]\w*)|(\b(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDlL]?)\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;

  function highlight(src) {
    var out = '', last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      out += esc(src.slice(last, m.index));
      var t = m[0];
      if (m[1] != null) out += '<span class="mj-c">' + esc(m[1]) + '</span>';
      else if (m[2] != null) out += '<span class="mj-s">' + esc(m[2]) + '</span>';
      else if (m[3] != null) out += '<span class="mj-a">' + esc(m[3]) + '</span>';
      else if (m[4] != null) out += '<span class="mj-n">' + esc(m[4]) + '</span>';
      else {
        var id = m[5];
        if (KEYWORDS.test(id)) out += '<span class="mj-k">' + id + '</span>' + esc(m[6] || '');
        else if (m[6]) out += '<span class="mj-f">' + id + '</span>' + esc(m[6]);
        else if (/^[A-Z]/.test(id)) out += '<span class="mj-t">' + id + '</span>';
        else out += esc(id);
      }
      last = m.index + t.length;
      if (t.length === 0) TOKEN.lastIndex++;
    }
    return out + esc(src.slice(last));
  }

  function makeEditor(initial, o) {
    o = o || {};
    var ta = h('textarea', {
      class: 'mj-ta', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off',
      'aria-label': o.label || 'Java code editor', wrap: 'off', readonly: o.readonly ? true : null
    });
    var code = h('code');
    var hl = h('pre', { class: 'mj-hl', 'aria-hidden': 'true' }, [code]);
    var gutter = h('pre', { class: 'mj-gutter', 'aria-hidden': 'true' });
    var band = h('div', { class: 'mj-errline', 'aria-hidden': 'true' });
    var codeBox = h('div', { class: 'mj-code' }, [band, hl, ta]);
    var scroll = h('div', { class: 'mj-scroll' }, [h('div', { class: 'mj-inner' }, [gutter, codeBox])]);
    var root = h('div', { class: 'mj-editor' + (o.readonly ? ' mj-readonly' : '') }, [scroll]);
    var changeFns = [];
    var trap = true; // Tab inserts spaces (Esc releases it so keyboard users can leave)

    function lineCount() { return ta.value.split('\n').length; }
    function render() {
      var v = ta.value;
      code.innerHTML = highlight(v) + (v.slice(-1) === '\n' ? ' ' : '');
      var n = lineCount(), g = '';
      for (var i = 1; i <= n; i++) g += i + (i < n ? '\n' : '');
      gutter.textContent = g;
      var min = o.minLines || 3;
      scroll.style.minHeight = '';
      root.style.setProperty('--mj-lines', Math.max(n, min));
    }
    function lineHeight() { return parseFloat(getComputedStyle(ta).lineHeight) || 20; }
    function revealCaret() {
      var v = ta.value.slice(0, ta.selectionStart), ln = v.split('\n').length - 1, lh = lineHeight();
      var top = ln * lh + parseFloat(getComputedStyle(codeBox).paddingTop || 0);
      if (top < scroll.scrollTop) scroll.scrollTop = top;
      else if (top + lh * 2 > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = top + lh * 2 - scroll.clientHeight;
    }
    function insert(text) {
      ta.focus();
      var ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok) {
        var s = ta.selectionStart, e2 = ta.selectionEnd;
        ta.setRangeText(text, s, e2, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    function indentOfLine(v, pos) {
      var start = v.lastIndexOf('\n', pos - 1) + 1;
      return /^[ \t]*/.exec(v.slice(start, pos))[0];
    }
    function changed() { render(); changeFns.forEach(function (f) { f(ta.value); }); }

    ta.addEventListener('input', function () { changed(); revealCaret(); });
    ta.addEventListener('focus', function () { trap = true; });
    ta.addEventListener('keyup', revealCaret);
    ta.addEventListener('click', revealCaret);
    ta.addEventListener('keydown', function (ev) {
      if (o.readonly) return;
      var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      if (ev.key === 'Escape') { trap = false; return; }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); if (o.onRun) o.onRun(); return; }
      if (ev.key === 'Tab' && trap && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        if (s !== e && v.slice(s, e).indexOf('\n') !== -1 || ev.shiftKey) {
          // indent / outdent every selected line
          var ls = v.lastIndexOf('\n', s - 1) + 1;
          var block = v.slice(ls, e);
          var nb = ev.shiftKey ? block.replace(/^( {1,4}|\t)/gm, '') : block.replace(/^/gm, '    ');
          ta.setSelectionRange(ls, e);
          insert(nb);
          ta.setSelectionRange(ls, ls + nb.length);
        } else insert('    ');
        return;
      }
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.altKey) {
        ev.preventDefault();
        var ind = indentOfLine(v, s), before = v.slice(0, s).replace(/[ \t]+$/, ''), prev = before.slice(-1), next = v.slice(e).replace(/^[ \t]+/, '').charAt(0);
        if (prev === '{' && next === '}') insert('\n' + ind + '    \n' + ind);
        else insert('\n' + ind + (prev === '{' ? '    ' : ''));
        if (prev === '{' && next === '}') { var p = s + 1 + ind.length + 4; ta.setSelectionRange(p, p); }
        revealCaret();
        return;
      }
      if (ev.key === '}' && s === e) {
        var lineStart = v.lastIndexOf('\n', s - 1) + 1, pre = v.slice(lineStart, s);
        if (pre.length >= 4 && /^ +$/.test(pre)) { ev.preventDefault(); ta.setSelectionRange(s - 4, s); insert('}'); }
      }
    });

    ta.value = initial;
    render();
    return {
      root: root,
      getValue: function () { return ta.value; },
      setValue: function (v) { ta.value = v; changed(); this.mark(null); },
      onChange: function (f) { changeFns.push(f); },
      focus: function () { ta.focus(); },
      mark: function (line) {
        if (!line) { band.style.display = 'none'; return; }
        band.style.display = 'block';
        band.style.top = 'calc(' + (line - 1) + ' * var(--mj-lh) + var(--mj-pad))';
        // reveal it
        var lh = lineHeight(), top = (line - 1) * lh;
        if (top < scroll.scrollTop || top > scroll.scrollTop + scroll.clientHeight - lh * 2) scroll.scrollTop = Math.max(0, top - lh * 2);
      }
    };
  }

  /* ================================================================== *
   * output helpers
   * ================================================================== */

  function describeError(err, userLines) {
    var line = err.line && (!userLines || err.line <= userLines) ? err.line : 0;
    var msg = String(err.message || '');
    if (err.kind === 'compile') {
      var parts = msg.split('\n');
      return (line ? 'Main.java:' + line + ': ' : '') + 'error: ' + parts[0] + (parts.length > 1 ? '\n' + parts.slice(1).join('\n') : '');
    }
    if (err.kind === 'exception') {
      return 'Exception in thread "main" ' + msg + (line ? '\n\tat Main.main(Main.java:' + line + ')' : '');
    }
    return msg;
  }

  function diffTable(expected, got) {
    var e = norm(expected).split('\n'), g = norm(got).split('\n'), n = Math.max(e.length, g.length), first = -1;
    for (var i = 0; i < n; i++) if (e[i] !== g[i]) { first = i; break; }
    var start = Math.max(0, first - 1), end = Math.min(n, first + 4);
    var rows = [];
    for (var j = start; j < end; j++) {
      var ok = e[j] === g[j];
      rows.push(h('tr', { class: ok ? 'mj-ok' : 'mj-bad' }, [
        h('td', { class: 'mj-ln-no', text: String(j + 1) }),
        h('td', null, [h('code', { text: e[j] == null ? '(nothing)' : e[j] })]),
        h('td', null, [h('code', { text: g[j] == null ? '(nothing)' : g[j] })])
      ]));
    }
    return h('table', { class: 'mj-diff' }, [
      h('thead', null, [h('tr', null, [h('th', { text: 'Line' }), h('th', { text: 'Expected' }), h('th', { text: 'Yours' })])]),
      h('tbody', null, rows)
    ]);
  }

  /* ================================================================== *
   * robot simulator panel
   * ================================================================== */

  var FACE = [['Y', 'y'], ['X', 'x'], ['B', 'b'], ['A', 'a']];
  var TRAVEL = 25; // px the stick knob can move from centre

  function RobotPanel(w) {
    var show = {};
    (w.meta.show || 'controller,motors,dashboard,scheduler').split(',').forEach(function (s) { show[s.trim()] = true; });
    var dioChannels = (w.meta.dio || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var port = 0;

    var state = { session: null, timer: null, ticks: 0, running: false, wanted: 'teleop' };
    var pending = [];       // {code, gate}
    var motors = {};        // id -> {el, wheel, bar, val, tags, speed, angle}
    var running = {};       // command name -> count
    var dash = {};          // key -> row element
    var held = {};          // button -> pressedAtTick
    var axes = { leftX: 0, leftY: 0, rightX: 0, rightY: 0, leftTrigger: 0, rightTrigger: 0 };

    /* ---- controls ---- */
    var runBtn = h('button', { class: 'mj-btn mj-primary', type: 'button', text: 'Run robot code' });
    var pauseBtn = h('button', { class: 'mj-btn', type: 'button', text: 'Pause', disabled: true });
    var stepBtn = h('button', { class: 'mj-btn', type: 'button', text: 'Step 1 loop', disabled: true, title: 'Run exactly one 20 ms robot loop' });
    var loopLabel = h('span', { class: 'mj-loop', text: 'Not running' });
    var modeBtns = {};
    var modeBar = h('div', { class: 'mj-seg', role: 'group', 'aria-label': 'Robot mode' }, ['disabled', 'auto', 'teleop'].map(function (m) {
      var b = h('button', { type: 'button', class: 'mj-seg-btn' + (m === 'teleop' ? ' mj-on' : ''), text: m === 'disabled' ? 'Disabled' : m === 'auto' ? 'Autonomous' : 'Teleop', 'aria-pressed': m === 'teleop' ? 'true' : 'false' });
      b.addEventListener('click', function () { setMode(m); });
      modeBtns[m] = b;
      return b;
    }));
    var top = h('div', { class: 'mj-r-top' }, [runBtn, pauseBtn, stepBtn, modeBar, loopLabel]);

    /* ---- controller ---- */
    function faceBtn(name, key) {
      var b = h('button', { type: 'button', class: 'mj-face mj-face-' + key, text: name, 'aria-label': 'Button ' + name });
      bindHold(b, name);
      return b;
    }
    function smallBtn(label, name, cls) {
      var b = h('button', { type: 'button', class: 'mj-small ' + (cls || ''), text: label });
      bindHold(b, name);
      return b;
    }
    function bindHold(b, name) {
      var down = false;
      function press(ev) {
        if (!state.session) return;
        ev.preventDefault(); down = true; b.classList.add('mj-held');
        if (b.setPointerCapture && ev.pointerId != null) { try { b.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ } }
        held[name] = state.ticks;
        pending.push({ code: 'Sim.press(' + port + ', "' + name + '");', gate: 0 });
        if (!state.timer) nudge();
      }
      function release() {
        if (!down) return; down = false; b.classList.remove('mj-held');
        pending.push({ code: 'Sim.release(' + port + ', "' + name + '");', gate: (held[name] || 0) + 2 });
        if (!state.timer) nudge();
      }
      b.addEventListener('pointerdown', press);
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('lostpointercapture', release);
      b.addEventListener('keydown', function (ev) { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) press(ev); });
      b.addEventListener('keyup', function (ev) { if (ev.key === ' ' || ev.key === 'Enter') release(); });
    }
    function makeStick(prefix, label) {
      var knob = h('div', { class: 'mj-knob' });
      var pad = h('div', { class: 'mj-stick', role: 'application', 'aria-label': label + ' stick', tabindex: '0' }, [knob]);
      var readout = h('div', { class: 'mj-stick-read', text: 'X 0.00\nY 0.00' });
      var active = false;
      function setFrom(ev) {
        var r = pad.getBoundingClientRect(), R = r.width / 2;
        var dx = (ev.clientX - (r.left + R)) / TRAVEL, dy = (ev.clientY - (r.top + R)) / TRAVEL;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len > 1) { dx /= len; dy /= len; }
        put(dx, dy);
      }
      function put(dx, dy) {
        dx = Math.round(dx * 100) / 100; dy = Math.round(dy * 100) / 100;
        axes[prefix + 'X'] = dx; axes[prefix + 'Y'] = dy;
        knob.style.transform = 'translate(' + (dx * TRAVEL) + 'px,' + (dy * TRAVEL) + 'px)';
        readout.textContent = 'X ' + dx.toFixed(2) + '\nY ' + dy.toFixed(2);
        if (state.session) {
          pending.push({ code: 'Sim.setAxis(' + port + ', "' + prefix + 'X", ' + dx.toFixed(2) + '); Sim.setAxis(' + port + ', "' + prefix + 'Y", ' + dy.toFixed(2) + ');', gate: 0, key: prefix });
          if (!state.timer) nudge();
        }
      }
      pad.addEventListener('pointerdown', function (ev) {
        if (!state.session) return;
        ev.preventDefault(); active = true; pad.setPointerCapture(ev.pointerId); setFrom(ev);
      });
      pad.addEventListener('pointermove', function (ev) { if (active) setFrom(ev); });
      function end() { if (active) { active = false; put(0, 0); } }
      pad.addEventListener('pointerup', end);
      pad.addEventListener('pointercancel', end);
      pad.addEventListener('keydown', function (ev) {
        var m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[ev.key];
        if (m && state.session) { ev.preventDefault(); put(m[0], m[1]); }
      });
      pad.addEventListener('keyup', function (ev) { if (/^Arrow/.test(ev.key) && state.session) put(0, 0); });
      return { el: h('div', { class: 'mj-stick-wrap' }, [h('div', { class: 'mj-cap', text: label }), pad, readout]), reset: function () { put(0, 0); } };
    }
    function makeTrigger(name, label) {
      var input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '0', class: 'mj-trig', 'aria-label': label + ' trigger' });
      var val = h('span', { class: 'mj-trig-val', text: '0.00' });
      input.addEventListener('input', function () {
        var v = parseFloat(input.value); axes[name] = v; val.textContent = v.toFixed(2);
        if (state.session) { pending.push({ code: 'Sim.setAxis(' + port + ', "' + name + '", ' + v.toFixed(2) + ');', gate: 0, key: name }); if (!state.timer) nudge(); }
      });
      input.addEventListener('pointerup', function () { input.value = '0'; input.dispatchEvent(new Event('input')); });
      return { el: h('label', { class: 'mj-trig-wrap' }, [h('span', { class: 'mj-cap', text: label }), input, val]), reset: function () { input.value = '0'; val.textContent = '0.00'; } };
    }
    var leftStick = makeStick('left', 'Left stick'), rightStick = makeStick('right', 'Right stick');
    var lt = makeTrigger('leftTrigger', 'LT'), rt = makeTrigger('rightTrigger', 'RT');
    var padCard = h('section', { class: 'mj-r-card mj-r-pad' }, [
      h('h4', { text: 'Controller (port 0)' }),
      h('div', { class: 'mj-bumpers' }, [smallBtn('LB', 'LB'), smallBtn('RB', 'RB')]),
      h('div', { class: 'mj-pad-main' }, [
        leftStick.el,
        h('div', { class: 'mj-faces' }, FACE.map(function (f) { return faceBtn(f[0], f[1]); })),
        rightStick.el
      ]),
      h('div', { class: 'mj-trigs' }, [lt.el, rt.el]),
      h('div', { class: 'mj-meta-btns' }, [smallBtn('Back', 'BACK'), smallBtn('Start', 'START')]),
      h('p', { class: 'mj-note', text: 'Pushing a stick up reads as negative Y, just like a real Xbox controller.' })
    ]);

    /* ---- motors ---- */
    var motorList = h('div', { class: 'mj-motors' }, [h('p', { class: 'mj-empty', text: 'No motors yet. Motors appear here when your code creates them.' })]);
    var dioBox = h('div', { class: 'mj-dios' });
    var dioState = {};
    dioChannels.forEach(function (ch) {
      var b = h('button', { type: 'button', class: 'mj-toggle', 'aria-pressed': 'false', text: 'DIO ' + ch + ': open' });
      b.addEventListener('click', function () {
        dioState[ch] = !dioState[ch];
        b.classList.toggle('mj-on', !!dioState[ch]);
        b.setAttribute('aria-pressed', dioState[ch] ? 'true' : 'false');
        b.textContent = 'DIO ' + ch + ': ' + (dioState[ch] ? 'PRESSED' : 'open');
        if (state.session) { pending.push({ code: 'Sim.setDigital(' + ch + ', ' + (dioState[ch] ? 'true' : 'false') + ');', gate: 0 }); if (!state.timer) nudge(); }
      });
      dioBox.appendChild(b);
    });
    var botCard = h('section', { class: 'mj-r-card mj-r-bot' }, [h('h4', { text: 'Robot motors' }), motorList, dioChannels.length ? h('div', null, [h('h5', { text: 'Limit switches' }), dioBox]) : null]);

    /* ---- dashboard + scheduler ---- */
    var dashBody = h('tbody');
    var dashEmpty = h('p', { class: 'mj-empty', text: 'Nothing published yet. SmartDashboard.putNumber(...) shows up here.' });
    var dashCard = h('section', { class: 'mj-r-card mj-r-dash' }, [h('h4', { text: 'SmartDashboard' }), h('table', { class: 'mj-dash' }, [dashBody]), dashEmpty]);
    var chips = h('div', { class: 'mj-chips' }, [h('span', { class: 'mj-chip-none', text: 'nothing running' })]);
    var logBox = h('ol', { class: 'mj-log', 'aria-live': 'off' });
    var schedCard = h('section', { class: 'mj-r-card mj-r-sched' }, [h('h4', { text: 'Command scheduler' }), h('div', { class: 'mj-cap', text: 'Running right now' }), chips, h('div', { class: 'mj-cap', text: 'Event log' }), logBox]);

    var grid = h('div', { class: 'mj-r-grid' }, [show.controller ? padCard : null, show.motors ? botCard : null, show.dashboard ? dashCard : null, show.scheduler ? schedCard : null]);
    var root = h('div', { class: 'mj-robot' }, [top, grid]);
    root.classList.add('mj-idle');

    /* ---- behaviour ---- */
    function nudge() { if (state.session && !state.running) { /* paused/idle: apply inputs right away without ticking */ flush(true); } }
    function flush(force) {
      if (!state.session) return '';
      var code = '', rest = [], seen = {};
      for (var i = pending.length - 1; i >= 0; i--) { // keep only the latest stick/axis value
        var p = pending[i];
        if (p.key) { if (seen[p.key]) { pending.splice(i, 1); continue; } seen[p.key] = true; }
      }
      pending.forEach(function (p) { if (p.gate <= state.ticks || force && p.gate === 0) code += p.code + ' '; else rest.push(p); });
      pending = rest;
      if (force && code) { var r = state.session.exec(code); handle(r); return ''; }
      return code;
    }
    function setMode(m) {
      state.wanted = m;
      Object.keys(modeBtns).forEach(function (k) { modeBtns[k].classList.toggle('mj-on', k === m); modeBtns[k].setAttribute('aria-pressed', k === m ? 'true' : 'false'); });
      if (state.session) { pending.push({ code: 'Sim.setMode("' + m + '");', gate: 0 }); if (!state.running) nudge(); }
    }
    function log(text, cls) {
      var li = h('li', { class: cls || '' }, [h('span', { class: 'mj-log-t', text: 'loop ' + state.loop }), ' ' + text]);
      logBox.appendChild(li);
      while (logBox.children.length > 40) logBox.removeChild(logBox.firstChild);
      logBox.scrollTop = logBox.scrollHeight;
    }
    function renderChips() {
      chips.textContent = '';
      var names = Object.keys(running).filter(function (n) { return running[n] > 0; });
      if (!names.length) chips.appendChild(h('span', { class: 'mj-chip-none', text: 'nothing running' }));
      names.forEach(function (n) { chips.appendChild(h('span', { class: 'mj-chip', text: n })); });
    }
    function motor(id) {
      if (motors[id]) return motors[id];
      if (motorList.querySelector('.mj-empty')) motorList.textContent = '';
      var wheel = h('div', { class: 'mj-wheel', 'aria-hidden': 'true' }, [h('span'), h('span'), h('span')]);
      var fill = h('div', { class: 'mj-bar-fill' });
      var val = h('span', { class: 'mj-motor-val', text: '0.00' });
      var tags = h('span', { class: 'mj-tags' });
      var el = h('div', { class: 'mj-motor' }, [
        wheel,
        h('div', { class: 'mj-motor-body' }, [
          h('div', { class: 'mj-motor-top' }, [h('strong', { text: 'CAN ' + id }), tags, val]),
          h('div', { class: 'mj-bar' }, [h('div', { class: 'mj-bar-mid' }), fill])
        ])
      ]);
      motorList.appendChild(el);
      // keep motors sorted by id
      var all = Array.prototype.slice.call(motorList.children).sort(function (a, b) { return parseInt(a.querySelector('strong').textContent.slice(4), 10) - parseInt(b.querySelector('strong').textContent.slice(4), 10); });
      all.forEach(function (c) { motorList.appendChild(c); });
      return (motors[id] = { el: el, wheel: wheel, fill: fill, val: val, tags: tags, speed: 0, angle: 0 });
    }
    function setMotor(m, v) {
      m.speed = v;
      m.val.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
      if (v >= 0) { m.fill.style.left = '50%'; m.fill.style.width = (v * 50) + '%'; }
      else { m.fill.style.left = (50 + v * 50) + '%'; m.fill.style.width = (-v * 50) + '%'; }
      m.fill.classList.toggle('mj-neg', v < 0);
    }
    function fmt(v) {
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'number') return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(3).replace(/0+$/, '');
      return String(v);
    }
    function handle(r) {
      if (r.output) w.print(r.output);
      (r.events || []).forEach(function (e) {
        var a = e.args;
        if (e.kind === 'motor') setMotor(motor(a[0]), Number(a[1]));
        else if (e.kind === 'config') { var m = motor(a[0]); m.tags.textContent = ''; if (a[1]) m.tags.appendChild(h('span', { class: 'mj-tag', text: 'inverted' })); m.tags.appendChild(h('span', { class: 'mj-tag', text: String(a[2]).replace('k', '').toLowerCase() })); m.tags.appendChild(h('span', { class: 'mj-tag', text: a[3] + 'A' })); }
        else if (e.kind === 'dash') {
          dashEmpty.style.display = 'none';
          var row = dash[a[0]];
          if (!row) { row = dash[a[0]] = h('tr', null, [h('th', { text: String(a[0]) }), h('td')]); dashBody.appendChild(row); }
          var cell = row.lastChild; cell.textContent = fmt(a[1]);
          cell.className = typeof a[1] === 'boolean' ? (a[1] ? 'mj-true' : 'mj-false') : '';
        } else if (e.kind === 'cmd') {
          var name = String(a[1]);
          if (a[0] === 'start') { running[name] = (running[name] || 0) + 1; log('start ' + name, 'mj-l-start'); }
          else { running[name] = Math.max(0, (running[name] || 1) - 1); log((a[0] === 'finished' ? 'finished ' : 'interrupted ') + name, a[0] === 'finished' ? 'mj-l-done' : 'mj-l-int'); }
          renderChips();
        } else if (e.kind === 'loop') { state.loop = Number(a[0]); }
        else if (e.kind === 'mode') { log('mode: ' + a[0], 'mj-l-mode'); }
      });
      if (r.error) { stop(); w.showError(r.error, true); }
      loopLabel.textContent = (state.running ? 'Running  ' : 'Paused  ') + 'loop ' + (state.loop || 0) + '  (50 per second)';
    }
    function tick() {
      if (!state.session) return;
      var pre = flush(false);
      state.ticks++;
      handle(state.session.exec(pre + 'Sim.tick();'));
    }
    function startTimer() {
      if (state.timer) return;
      state.timer = setInterval(tick, 20);
      state.running = true; pauseBtn.textContent = 'Pause'; pauseBtn.disabled = false; stepBtn.disabled = true; spin();
    }
    function pause() {
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
      state.running = false; pauseBtn.textContent = 'Resume'; stepBtn.disabled = !state.session;
      loopLabel.textContent = 'Paused  loop ' + (state.loop || 0);
    }
    function stop() {
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
      state.running = false; pauseBtn.disabled = true; stepBtn.disabled = true; pauseBtn.textContent = 'Pause';
      runBtn.textContent = 'Run robot code';
      root.classList.add('mj-idle');
      loopLabel.textContent = 'Stopped';
    }
    function spinFrame() {
      var any = false;
      Object.keys(motors).forEach(function (id) {
        var m = motors[id];
        if (state.running && Math.abs(m.speed) > 0.001) { m.angle += m.speed * 14; m.wheel.style.transform = 'rotate(' + m.angle + 'deg)'; any = true; }
      });
      if (state.running || any) state.raf = requestAnimationFrame(spinFrame); else state.raf = 0;
    }
    function spin() { if (!state.raf) state.raf = requestAnimationFrame(spinFrame); }
    function resetUI() {
      Object.keys(motors).forEach(function (k) { delete motors[k]; });
      motorList.textContent = ''; motorList.appendChild(h('p', { class: 'mj-empty', text: 'No motors yet. Motors appear here when your code creates them.' }));
      dashBody.textContent = ''; Object.keys(dash).forEach(function (k) { delete dash[k]; }); dashEmpty.style.display = '';
      Object.keys(running).forEach(function (k) { delete running[k]; }); renderChips(); logBox.textContent = '';
      leftStick.reset(); rightStick.reset(); lt.reset(); rt.reset();
      pending = []; held = {}; state.ticks = 0; state.loop = 0;
    }

    runBtn.addEventListener('click', function () { api.run(); });
    pauseBtn.addEventListener('click', function () { if (state.running) pause(); else if (state.session) startTimer(); });
    stepBtn.addEventListener('click', function () { if (state.session && !state.running) tick(); });

    var api = {
      el: root,
      run: function () {
        stop(); resetUI();
        var src = w.editor.getValue();
        w.clearOutput();
        var session = MJ.createSession(src, { prelude: w.prelude });
        if (session.error) { w.showError(session.error, false); return; }
        w.editor.mark(null);
        var setup = w.setup;
        if (!setup) {
          var names = session.classNames || [];
          if (names.indexOf('Robot') !== -1) setup = 'Sim.start(new Robot());';
          else if (names.indexOf('RobotContainer') !== -1) setup = 'RobotContainer container = new RobotContainer();';
          else { w.showError({ kind: 'internal', message: 'This panel starts your robot from a class named Robot or RobotContainer, and could not find either.' }, false); return; }
        }
        var wanted = state.wanted;
        var r = session.exec(setup + ' Sim.setMode("' + wanted + '");');
        state.session = session;
        runBtn.textContent = 'Restart';
        root.classList.remove('mj-idle');
        handle(r);
        if (r.error) { state.session = null; return; }
        // apply controls the student already set before starting
        dioChannels.forEach(function (ch) { if (dioState[ch]) pending.push({ code: 'Sim.setDigital(' + ch + ', true);', gate: 0 }); });
        startTimer();
      },
      stop: function () { stop(); state.session = null; },
      dirty: function () { if (state.session) runBtn.textContent = 'Restart with your changes'; }
    };
    state.loop = 0;
    return api;
  }

  /* ================================================================== *
   * playground widget
   * ================================================================== */

  var widgetIndex = 0;

  function Playground(pre) {
    var text = pre.textContent;
    var d = parseBlock(text);
    var meta = d.meta;
    var idx = widgetIndex++;
    var mode = meta.mode === 'predict' ? 'predict' : 'run';
    var checkable = mode === 'predict' || !!d.expect;
    var id = meta.id || slug(meta.title) || ('w' + idx);
    var key = pageKey + ':' + id;
    var prelude = (meta.prelude || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var panel = meta.panel === 'robot';
    if (panel && prelude.indexOf('wpilib') === -1) prelude.push('wpilib');
    var userLinesOf = function (s) { return s.split('\n').length; };
    var tries = 0, hintsShown = 0, solved = store.get(key) === '1';

    var w = { meta: meta, prelude: prelude, setup: d.setup };
    var editor = makeEditor(d.code, { readonly: mode === 'predict', minLines: Math.min(parseInt(meta.lines || '3', 10), 30), onRun: function () { runBtn.click(); }, label: meta.title ? meta.title + ' code' : 'Java code' });
    w.editor = editor;
    editor.root.style.setProperty('--mj-maxlines', meta.maxlines || '26');

    var badgeText = mode === 'predict' ? 'Predict' : checkable ? 'Challenge' : panel ? 'Simulator' : 'Try it';
    var doneTag = h('span', { class: 'mj-done', text: 'Completed' });
    var head = h('div', { class: 'mj-head' }, [h('span', { class: 'mj-badge', text: badgeText }), h('span', { class: 'mj-title', text: meta.title || 'Java playground' }), doneTag]);
    var goal = meta.goal ? h('div', { class: 'mj-goal', html: inline(meta.goal) }) : null;

    var consoleEl = h('pre', { class: 'mj-console', tabindex: '0', 'aria-label': 'Program output' });
    if (mode === 'predict') consoleEl.setAttribute('data-wait', '1');
    var outLabel = h('div', { class: 'mj-out-label', text: 'Output' });
    var outBox = h('div', { class: 'mj-out mj-empty-out' }, [outLabel, consoleEl]);
    var result = h('div', { class: 'mj-result', role: 'status', 'aria-live': 'polite' });
    var hintBox = h('div', { class: 'mj-hints' });
    var solBox = h('div', { class: 'mj-solution' });

    var predictBox = null, predictTa = null;
    if (mode === 'predict') {
      predictTa = h('textarea', { class: 'mj-predict', rows: Math.max(3, norm(d.expect || '').split('\n').length || 3), placeholder: 'Type exactly what you think the program prints, one line per line...', 'aria-label': 'Your predicted output', spellcheck: 'false' });
      predictBox = h('div', { class: 'mj-predict-box' }, [h('label', { text: 'Your prediction' }), predictTa]);
    }

    function print(s) {
      outBox.classList.remove('mj-empty-out');
      consoleEl.textContent += s;
      if (consoleEl.textContent.length > 20000) consoleEl.textContent = consoleEl.textContent.slice(-20000);
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
    function clearOutput() { consoleEl.textContent = ''; consoleEl.classList.remove('mj-error'); outBox.classList.add('mj-empty-out'); result.className = 'mj-result'; result.textContent = ''; editor.mark(null); }
    function showError(err, live) {
      outBox.classList.remove('mj-empty-out');
      var t = describeError(err, userLinesOf(editor.getValue()));
      var span = h('span', { class: 'mj-error-text', text: (consoleEl.textContent && !/\n$/.test(consoleEl.textContent) ? '\n' : '') + t + '\n' });
      consoleEl.appendChild(span);
      consoleEl.scrollTop = consoleEl.scrollHeight;
      if (err.line && err.line <= userLinesOf(editor.getValue())) editor.mark(err.line);
    }
    w.print = print; w.clearOutput = clearOutput; w.showError = showError;

    function runOnce(opts) {
      var src = editor.getValue();
      return MJ.run(src, { prelude: prelude, harness: opts && opts.harness || '', userLines: userLinesOf(src) });
    }

    function setSolved() {
      if (solved) return;
      solved = true; store.set(key, '1'); progress.done++; renderProgress(); widget.classList.add('mj-solved');
    }

    /* ---- buttons ---- */
    var runBtn, checkBtn, hintBtn, resetBtn, solBtn, robot = null;
    function doRun() {
      if (robot) { robot.run(); return; }
      clearOutput();
      var r = runOnce();
      if (r.output) print(r.output);
      if (r.error) showError(r.error);
      else if (!r.hasEntry && !r.output) {
        outBox.classList.remove('mj-empty-out');
        print('Compiled without errors. There is no main method here, so there is nothing to print.\n' + (checkable ? 'Press Check to test your code.' : ''));
      } else if (!r.output) { print('(the program finished without printing anything)\n'); }
    }
    function fail(msgNode) { result.className = 'mj-result mj-fail'; result.textContent = ''; result.appendChild(msgNode); }
    function pass() {
      result.className = 'mj-result mj-pass'; result.textContent = '';
      result.appendChild(h('strong', { text: mode === 'predict' ? 'Right! ' : 'Correct! ' }));
      result.appendChild(document.createTextNode(mode === 'predict' ? 'Your prediction matches what Java printed.' : 'Your code passed the check.'));
      if (d.explain) result.appendChild(h('div', { class: 'mj-explain', html: inline(d.explain).replace(/\n/g, '<br>') }));
      setSolved();
    }
    function doCheck() {
      clearOutput();
      var src = editor.getValue();
      tries++;
      if (mode === 'predict') {
        var typed = norm(predictTa.value);
        if (!typed) { fail(h('span', { text: 'Type your prediction first, then check it.' })); tries--; return; }
        var r0 = runOnce();
        if (r0.output) print(r0.output);
        if (r0.error) showError(r0.error);
        var actual = norm(r0.output + (r0.error ? '' : ''));
        if (typed.replace(/\s+/g, ' ') === actual.replace(/\s+/g, ' ')) pass();
        else { fail(h('div', null, [h('strong', { text: 'Not quite. ' }), document.createTextNode('That is not what the program prints. Compare your prediction with the real output above.'), diffTable(actual, typed)])); }
        solBtn.disabled = false;
        return;
      }
      // static requirements first (they stop students hard-coding the answer)
      var reqs = meta.require || [];
      for (var i = 0; i < reqs.length; i++) {
        var parts = reqs[i].split(' | '), re;
        try { re = new RegExp(parts[0]); } catch (e) { re = null; }
        if (re && !re.test(src.replace(/\/\/.*$/gm, ''))) { fail(h('span', { text: parts[1] || 'Your solution is missing something the exercise asks for.' })); afterFail(); return; }
      }
      var r = runOnce({ harness: d.harness });
      if (r.error) {
        showError(r.error);
        if (r.error.line && r.error.line > userLinesOf(src)) fail(h('span', { text: 'Your code did not work with the test. Check the names and types the exercise asks for.' }));
        else fail(h('span', { text: 'Your code has an error. Fix the message above and try again.' }));
        afterFail(); return;
      }
      if (!d.harness && r.output) print(r.output);
      var ok = norm(r.output) === norm(d.expect);
      if (ok) pass();
      else {
        if (d.harness) { print(r.output); }
        fail(h('div', null, [h('strong', { text: 'Not yet. ' }), document.createTextNode(d.harness ? 'A test did not give the expected result.' : 'The output is different from what the exercise asks for.'), diffTable(d.expect, r.output)]));
        afterFail();
      }
    }
    function afterFail() { if (solBtn) solBtn.disabled = false; }
    function nextHint() {
      if (hintsShown >= d.hints.length) return;
      var hint = d.hints[hintsShown++];
      hintBox.appendChild(h('div', { class: 'mj-hint' }, [h('strong', { text: 'Hint ' + hintsShown + ': ' }), h('span', { html: inline(hint).replace(/\n/g, '<br>') })]));
      hintBtn.textContent = hintsShown >= d.hints.length ? 'No more hints' : 'Another hint';
      hintBtn.disabled = hintsShown >= d.hints.length;
      if (hintsShown >= d.hints.length && solBtn) solBtn.disabled = false;
    }
    function showSolution() {
      if (solBox.firstChild) { solBox.textContent = ''; solBtn.textContent = 'Show solution'; return; }
      var ed = makeEditor(d.solution, { readonly: true, label: 'Solution' });
      solBox.appendChild(h('div', { class: 'mj-cap', text: 'One possible solution' }));
      solBox.appendChild(ed.root);
      solBtn.textContent = 'Hide solution';
    }
    function reset() {
      editor.setValue(d.code);
      if (robot) robot.stop();
      clearOutput();
      if (predictTa) predictTa.value = '';
      result.className = 'mj-result'; result.textContent = '';
    }

    var buttons = [];
    if (mode === 'predict') {
      runBtn = null;
      checkBtn = h('button', { class: 'mj-btn mj-primary', type: 'button', text: 'Check my prediction', onclick: doCheck });
      buttons.push(checkBtn);
    } else {
      if (!panel) { runBtn = h('button', { class: 'mj-btn mj-primary', type: 'button', text: 'Run', onclick: doRun, title: 'Ctrl or Cmd + Enter' }); buttons.push(runBtn); }
      else runBtn = { click: doRun };
      if (checkable) { checkBtn = h('button', { class: 'mj-btn' + (panel ? ' mj-primary' : ''), type: 'button', text: 'Check my code', onclick: doCheck }); buttons.push(checkBtn); }
    }
    if (d.hints.length) { hintBtn = h('button', { class: 'mj-btn', type: 'button', text: 'Hint', onclick: nextHint }); buttons.push(hintBtn); }
    if (d.solution && checkable) { solBtn = h('button', { class: 'mj-btn', type: 'button', text: 'Show solution', disabled: true, title: 'Unlocks after a try or after you have used the hints', onclick: showSolution }); buttons.push(solBtn); }
    if (mode === 'run' || checkable) buttons.push(h('button', { class: 'mj-btn mj-ghost', type: 'button', text: 'Reset', onclick: reset }));

    var actions = h('div', { class: 'mj-actions' }, buttons);
    var parts = [head, goal];
    if (panel) {
      robot = RobotPanel(w);
      parts.push(editor.root, actions, robot.el, outBox);
      editor.onChange(function () { robot.dirty(); });
    } else {
      parts.push(editor.root);
      if (predictBox) parts.push(predictBox);
      parts.push(actions, outBox);
    }
    parts.push(result, hintBox, solBox);
    var widget = h('div', { class: 'mj mj-widget' + (panel ? ' mj-has-panel' : '') + (solved ? ' mj-solved' : '') }, parts);

    if (checkable) { progress.total++; if (solved) progress.done++; }
    else widget.classList.add('mj-free');
    pre.parentNode.replaceChild(widget, pre);
  }

  /* ================================================================== *
   * quiz widget
   * ================================================================== */

  function parseQuiz(text) {
    var q = { meta: {}, items: [] }, cur = null;
    text.replace(/\r/g, '').split('\n').forEach(function (line) {
      var m;
      if ((m = /^@\s*([a-z]+)\s*:\s*(.*)$/.exec(line))) { q.meta[m[1]] = m[2]; return; }
      if (/^\?\s/.test(line)) { cur = { q: line.slice(2).trim(), code: [], opts: [], why: '' }; q.items.push(cur); return; }
      if (!cur) return;
      if (/^\|/.test(line)) cur.code.push(line.replace(/^\|\s?/, ''));
      else if (/^[-+]\s/.test(line)) cur.opts.push({ text: line.slice(2).trim(), ok: line.charAt(0) === '+' });
      else if (/^>\s?/.test(line)) cur.why += (cur.why ? ' ' : '') + line.replace(/^>\s?/, '').trim();
      else if (line.trim() && !cur.opts.length && !cur.code.length) cur.q += ' ' + line.trim();
    });
    q.items = q.items.filter(function (i) { return i.opts.length > 1 && i.opts.some(function (o) { return o.ok; }); });
    return q;
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function Quiz(pre) {
    var data = parseQuiz(pre.textContent);
    var key = pageKey + ':quiz:' + (data.meta.id || slug(data.meta.title) || 'quiz');
    var total = data.items.length;
    if (!total) return;
    var order, pos, score, missed;
    var body = h('div', { class: 'mj-quiz-body' });
    var best = parseInt(store.get(key) || '-1', 10);
    var bestEl = h('span', { class: 'mj-quiz-best' });
    var head = h('div', { class: 'mj-head' }, [h('span', { class: 'mj-badge', text: 'Quiz' }), h('span', { class: 'mj-title', text: data.meta.title || 'Quick quiz' }), bestEl]);
    var widget = h('div', { class: 'mj mj-quiz' }, [head, body]);
    function showBest() { bestEl.textContent = best >= 0 ? 'Best: ' + best + '/' + total : ''; }

    function start() { order = shuffle(data.items.map(function (_, i) { return i; })); pos = 0; score = 0; missed = []; showBest(); question(); }
    function question() {
      var it = data.items[order[pos]];
      var multi = it.opts.filter(function (o) { return o.ok; }).length > 1;
      var opts = shuffle(it.opts), chosen = {}, locked = false;
      body.textContent = '';
      body.appendChild(h('div', { class: 'mj-quiz-prog' }, [
        h('span', { text: 'Question ' + (pos + 1) + ' of ' + total }),
        h('span', { class: 'mj-progress-bar' }, [h('span', { class: 'mj-progress-fill', style: 'width:' + (100 * pos / total) + '%' })])
      ]));
      body.appendChild(h('p', { class: 'mj-quiz-q', html: inline(it.q) }));
      if (it.code.length) body.appendChild(h('pre', { class: 'mj-quiz-code' }, [h('code', { html: highlight(it.code.join('\n')) })]));
      if (multi) body.appendChild(h('p', { class: 'mj-note', text: 'Select all that apply.' }));
      var list = h('div', { class: 'mj-opts', role: multi ? 'group' : 'radiogroup' });
      var feedback = h('div', { class: 'mj-quiz-fb', role: 'status', 'aria-live': 'polite' });
      var nextBtn = h('button', { class: 'mj-btn mj-primary', type: 'button', text: pos + 1 < total ? 'Next question' : 'See results', style: 'display:none' });
      var checkBtn = multi ? h('button', { class: 'mj-btn mj-primary', type: 'button', text: 'Check answer' }) : null;
      var btns = [];
      function finish(correct) {
        locked = true;
        btns.forEach(function (b, i) {
          b.disabled = true;
          var o = opts[i];
          b.classList.toggle('mj-right', o.ok);
          b.classList.toggle('mj-wrong', !o.ok && !!chosen[i]);
        });
        if (correct) score++; else missed.push(it);
        feedback.className = 'mj-quiz-fb ' + (correct ? 'mj-pass' : 'mj-fail');
        feedback.textContent = '';
        feedback.appendChild(h('strong', { text: correct ? 'Correct. ' : 'Not quite. ' }));
        if (it.why) feedback.appendChild(h('span', { html: inline(it.why) }));
        else if (!correct) feedback.appendChild(document.createTextNode('The highlighted answer is the right one.'));
        if (checkBtn) checkBtn.style.display = 'none';
        nextBtn.style.display = '';
        nextBtn.focus();
      }
      opts.forEach(function (o, i) {
        var b = h('button', { type: 'button', class: 'mj-opt', role: multi ? 'checkbox' : 'radio', 'aria-checked': 'false' }, [
          h('span', { class: 'mj-opt-mark' }), h('span', { class: 'mj-opt-text', html: inline(o.text) })
        ]);
        b.addEventListener('click', function () {
          if (locked) return;
          if (multi) { chosen[i] = !chosen[i]; b.classList.toggle('mj-picked', !!chosen[i]); b.setAttribute('aria-checked', chosen[i] ? 'true' : 'false'); }
          else { chosen[i] = true; finish(o.ok); }
        });
        btns.push(b); list.appendChild(b);
      });
      body.appendChild(list);
      if (checkBtn) {
        checkBtn.addEventListener('click', function () {
          if (locked) return;
          var any = Object.keys(chosen).some(function (k) { return chosen[k]; });
          if (!any) { feedback.className = 'mj-quiz-fb mj-fail'; feedback.textContent = 'Pick at least one answer first.'; return; }
          finish(opts.every(function (o, i) { return !!o.ok === !!chosen[i]; }));
        });
        body.appendChild(checkBtn);
      }
      body.appendChild(feedback);
      body.appendChild(nextBtn);
      nextBtn.addEventListener('click', function () { pos++; if (pos < total) question(); else results(); });
    }
    function results() {
      if (score > best) { best = score; store.set(key, String(best)); }
      showBest();
      body.textContent = '';
      var pct = Math.round(100 * score / total);
      body.appendChild(h('div', { class: 'mj-quiz-score' }, [h('div', { class: 'mj-quiz-big', text: score + ' / ' + total }), h('div', { text: pct === 100 ? 'Perfect score!' : pct >= 70 ? 'Nice work. You are ready for the next lesson.' : 'Keep going. Review the lesson and try again.' })]));
      if (missed.length) {
        body.appendChild(h('div', { class: 'mj-cap', text: 'Review these' }));
        var ul = h('ul', { class: 'mj-missed' });
        missed.forEach(function (it) { ul.appendChild(h('li', null, [h('div', { html: inline(it.q) }), h('div', { class: 'mj-note', html: 'Answer: ' + it.opts.filter(function (o) { return o.ok; }).map(function (o) { return inline(o.text); }).join('; ') + (it.why ? '. ' + inline(it.why) : '') })])); });
        body.appendChild(ul);
      }
      body.appendChild(h('button', { class: 'mj-btn mj-primary', type: 'button', text: 'Try again', onclick: start }));
    }
    pre.parentNode.replaceChild(widget, pre);
    start();
  }

  /* ================================================================== *
   * boot
   * ================================================================== */

  function init() {
    progress = { total: 0, done: 0, chip: null };
    widgetIndex = 0;
    var any = false;
    Array.prototype.slice.call(document.querySelectorAll('pre.playground')).forEach(function (pre) {
      try { Playground(pre); any = true; } catch (e) { if (window.console) console.error('playground failed', e); }
    });
    Array.prototype.slice.call(document.querySelectorAll('pre.quiz')).forEach(function (pre) {
      try { Quiz(pre); } catch (e) { if (window.console) console.error('quiz failed', e); }
    });
    if (any) renderProgress();
  }
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(init);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
