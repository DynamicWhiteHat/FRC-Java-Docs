/*
 * MiniJava — a small Java-subset interpreter that runs in the browser.
 *
 * It exists so students can edit and run the Java they learn on this site
 * without installing anything. It is NOT a full JVM: it understands the parts
 * of Java that show up in the lessons (variables, math, if/else, loops,
 * methods, classes, constructors, inheritance, interfaces, enums, arrays,
 * ArrayList/HashMap, lambdas, and a fake "WPILib" prelude for FRC lessons).
 *
 * Public API:
 *   MiniJava.run(source, { prelude: ['wpilib'], harness: '...', userLines: n })
 *     -> { output, error, checks, events, hasEntry }
 *   MiniJava.createSession(source, { prelude: ['wpilib'] })
 *     -> { error, exec(snippet) -> { output, events, error } }   (stateful)
 *   MiniJava.registerPrelude(name, javaSource)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MiniJava = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Errors and runtime value classes
   * ------------------------------------------------------------------ */

  class JavaError extends Error {
    constructor(kind, message, line) {
      super(message);
      this.kind = kind; // 'compile' | 'limit'
      this.line = line || 0;
    }
  }
  class JavaThrow { // a Java exception object travelling up the JS stack
    constructor(obj) { this.obj = obj; }
  }
  class ExitSignal { constructor(code) { this.code = code; } }

  class JDouble { constructor(v) { this.v = v; } }
  class JChar { constructor(c) { this.c = c; } }
  let idCounter = 1;
  class JObject {
    constructor(cls) { this.cls = cls; this.f = Object.create(null); this.id = idCounter++; }
  }
  class JArray {
    constructor(elem, items) { this.elem = elem; this.items = items; this.id = idCounter++; }
  }
  class JFunc { // lambdas and method references
    constructor(fn) { this.fn = fn; this.id = idCounter++; }
  }
  class JNative { // ArrayList, HashMap, StringBuilder, PrintStream, Class ...
    constructor(kind, data) { this.kind = kind; this.data = data; this.id = idCounter++; }
  }
  class JClassRef { constructor(cls) { this.cls = cls; } }
  class NativeRef { constructor(name) { this.name = name; } }

  const compileErr = (msg, line) => new JavaError('compile', msg, line);

  const PRIM = new Set(['int', 'double', 'boolean', 'char', 'long', 'float', 'short', 'byte']);
  const KEYWORDS = new Set([
    'abstract', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'continue', 'default', 'do',
    'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import',
    'instanceof', 'int', 'interface', 'long', 'new', 'package', 'private', 'protected', 'public', 'return',
    'short', 'static', 'super', 'switch', 'this', 'throw', 'throws', 'try', 'void', 'while', 'null', 'true',
    'false', 'synchronized', 'volatile', 'transient', 'native', 'strictfp', 'assert'
  ]);
  const MODS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized',
    'volatile', 'transient', 'native', 'strictfp', 'default']);

  /* ------------------------------------------------------------------ *
   * Lexer
   * ------------------------------------------------------------------ */

  const OPS2 = ['->', '::', '++', '--', '+=', '-=', '*=', '/=', '%=', '==', '!=', '<=', '>=', '&&', '||'];
  const OPS1 = '+-*/%=<>!?:.,;(){}[]&|^@~';

  function lex(src) {
    const toks = [];
    let i = 0, line = 1;
    const n = src.length;
    const isIdStart = (c) => /[A-Za-z_$]/.test(c);
    const isIdPart = (c) => /[A-Za-z0-9_$]/.test(c);
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        const start = line; i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        if (i >= n) throw compileErr('unclosed comment', start);
        i += 2; continue;
      }
      if (isIdStart(c)) {
        let j = i + 1;
        while (j < n && isIdPart(src[j])) j++;
        toks.push({ t: 'id', v: src.slice(i, j), line });
        i = j; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || '') && !(toks.length && ['id', 'num'].includes(toks[toks.length - 1].t)))) {
        const rest = src.slice(i);
        let m = /^0[xX][0-9a-fA-F]+[lL]?/.exec(rest);
        if (m) {
          toks.push({ t: 'num', v: parseInt(m[0].replace(/[lL]$/, ''), 16), kind: 'int', line });
          i += m[0].length; continue;
        }
        m = /^(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fFdDlL]?/.exec(rest);
        let text = m[0];
        // "1." followed by an identifier char is not a decimal point (e.g. 1.toString) – leave alone
        const suffix = /[fFdDlL]$/.test(text) ? text[text.length - 1].toLowerCase() : '';
        const body = suffix ? text.slice(0, -1) : text;
        const isDouble = /[.eE]/.test(body) || suffix === 'f' || suffix === 'd';
        toks.push({ t: 'num', v: parseFloat(body), kind: isDouble ? 'double' : 'int', line });
        i += text.length; continue;
      }
      if (c === '"') {
        if (src.startsWith('"""', i)) throw compileErr('text blocks (""" ... """) are not supported in this playground', line);
        let j = i + 1, s = '';
        for (;;) {
          if (j >= n || src[j] === '\n') throw compileErr('unclosed string literal', line);
          const d = src[j];
          if (d === '"') { j++; break; }
          if (d === '\\') {
            const [ch, len] = readEscape(src, j, line);
            s += ch; j += len; continue;
          }
          s += d; j++;
        }
        toks.push({ t: 'str', v: s, line });
        i = j; continue;
      }
      if (c === "'") {
        let j = i + 1, ch;
        if (src[j] === '\\') {
          const [e, len] = readEscape(src, j, line);
          ch = e; j += len;
        } else if (src[j] === "'" || src[j] === '\n' || j >= n) {
          throw compileErr(src[j] === "'" ? 'empty character literal' : 'unclosed character literal', line);
        } else { ch = src[j]; j++; }
        if (src[j] !== "'") throw compileErr('unclosed character literal', line);
        toks.push({ t: 'chr', v: ch.charCodeAt(0), line });
        i = j + 1; continue;
      }
      const two = src.substr(i, 2);
      if (OPS2.includes(two)) { toks.push({ t: 'op', v: two, line }); i += 2; continue; }
      if (OPS1.includes(c)) { toks.push({ t: 'op', v: c, line }); i++; continue; }
      throw compileErr(`illegal character: '${c}'`, line);
    }
    toks.push({ t: 'eof', v: '<eof>', line });
    return toks;
  }

  function readEscape(src, j, line) {
    const e = src[j + 1];
    const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '0': '\0', '"': '"', "'": "'", '\\': '\\' };
    if (e === 'u') {
      const hex = src.substr(j + 2, 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw compileErr('illegal unicode escape', line);
      return [String.fromCharCode(parseInt(hex, 16)), 6];
    }
    if (e in map) return [map[e], 2];
    throw compileErr('illegal escape character', line);
  }

  /* ------------------------------------------------------------------ *
   * Parser  (source text -> AST)
   * ------------------------------------------------------------------ */

  class Parser {
    constructor(toks) { this.t = toks; this.p = 0; }

    peek(k = 0) { return this.t[Math.min(this.p + k, this.t.length - 1)]; }
    next() { const x = this.t[this.p]; if (this.p < this.t.length - 1) this.p++; return x; }
    prevLine() { return this.p > 0 ? this.t[this.p - 1].line : this.peek().line; }
    is(v, k = 0) {
      const x = this.peek(k);
      return (x.t === 'op' || x.t === 'id') && x.v === v;
    }
    accept(v) { if (this.is(v)) { this.next(); return true; } return false; }
    eof() { return this.peek().t === 'eof'; }

    fail(msg, line) {
      if (this.eof() && !msg.startsWith('reached')) {
        return compileErr('reached end of file while parsing', this.prevLine());
      }
      return compileErr(msg, line || this.peek().line);
    }
    expect(v) {
      if (this.is(v)) return this.next();
      // javac reports a missing ; ) ] at the end of the previous token
      const useprev = [';', ')', ']'].includes(v);
      throw this.fail(`'${v}' expected`, useprev ? this.prevLine() : this.peek().line);
    }
    ident() {
      const x = this.peek();
      if (x.t !== 'id' || KEYWORDS.has(x.v)) throw this.fail('<identifier> expected', x.t === 'eof' ? undefined : (x.t === 'id' ? x.line : this.prevLine()));
      return this.next().v;
    }

    /* ---------- types ---------- */
    parseType() {
      const t = this.peek();
      if (t.t !== 'id' || (KEYWORDS.has(t.v) && !PRIM.has(t.v))) throw this.fail('<identifier> expected');
      this.next();
      let name = t.v;
      if (!PRIM.has(name)) {
        while (this.is('.') && this.peek(1).t === 'id' && !KEYWORDS.has(this.peek(1).v)) {
          this.next(); name = this.next().v;
        }
        if (this.is('<')) this.parseTypeArgs();
      }
      let dims = 0;
      while (this.is('[') && this.is(']', 1)) { this.next(); this.next(); dims++; }
      return { name, dims };
    }
    parseTypeArgs() {
      this.expect('<');
      if (this.accept('>')) return;
      for (;;) {
        if (this.accept('?')) {
          if (this.accept('extends') || this.accept('super')) this.parseType();
        } else this.parseType();
        if (this.accept(',')) continue;
        break;
      }
      this.expect('>');
    }
    skipTypeParams() { // <T extends Foo> on a class or method
      if (!this.is('<')) return;
      let depth = 0;
      do {
        if (this.is('<')) depth++;
        else if (this.is('>')) depth--;
        this.next();
      } while (depth > 0 && !this.eof());
    }
    speculate(fn) {
      const save = this.p;
      try { return fn(); } catch (e) {
        if (e instanceof JavaError) { this.p = save; return null; }
        throw e;
      }
    }

    /* ---------- top level ---------- */
    parseProgram() {
      const classes = [], loose = [], methods = [];
      while (!this.eof()) {
        if (this.is('package') || this.is('import')) {
          while (!this.is(';') && !this.eof()) this.next();
          this.expect(';'); continue;
        }
        if (this.accept(';')) continue;
        if (this.isTypeDeclStart()) { classes.push(this.parseTypeDecl()); continue; }
        if (this.isMethodDeclStart()) {
          const m = this.parseMember({ name: '$Main', kind: 'class' }, true);
          m.mods.add('static'); methods.push(m); continue;
        }
        loose.push(this.parseStatement());
      }
      return { classes, loose, methods };
    }

    scanModsFrom(k) {
      for (;;) {
        if (this.is('@', k)) {
          k++; if (this.peek(k).t === 'id') k++;
          while (this.is('.', k) && this.peek(k + 1).t === 'id') k += 2;
          if (this.is('(', k)) { let d = 0; do { if (this.is('(', k)) d++; if (this.is(')', k)) d--; k++; } while (d > 0 && this.peek(k).t !== 'eof'); }
          continue;
        }
        const x = this.peek(k);
        if (x.t === 'id' && MODS.has(x.v) && !(x.v === 'default' && this.is(':', k + 1)) && !(x.v === 'default' && this.is('->', k + 1))) { k++; continue; }
        break;
      }
      return k;
    }
    isTypeDeclStart() {
      const k = this.scanModsFrom(0);
      const x = this.peek(k);
      return x.t === 'id' && (x.v === 'class' || x.v === 'interface' || x.v === 'enum');
    }
    isMethodDeclStart() {
      const save = this.p;
      try {
        this.p = this.scanModsFrom(0) + this.p;
        this.speculateSkipType();
        const x = this.peek();
        return x.t === 'id' && !KEYWORDS.has(x.v) && this.is('(', 1);
      } catch (e) {
        if (e instanceof JavaError) return false;
        throw e;
      } finally { this.p = save; }
    }
    speculateSkipType() {
      if (this.is('void')) { this.next(); return { name: 'void', dims: 0 }; }
      return this.parseType();
    }

    skipAnnotationsAndMods() {
      const mods = new Set();
      for (;;) {
        if (this.is('@') && !this.is('interface', 1)) {
          const atLine = this.peek().line;
          this.next();
          if (this.ident() === 'Override') { mods.add('@Override'); mods.overrideLine = atLine; }
          while (this.is('.')) { this.next(); this.ident(); }
          if (this.is('(')) { let d = 0; do { if (this.is('(')) d++; if (this.is(')')) d--; this.next(); } while (d > 0 && !this.eof()); }
          continue;
        }
        const x = this.peek();
        if (x.t === 'id' && MODS.has(x.v)) { mods.add(x.v); this.next(); continue; }
        break;
      }
      return mods;
    }

    parseTypeDecl() {
      const mods = this.skipAnnotationsAndMods();
      const kw = this.next();
      const kind = kw.v; // class | interface | enum
      const line = kw.line;
      const name = this.ident();
      this.skipTypeParams();
      let superName = null;
      const ifaces = [];
      if (this.accept('extends')) {
        if (kind === 'interface') {
          do { ifaces.push(this.parseType().name); } while (this.accept(','));
        } else superName = this.parseType().name;
      }
      if (this.accept('implements')) do { ifaces.push(this.parseType().name); } while (this.accept(','));
      const node = { k: 'class', kind, name, line, mods, superName, ifaces, fields: [], methods: [], ctors: [], initItems: [], instItems: [], nested: [], consts: [] };
      this.expect('{');
      if (kind === 'enum') this.parseEnumConsts(node);
      while (!this.is('}')) {
        if (this.eof()) throw this.fail('reached end of file while parsing');
        if (this.accept(';')) continue;
        this.parseMember(node, false);
      }
      this.expect('}');
      return node;
    }
    parseEnumConsts(node) {
      while (this.peek().t === 'id' && !this.is(';')) {
        const line = this.peek().line;
        const name = this.ident();
        let args = [];
        if (this.is('(')) args = this.parseArgs();
        node.consts.push({ name, args, line });
        if (!this.accept(',')) break;
      }
      this.accept(';');
    }

    // Parses one class member and files it into `cls`. For loose methods it returns the method node.
    parseMember(cls, loose) {
      const mods = this.skipAnnotationsAndMods();
      const startLine = this.peek().line;
      if (this.is('class') || this.is('interface') || this.is('enum')) {
        // reparse as a nested type (modifiers already consumed)
        const inner = this.parseTypeDeclAfterMods(mods);
        cls.nested.push(inner);
        return inner;
      }
      if (this.is('{')) {
        const body = this.parseBlock();
        const item = { k: 'initblock', body, line: startLine };
        if (mods.has('static')) cls.initItems.push(item); else cls.instItems.push(item);
        return item;
      }
      this.skipTypeParams();
      // constructor?
      if (!loose && this.peek().t === 'id' && this.peek().v === cls.name && this.is('(', 1)) {
        const line = this.next().line;
        const params = this.parseParams();
        this.skipThrows();
        const body = this.parseBlock();
        const ct = { k: 'ctor', name: cls.name, params, body, mods, line };
        cls.ctors.push(ct);
        return ct;
      }
      let retTy;
      if (this.is('void')) { this.next(); retTy = { name: 'void', dims: 0 }; }
      else {
        if (this.peek().t === 'id' && this.is('(', 1) && !KEYWORDS.has(this.peek().v)) {
          throw this.fail('invalid method declaration; return type required');
        }
        retTy = this.parseType();
      }
      const nameTok = this.peek();
      const name = this.ident();
      if (this.is('(')) {
        const params = this.parseParams();
        this.skipThrows();
        let body = null;
        if (this.is('{')) body = this.parseBlock();
        else this.expect(';');
        const m = { k: 'method', name, retTy, params, body, mods, line: nameTok.line };
        if (cls.kind === 'interface' && !body) m.mods.add('abstract');
        if (!loose) cls.methods.push(m);
        return m;
      }
      // field(s)
      let first = true;
      let curName = name, curLine = nameTok.line;
      for (;;) {
        if (!first) { curLine = this.peek().line; curName = this.ident(); }
        first = false;
        let ty = retTy;
        let extra = 0;
        while (this.is('[') && this.is(']', 1)) { this.next(); this.next(); extra++; }
        if (extra) ty = { name: retTy.name, dims: retTy.dims + extra };
        let init = null;
        if (this.accept('=')) init = this.is('{') ? this.parseArrayLit() : this.parseExpression();
        const isStatic = mods.has('static') || cls.kind === 'interface';
        const f = { k: 'field', name: curName, ty, init, mods, isStatic, isFinal: mods.has('final') || cls.kind === 'interface', line: curLine };
        if (loose) throw this.fail('fields cannot be declared outside a class');
        cls.fields.push(f);
        (isStatic ? cls.initItems : cls.instItems).push(f);
        if (this.accept(',')) continue;
        break;
      }
      this.expect(';');
      return null;
    }
    parseTypeDeclAfterMods(mods) {
      // we are positioned at class/interface/enum keyword; parseTypeDecl would re-read modifiers (none left)
      const node = this.parseTypeDecl();
      for (const m of mods) node.mods.add(m);
      return node;
    }
    skipThrows() {
      if (this.accept('throws')) do { this.parseType(); } while (this.accept(','));
    }
    parseParams() {
      this.expect('(');
      const params = [];
      if (!this.is(')')) {
        do {
          this.skipAnnotationsAndMods();
          let ty = this.parseType();
          let varargs = false;
          if (this.is('.') && this.is('.', 1) && this.is('.', 2)) { this.next(); this.next(); this.next(); varargs = true; ty = { name: ty.name, dims: ty.dims + 1 }; }
          const name = this.ident();
          while (this.is('[') && this.is(']', 1)) { this.next(); this.next(); ty = { name: ty.name, dims: ty.dims + 1 }; }
          params.push({ name, ty, varargs });
        } while (this.accept(','));
      }
      this.expect(')');
      return params;
    }

    /* ---------- statements ---------- */
    parseBlock() {
      const line = this.expect('{').line;
      const body = [];
      while (!this.is('}')) {
        if (this.eof()) throw this.fail('reached end of file while parsing');
        body.push(this.parseStatement());
      }
      this.expect('}');
      return { k: 'block', body, line };
    }

    isLocalDeclStart() {
      const save = this.p;
      try {
        while (this.is('final')) this.next();
        this.parseType();
        const x = this.peek();
        if (!(x.t === 'id' && !KEYWORDS.has(x.v))) return false;
        const after = this.peek(1);
        return after.t === 'op' && ['=', ';', ',', ':', '['].includes(after.v)
          || (after.t !== 'op' && after.t !== 'eof') // missing semicolon cases like "int x 5"
          || after.t === 'eof';
      } catch (e) {
        if (e instanceof JavaError) return false;
        throw e;
      } finally { this.p = save; }
    }

    parseStatement() {
      const t = this.peek();
      const line = t.line;
      if (t.t === 'op') {
        if (t.v === '{') return this.parseBlock();
        if (t.v === ';') { this.next(); return { k: 'empty', line }; }
        if (t.v === '@') { this.skipAnnotationsAndMods(); return this.parseStatement(); }
      }
      if (t.t === 'id') {
        switch (t.v) {
          case 'if': {
            this.next(); this.expect('(');
            const cond = this.parseExpression(); this.expect(')');
            const then = this.parseStatement();
            let els = null;
            if (this.accept('else')) els = this.parseStatement();
            return { k: 'if', cond, then, els, line };
          }
          case 'while': {
            this.next(); this.expect('(');
            const cond = this.parseExpression(); this.expect(')');
            return { k: 'while', cond, body: this.parseStatement(), line };
          }
          case 'do': {
            this.next();
            const body = this.parseStatement();
            this.expect('while'); this.expect('(');
            const cond = this.parseExpression(); this.expect(')'); this.expect(';');
            return { k: 'dowhile', cond, body, line };
          }
          case 'for': return this.parseFor();
          case 'return': {
            this.next();
            let value = null;
            if (!this.is(';')) value = this.parseExpression();
            this.expect(';');
            return { k: 'return', value, line };
          }
          case 'break': this.next(); this.expect(';'); return { k: 'break', line };
          case 'continue': this.next(); this.expect(';'); return { k: 'continue', line };
          case 'throw': {
            this.next();
            const value = this.parseExpression(); this.expect(';');
            return { k: 'throw', value, line };
          }
          case 'try': return this.parseTry();
          case 'switch': return this.parseSwitch();
          case 'else': throw this.fail("'else' without 'if'");
          case 'case': case 'default':
            throw this.fail(`orphaned ${t.v}`);
          case 'class': case 'interface': case 'enum':
            throw this.fail('local classes are not supported in this playground');
        }
        if (this.isLocalDeclStart()) {
          const d = this.parseLocalDecl();
          this.expect(';');
          return d;
        }
      }
      const e = this.parseExpression();
      if (!['assign', 'call', 'incdec', 'new', 'ctorCall'].includes(e.k)) throw compileErr('not a statement', e.line || line);
      this.expect(';');
      return { k: 'expr', expr: e, line };
    }

    parseLocalDecl() {
      let isFinal = false;
      while (this.is('final')) { this.next(); isFinal = true; }
      const ty = this.parseType();
      const decls = [];
      do {
        const line = this.peek().line;
        const name = this.ident();
        let t2 = ty;
        while (this.is('[') && this.is(']', 1)) { this.next(); this.next(); t2 = { name: ty.name, dims: t2.dims + 1 }; }
        let init = null;
        if (this.accept('=')) init = this.is('{') ? this.parseArrayLit() : this.parseExpression();
        decls.push({ name, ty: t2, init, line });
      } while (this.accept(','));
      return { k: 'local', decls, isFinal, line: decls[0].line };
    }

    parseFor() {
      const line = this.next().line;
      this.expect('(');
      // for-each?
      const fe = this.speculate(() => {
        while (this.is('final')) this.next();
        const ty = this.parseType();
        const name = this.ident();
        this.expect(':');
        return { ty, name };
      });
      if (fe) {
        const iter = this.parseExpression(); this.expect(')');
        return { k: 'foreach', ty: fe.ty, name: fe.name, iter, body: this.parseStatement(), line };
      }
      let init = [];
      if (!this.is(';')) {
        if (this.isLocalDeclStart()) init = [this.parseLocalDecl()];
        else {
          do { const e = this.parseExpression(); init.push({ k: 'expr', expr: e, line: e.line }); } while (this.accept(','));
        }
      }
      this.expect(';');
      const cond = this.is(';') ? null : this.parseExpression();
      this.expect(';');
      const update = [];
      if (!this.is(')')) do { update.push(this.parseExpression()); } while (this.accept(','));
      this.expect(')');
      return { k: 'for', init, cond, update, body: this.parseStatement(), line };
    }

    parseTry() {
      const line = this.next().line;
      if (this.is('(')) throw this.fail('try-with-resources is not supported in this playground');
      const block = this.parseBlock();
      const catches = [];
      while (this.is('catch')) {
        this.next(); this.expect('(');
        while (this.is('final')) this.next();
        const types = [this.parseType().name];
        while (this.accept('|')) types.push(this.parseType().name);
        const name = this.ident();
        this.expect(')');
        catches.push({ types, name, body: this.parseBlock() });
      }
      let fin = null;
      if (this.accept('finally')) fin = this.parseBlock();
      if (!catches.length && !fin) throw compileErr("'try' without 'catch', 'finally' or resource declarations", line);
      return { k: 'try', block, catches, fin, line };
    }

    parseSwitch() {
      const line = this.next().line;
      this.expect('(');
      const value = this.parseExpression(); this.expect(')');
      this.expect('{');
      const cases = [];
      while (!this.is('}')) {
        if (this.eof()) throw this.fail('reached end of file while parsing');
        let labels = null;
        if (this.accept('case')) {
          labels = [];
          do { labels.push(this.parseTernary()); } while (this.accept(','));
        } else this.expect('default');
        if (this.accept('->')) {
          let body;
          if (this.is('{')) body = this.parseBlock();
          else if (this.is('throw')) body = this.parseStatement();
          else { const e = this.parseExpression(); this.expect(';'); body = { k: 'expr', expr: e, line: e.line }; }
          cases.push({ labels, arrow: true, body: [body] });
        } else {
          this.expect(':');
          const body = [];
          while (!this.is('case') && !this.is('default') && !this.is('}')) {
            if (this.eof()) throw this.fail('reached end of file while parsing');
            body.push(this.parseStatement());
          }
          cases.push({ labels, arrow: false, body });
        }
      }
      this.expect('}');
      return { k: 'switch', value, cases, line };
    }

    /* ---------- expressions ---------- */
    parseExpression() { return this.parseAssignment(); }

    isLambdaStart() {
      const x = this.peek();
      if (x.t === 'id' && !KEYWORDS.has(x.v) && this.is('->', 1)) return true;
      if (this.is('(')) {
        let k = 0, d = 0;
        do {
          if (this.is('(', k)) d++;
          else if (this.is(')', k)) d--;
          k++;
          if (this.peek(k).t === 'eof') return false;
        } while (d > 0);
        return this.is('->', k);
      }
      return false;
    }
    parseLambda() {
      const line = this.peek().line;
      const params = [];
      if (this.peek().t === 'id' && this.is('->', 1)) params.push(this.next().v);
      else {
        this.expect('(');
        if (!this.is(')')) {
          do {
            // allow "Type name" or just "name"
            if (this.peek(1).t === 'id' || this.is('<', 1) || this.is('.', 1) || this.is('[', 1)) this.parseType();
            params.push(this.ident());
          } while (this.accept(','));
        }
        this.expect(')');
      }
      this.expect('->');
      const body = this.is('{') ? this.parseBlock() : this.parseExpression();
      return { k: 'lambda', params, body, line };
    }

    parseAssignment() {
      if (this.isLambdaStart()) return this.parseLambda();
      const lhs = this.parseTernary();
      const x = this.peek();
      if (x.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].includes(x.v)) {
        if (!['name', 'field', 'index'].includes(lhs.k)) throw compileErr('unexpected type: required variable, found value', x.line);
        this.next();
        const value = this.is('{') && x.v === '=' ? this.parseArrayLit() : this.parseAssignment();
        return { k: 'assign', op: x.v, target: lhs, value, line: x.line };
      }
      return lhs;
    }

    parseTernary() {
      const cond = this.parseBinary(1);
      if (this.is('?')) {
        const line = this.next().line;
        const a = this.parseAssignment();
        this.expect(':');
        const b = this.isLambdaStart() ? this.parseLambda() : this.parseTernary();
        return { k: 'ternary', cond, a, b, line };
      }
      return cond;
    }

    binPrec(x) {
      if (x.t === 'id' && x.v === 'instanceof') return 5;
      if (x.t !== 'op') return 0;
      switch (x.v) {
        case '||': return 1;
        case '&&': return 2;
        case '|': return 3;
        case '^': return 3;
        case '&': return 3;
        case '==': case '!=': return 4;
        case '<': case '>': case '<=': case '>=': return 5;
        case '+': case '-': return 6;
        case '*': case '/': case '%': return 7;
      }
      return 0;
    }
    parseBinary(minPrec) {
      let left = this.parseUnary();
      for (;;) {
        const x = this.peek();
        const prec = this.binPrec(x);
        if (!prec || prec < minPrec) break;
        this.next();
        if (x.v === 'instanceof') {
          const ty = this.parseType();
          let bind = null;
          if (this.peek().t === 'id' && !KEYWORDS.has(this.peek().v)) bind = this.next().v;
          left = { k: 'instanceof', expr: left, ty, bind, line: x.line };
          continue;
        }
        const right = this.parseBinary(prec + 1);
        left = (x.v === '&&' || x.v === '||')
          ? { k: 'logical', op: x.v, a: left, b: right, line: x.line }
          : { k: 'binary', op: x.v, a: left, b: right, line: x.line };
      }
      return left;
    }

    parseUnary() {
      const x = this.peek();
      if (x.t === 'op') {
        if (x.v === '-' || x.v === '+' || x.v === '!' || x.v === '~') {
          this.next();
          const e = this.parseUnary();
          if (x.v === '-' && e.k === 'lit' && (typeof e.value === 'number' || e.value instanceof JDouble) && !e.neg) {
            return { k: 'lit', value: e.value instanceof JDouble ? new JDouble(-e.value.v) : -e.value, line: x.line, neg: true };
          }
          return { k: 'unary', op: x.v, e, line: x.line };
        }
        if (x.v === '++' || x.v === '--') {
          this.next();
          const e = this.parseUnary();
          if (!['name', 'field', 'index'].includes(e.k)) throw compileErr('unexpected type: required variable, found value', x.line);
          return { k: 'incdec', op: x.v, prefix: true, target: e, line: x.line };
        }
        if (x.v === '(') {
          const cast = this.tryCast();
          if (cast) return cast;
        }
      }
      return this.parsePostfix();
    }

    tryCast() {
      const save = this.p;
      const line = this.peek().line;
      const r = this.speculate(() => {
        this.expect('(');
        const ty = this.parseType();
        this.expect(')');
        return ty;
      });
      if (!r) { this.p = save; return null; }
      const nx = this.peek();
      if (PRIM.has(r.name) && r.dims === 0) {
        // (int) x  /  (double) -x
        if (nx.t === 'eof' || (nx.t === 'op' && !['(', '-', '+', '!', '~', '++', '--'].includes(nx.v))) { this.p = save; return null; }
        return { k: 'cast', ty: r, e: this.parseUnary(), line };
      }
      // (Type) value  — only when what follows clearly starts an operand
      const ok = nx.t === 'str' || nx.t === 'num' || nx.t === 'chr' ||
        (nx.t === 'id' && (!KEYWORDS.has(nx.v) || ['this', 'new', 'null', 'true', 'false', 'super'].includes(nx.v))) ||
        (nx.t === 'op' && (nx.v === '(' || nx.v === '!'));
      if (ok && /^[A-Z]/.test(r.name)) return { k: 'cast', ty: r, e: this.parseUnary(), line };
      this.p = save;
      return null;
    }

    parseArgs() {
      this.expect('(');
      const args = [];
      if (!this.is(')')) do { args.push(this.parseExpression()); } while (this.accept(','));
      this.expect(')');
      return args;
    }

    parseArrayLit() {
      const line = this.expect('{').line;
      const elems = [];
      while (!this.is('}')) {
        elems.push(this.is('{') ? this.parseArrayLit() : this.parseExpression());
        if (!this.accept(',')) break;
      }
      this.expect('}');
      return { k: 'arrayLit', elems, line };
    }

    parsePostfix() {
      let e = this.parsePrimary();
      for (;;) {
        const x = this.peek();
        if (x.t !== 'op') break;
        if (x.v === '.') {
          this.next();
          if (this.is('<')) this.parseTypeArgs(); // explicit generic call
          const id = this.ident();
          if (this.is('(')) e = { k: 'call', obj: e, id, args: this.parseArgs(), line: x.line };
          else e = { k: 'field', obj: e, id, line: x.line };
        } else if (x.v === '[') {
          this.next();
          const idx = this.parseExpression(); this.expect(']');
          e = { k: 'index', obj: e, idx, line: x.line };
        } else if (x.v === '++' || x.v === '--') {
          if (!['name', 'field', 'index'].includes(e.k)) break;
          this.next();
          e = { k: 'incdec', op: x.v, prefix: false, target: e, line: x.line };
        } else if (x.v === '::') {
          this.next();
          const id = this.is('new') ? (this.next(), 'new') : this.ident();
          e = { k: 'mref', target: e, id, line: x.line };
        } else break;
      }
      return e;
    }

    parsePrimary() {
      const x = this.peek();
      const line = x.line;
      switch (x.t) {
        case 'num': this.next(); return { k: 'lit', value: x.kind === 'double' ? new JDouble(x.v) : x.v, line };
        case 'str': this.next(); return { k: 'lit', value: x.v, line };
        case 'chr': this.next(); return { k: 'lit', value: new JChar(x.v), line };
        case 'eof': throw this.fail('reached end of file while parsing');
        case 'op':
          if (x.v === '(') {
            this.next();
            const e = this.parseExpression();
            this.expect(')');
            return e.k === 'lit' ? { ...e, paren: true } : { k: 'paren', e, line };
          }
          throw this.fail('illegal start of expression');
      }
      // identifiers / keywords
      switch (x.v) {
        case 'true': this.next(); return { k: 'lit', value: true, line };
        case 'false': this.next(); return { k: 'lit', value: false, line };
        case 'null': this.next(); return { k: 'lit', value: null, line };
        case 'this':
          this.next();
          if (this.is('(')) return { k: 'ctorCall', which: 'this', args: this.parseArgs(), line };
          return { k: 'this', line };
        case 'super':
          this.next();
          if (this.is('(')) return { k: 'ctorCall', which: 'super', args: this.parseArgs(), line };
          if (this.is('::')) return { k: 'super', line };
          this.expect('.');
          { const id = this.ident();
            if (this.is('(')) return { k: 'call', obj: { k: 'super', line }, id, args: this.parseArgs(), line };
            return { k: 'field', obj: { k: 'this', line }, id, line }; }
        case 'new': return this.parseNew();
        case 'switch': throw this.fail('switch expressions are not supported in this playground (use a switch statement)');
      }
      if (KEYWORDS.has(x.v) && !PRIM.has(x.v)) throw this.fail('illegal start of expression');
      if (PRIM.has(x.v)) {
        // e.g. int[]::new or int.class — unsupported
        throw this.fail("'.class' expected");
      }
      this.next();
      if (this.is('(')) return { k: 'call', obj: null, id: x.v, args: this.parseArgs(), line };
      return { k: 'name', id: x.v, line };
    }

    parseNew() {
      const line = this.next().line;
      const t = this.peek();
      if (t.t !== 'id') throw this.fail('<identifier> expected');
      this.next();
      let name = t.v;
      if (!PRIM.has(name)) {
        while (this.is('.') && this.peek(1).t === 'id') { this.next(); name = this.next().v; }
        if (this.is('<')) this.parseTypeArgs();
      }
      if (this.is('[')) {
        const dimExprs = [];
        let dims = 0;
        while (this.is('[')) {
          this.next();
          if (this.is(']')) { this.next(); dims++; continue; }
          if (dimExprs.length !== dims) throw this.fail("']' expected");
          dimExprs.push(this.parseExpression()); this.expect(']'); dims++;
        }
        let init = null;
        if (this.is('{')) init = this.parseArrayLit();
        return { k: 'newArray', ty: { name, dims }, dimExprs, init, line };
      }
      const args = this.parseArgs();
      if (this.is('{')) throw this.fail('anonymous classes are not supported in this playground — use a lambda or a named class');
      return { k: 'new', cls: name, args, line };
    }
  }

  /* ------------------------------------------------------------------ *
   * Helpers: value formatting, conversion
   * ------------------------------------------------------------------ */

  function fmtDouble(x) {
    if (Number.isNaN(x)) return 'NaN';
    if (x === Infinity) return 'Infinity';
    if (x === -Infinity) return '-Infinity';
    if (x === 0) return 1 / x < 0 ? '-0.0' : '0.0';
    const ax = Math.abs(x);
    if (ax >= 1e-3 && ax < 1e7) {
      let s = String(x);
      if (!s.includes('.')) s += '.0';
      return s;
    }
    const s = x.toExponential();
    let [m, e] = s.split('e');
    if (!m.includes('.')) m += '.0';
    return m + 'E' + e.replace('+', '');
  }

  function defaultValue(ty) {
    if (!ty || ty.dims > 0) return null;
    switch (ty.name) {
      case 'int': case 'long': case 'short': case 'byte': return 0;
      case 'double': case 'float': return new JDouble(0);
      case 'boolean': return false;
      case 'char': return new JChar(0);
      default: return null;
    }
  }

  const QUALIFIED = {
    Throwable: 'java.lang.Throwable', Exception: 'java.lang.Exception', RuntimeException: 'java.lang.RuntimeException',
    Error: 'java.lang.Error', ArithmeticException: 'java.lang.ArithmeticException',
    NullPointerException: 'java.lang.NullPointerException', IllegalArgumentException: 'java.lang.IllegalArgumentException',
    IllegalStateException: 'java.lang.IllegalStateException', IndexOutOfBoundsException: 'java.lang.IndexOutOfBoundsException',
    ArrayIndexOutOfBoundsException: 'java.lang.ArrayIndexOutOfBoundsException',
    StringIndexOutOfBoundsException: 'java.lang.StringIndexOutOfBoundsException',
    NumberFormatException: 'java.lang.NumberFormatException', ClassCastException: 'java.lang.ClassCastException',
    UnsupportedOperationException: 'java.lang.UnsupportedOperationException', StackOverflowError: 'java.lang.StackOverflowError',
    NegativeArraySizeException: 'java.lang.NegativeArraySizeException',
    IllegalFormatConversionException: 'java.util.IllegalFormatConversionException',
    NoSuchElementException: 'java.util.NoSuchElementException',
    ConcurrentModificationException: 'java.util.ConcurrentModificationException'
  };

  // Base classes every program gets (written in the same Java subset).
  const BASE_PRELUDE = `
class Throwable {
  private String _message;
  private Throwable _cause;
  Throwable() {}
  Throwable(String message) { this._message = message; }
  Throwable(String message, Throwable cause) { this._message = message; this._cause = cause; }
  public String getMessage() { return _message; }
  public Throwable getCause() { return _cause; }
  public String toString() {
    String n = getClass().getName();
    if (_message == null) { return n; }
    return n + ": " + _message;
  }
  public void printStackTrace() { System.err.println(this); }
}
class Exception extends Throwable {}
class RuntimeException extends Exception {}
class Error extends Throwable {}
class ArithmeticException extends RuntimeException {}
class NullPointerException extends RuntimeException {}
class IllegalArgumentException extends RuntimeException {}
class IllegalStateException extends RuntimeException {}
class UnsupportedOperationException extends RuntimeException {}
class ClassCastException extends RuntimeException {}
class NegativeArraySizeException extends RuntimeException {}
class NoSuchElementException extends RuntimeException {}
class IllegalFormatConversionException extends IllegalArgumentException {}
class NumberFormatException extends IllegalArgumentException {}
class IndexOutOfBoundsException extends RuntimeException {}
class ArrayIndexOutOfBoundsException extends IndexOutOfBoundsException {}
class StringIndexOutOfBoundsException extends IndexOutOfBoundsException {}
class StackOverflowError extends Error {}
`;

  const PRELUDES = Object.create(null);
  const PARSED_PRELUDES = Object.create(null);
  function registerPrelude(name, src) { PRELUDES[name] = src; delete PARSED_PRELUDES[name]; }

  function parseSource(src) {
    return new Parser(lex(src)).parseProgram();
  }
  function parsedPrelude(name, src) {
    if (!PARSED_PRELUDES[name]) PARSED_PRELUDES[name] = parseSource(src);
    return PARSED_PRELUDES[name];
  }

  /* ------------------------------------------------------------------ *
   * Interpreter
   * ------------------------------------------------------------------ */

  class ClassInfo {
    constructor(node, outer) {
      this.name = node.name; this.node = node; this.kind = node.kind; this.outer = outer;
      this.fields = new Map(); this.methods = new Map(); this.ctors = node.ctors;
      this.statics = Object.create(null);
      this.initState = 0; this.fromPrelude = false;
      this.superCls = null; this.ifaceCls = [];
      this.isAbstract = node.mods.has('abstract');
      this.enumConsts = [];
    }
  }

  const MAX_DEPTH = 1200;

  class Interp {
    constructor(opts) {
      this.opts = opts || {};
      this.outBuf = [];
      this.outLen = 0;
      this.maxSteps = this.opts.maxSteps || 3000000;
      this.maxOut = this.opts.maxOutput || 60000;
      this.steps = 0;
      this.depth = 0;
      this.curLine = 0;
      this.classes = new Map();
      this.checks = [];
      this.events = [];
      this.userLines = this.opts.userLines || Infinity;
    }

    /* ---------- loading ---------- */
    declareClass(node, outer, fromPrelude) {
      if (this.classes.has(node.name) && !fromPrelude) {
        const prev = this.classes.get(node.name);
        if (!prev.fromPrelude) throw compileErr(`duplicate class: ${node.name}`, node.line);
      }
      const ci = new ClassInfo(node, outer);
      ci.fromPrelude = !!fromPrelude;
      for (const f of node.fields) {
        ci.fields.set(f.name, f);
        f.owner = ci;
      }
      for (const m of node.methods) {
        m.owner = ci;
        if (!ci.methods.has(m.name)) ci.methods.set(m.name, []);
        ci.methods.get(m.name).push(m);
      }
      for (const c of node.ctors) c.owner = ci;
      if (node.kind === 'enum') {
        // each enum constant is also a public static final field of the enum
        for (const c of node.consts) {
          if (ci.fields.has(c.name)) continue;
          ci.fields.set(c.name, { k: 'field', name: c.name, ty: { name: node.name, dims: 0 }, init: null, mods: new Set(['public', 'static', 'final']), isStatic: true, isFinal: true, line: c.line, owner: ci, enumConst: true });
        }
      }
      this.classes.set(node.name, ci);
      for (const inner of node.nested) this.declareClass(inner, ci, fromPrelude);
      return ci;
    }
    link() {
      for (const ci of this.classes.values()) {
        if (ci.node.superName) {
          const s = this.classes.get(ci.node.superName);
          if (!s) throw compileErr(`cannot find symbol\n  symbol: class ${ci.node.superName}`, ci.node.line);
          ci.superCls = s;
        }
        ci.ifaceCls = ci.node.ifaces.map((n) => this.classes.get(n)).filter(Boolean);
      }
      // cycle check
      for (const ci of this.classes.values()) {
        let c = ci, n = 0;
        while (c && n++ < 100) c = c.superCls;
        if (n >= 100) throw compileErr('cyclic inheritance involving ' + ci.name, ci.node.line);
      }
      this.checkOverrides();
    }

    /* @Override must really override something (javac: "method does not override
       or implement a method from a supertype"). WPILib is big and this fake only has
       part of it, so when a supertype comes from the fake WPILib we only complain
       about names that look like typos of a method it has, or a wrong parameter count. */
    checkOverrides() {
      const OBJECT_ARITY = { toString: 0, equals: 1, hashCode: 0 };
      const editDistance = (a, b) => {
        const d = [];
        for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
          d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        return d[a.length][b.length];
      };
      for (const ci of this.classes.values()) {
        if (ci.fromPrelude) continue;
        if (ci.node.ifaces.length !== ci.ifaceCls.length) continue; // an interface we don't know: can't judge
        const supers = [];
        const seen = new Set();
        const walk = (c) => {
          if (!c || seen.has(c)) return;
          seen.add(c); supers.push(c);
          walk(c.superCls);
          for (const i of c.ifaceCls) walk(i);
        };
        walk(ci.superCls);
        for (const i of ci.ifaceCls) walk(i);
        const allUser = supers.every((c) => !c.fromPrelude);
        for (const [name, ms] of ci.methods) {
          for (const m of ms) {
            if (!m.mods.has('@Override')) continue;
            if (OBJECT_ARITY[name] === m.params.length) continue;
            let sameName = false, sameArity = false;
            const names = new Set();
            for (const c of supers) for (const [n2, ms2] of c.methods) {
              names.add(n2);
              if (n2 === name) { sameName = true; if (ms2.some((x) => x.params.length === m.params.length)) sameArity = true; }
            }
            let bad;
            if (sameArity) bad = false;
            else if (sameName) bad = true;
            else if (allUser) bad = true;
            else bad = Array.from(names).some((n) => n !== name && editDistance(n.toLowerCase(), name.toLowerCase()) <= 2 && Math.min(n.length, name.length) >= 4);
            if (bad) throw compileErr('method does not override or implement a method from a supertype', m.mods.overrideLine || m.line);
          }
        }
      }
    }

    load(prog, fromPrelude) {
      for (const c of prog.classes) this.declareClass(c, null, fromPrelude);
    }

    /* ---------- output ---------- */
    write(s, err) {
      this.outLen += s.length;
      if (this.outLen > this.maxOut) throw new JavaError('limit', 'Your program printed too much output (is there an infinite loop?)', this.curLine);
      this.outBuf.push(err ? { err: true, s } : s);
    }
    getOutput() {
      // merge consecutive plain strings; keep stderr parts marked
      return this.outBuf.map((x) => (typeof x === 'string' ? x : x.s)).join('');
    }

    /* ---------- errors thrown into Java ---------- */
    throwNew(clsName, message, line) {
      const ci = this.classes.get(clsName);
      const obj = new JObject(ci);
      for (let c = ci; c; c = c.superCls) for (const [n, f] of c.fields) if (!f.isStatic) obj.f[n] = defaultValue(f.ty);
      obj.f._message = message === undefined ? null : message;
      obj.throwLine = line || this.curLine;
      throw new JavaThrow(obj);
    }

    tick() {
      if (++this.steps > this.maxSteps) {
        throw new JavaError('limit', 'Your program ran for too long. Is there an infinite loop?', this.curLine);
      }
    }

    /* ---------- class helpers ---------- */
    outermost(c) { while (c.outer) c = c.outer; return c; }
    isSubclassOf(cls, name) {
      if (!cls) return false;
      if (cls.name === name) return true;
      if (this.isSubclassOf(cls.superCls, name)) return true;
      for (const i of cls.ifaceCls) if (this.isSubclassOf(i, name)) return true;
      return false;
    }
    findField(cls, name) {
      for (let c = cls; c; c = c.superCls) {
        const f = c.fields.get(name);
        if (f) return f;
        for (const i of c.ifaceCls) { const g = this.findField(i, name); if (g) return g; }
      }
      return null;
    }
    findMethods(cls, name) {
      const out = [], seen = new Set();
      const visit = (c) => {
        if (!c || seen.has(c)) return;
        seen.add(c);
        const ms = c.methods.get(name);
        if (ms) out.push(...ms);
        visit(c.superCls);
        for (const i of c.ifaceCls) visit(i);
      };
      visit(cls);
      return out;
    }

    ensureInit(cls) {
      if (cls.initState !== 0) return;
      cls.initState = 1;
      if (cls.superCls) this.ensureInit(cls.superCls);
      const env = { scope: Object.create(null), thisObj: null, cls, inInit: true };
      for (const f of cls.node.fields) if (f.isStatic) cls.statics[f.name] = defaultValue(f.ty);
      if (cls.kind === 'enum') {
        cls.node.consts.forEach((c, i) => {
          const obj = new JObject(cls);
          for (let k = cls; k; k = k.superCls) for (const [n, f] of k.fields) if (!f.isStatic) obj.f[n] = defaultValue(f.ty);
          obj.enumName = c.name; obj.enumOrdinal = i;
          this.curLine = c.line;
          const args = c.args.map((a) => this.eval(a, env));
          this.construct(cls, obj, args, c.line, env);
          cls.statics[c.name] = obj;
          cls.enumConsts.push(obj);
        });
      }
      for (const item of cls.node.initItems) {
        this.curLine = item.line;
        if (item.k === 'field') {
          if (item.init) cls.statics[item.name] = this.evalInit(item.init, item.ty, env);
        } else this.exec(item.body, env);
      }
      cls.initState = 2;
    }

    /* ---------- entry ---------- */
    runMain(prog, hasLoose) {
      let mainCls = null, mainM = null;
      if (hasLoose) {
        mainCls = this.classes.get('$Main');
        mainM = mainCls.methods.get('main')[0];
      } else {
        const cands = [];
        for (const ci of this.classes.values()) {
          if (ci.fromPrelude) continue;
          for (const m of ci.methods.get('main') || []) {
            if (m.mods.has('static') && m.retTy.name === 'void') cands.push([ci, m]);
          }
        }
        if (!cands.length) return false;
        const pick = cands.find(([ci]) => ci.name === 'Main') || cands[0];
        [mainCls, mainM] = pick;
      }
      this.ensureInit(mainCls);
      const args = mainM.params.length ? [new JArray('String', [])] : [];
      this.invoke(mainM, null, args);
      return true;
    }

    /* ---------- statements ---------- */
    exec(node, env) {
      this.tick();
      this.curLine = node.line || this.curLine;
      switch (node.k) {
        case 'block': {
          const e = { scope: Object.create(env.scope), thisObj: env.thisObj, cls: env.cls, method: env.method, inInit: env.inInit };
          for (const s of node.body) {
            const sig = this.exec(s, e);
            if (sig) return sig;
          }
          return null;
        }
        case 'empty': return null;
        case 'expr': this.eval(node.expr, env); return null;
        case 'local': {
          for (const d of node.decls) {
            this.curLine = d.line;
            this.declareVar(env, d.name, d.ty, d.init, node.isFinal, d.line);
          }
          return null;
        }
        case 'if': {
          const c = this.evalCond(node.cond, env);
          if (c) return this.exec(node.then, env);
          if (node.els) return this.exec(node.els, env);
          return null;
        }
        case 'while': {
          while (this.evalCond(node.cond, env)) {
            const sig = this.exec(node.body, env);
            if (sig) { if (sig === BREAK) break; if (sig === CONTINUE) continue; return sig; }
          }
          return null;
        }
        case 'dowhile': {
          do {
            const sig = this.exec(node.body, env);
            if (sig) { if (sig === BREAK) break; if (sig === CONTINUE) continue; return sig; }
          } while (this.evalCond(node.cond, env));
          return null;
        }
        case 'for': {
          const e = { scope: Object.create(env.scope), thisObj: env.thisObj, cls: env.cls, method: env.method, inInit: env.inInit };
          for (const i of node.init) this.exec(i, e);
          while (node.cond === null || this.evalCond(node.cond, e)) {
            const sig = this.exec(node.body, e);
            if (sig) { if (sig === BREAK) break; if (sig !== CONTINUE) return sig; }
            for (const u of node.update) this.eval(u, e);
          }
          return null;
        }
        case 'foreach': {
          const coll = this.eval(node.iter, env);
          let items;
          if (coll instanceof JArray) items = coll.items;
          else if (coll instanceof JNative && (coll.kind === 'List')) items = coll.data;
          else if (coll === null) this.throwNew('NullPointerException', 'Cannot iterate over null', node.line);
          else throw compileErr('for-each not applicable to expression type', node.line);
          const snapshotLen = items.length;
          for (let i = 0; i < items.length; i++) {
            if (coll instanceof JNative && items.length !== snapshotLen) this.throwNew('ConcurrentModificationException', undefined, node.line);
            const e = { scope: Object.create(env.scope), thisObj: env.thisObj, cls: env.cls, method: env.method, inInit: env.inInit };
            this.checkRedeclare(env, node.name, node.line);
            e.scope[node.name] = { ty: node.ty.name === 'var' ? null : node.ty, v: node.ty.name === 'var' ? items[i] : coerce(items[i], node.ty, node.line) };
            const sig = this.exec(node.body, e);
            if (sig) { if (sig === BREAK) break; if (sig === CONTINUE) continue; return sig; }
          }
          return null;
        }
        case 'return': {
          if (node.value === null) return { ret: true, val: undefined };
          return { ret: true, val: this.eval(node.value, env) };
        }
        case 'break': return BREAK;
        case 'continue': return CONTINUE;
        case 'throw': {
          const v = this.eval(node.value, env);
          if (v === null) this.throwNew('NullPointerException', 'Cannot throw exception because value is null', node.line);
          if (!(v instanceof JObject) || !this.isSubclassOf(v.cls, 'Throwable')) throw compileErr(`incompatible types: ${typeName(v)} cannot be converted to Throwable`, node.line);
          v.throwLine = node.line;
          throw new JavaThrow(v);
        }
        case 'try': return this.execTry(node, env);
        case 'switch': return this.execSwitch(node, env);
        default:
          throw compileErr('unsupported statement: ' + node.k, node.line);
      }
    }

    execTry(node, env) {
      let sig = null;
      try {
        try {
          sig = this.exec(node.block, env);
        } catch (ex) {
          if (!(ex instanceof JavaThrow)) throw ex;
          const clause = node.catches.find((c) => c.types.some((t) => this.isSubclassOf(ex.obj.cls, t)));
          if (!clause) throw ex;
          const e = { scope: Object.create(env.scope), thisObj: env.thisObj, cls: env.cls, method: env.method, inInit: env.inInit };
          e.scope[clause.name] = { ty: null, v: ex.obj };
          sig = this.exec(clause.body, e);
        }
      } finally {
        if (node.fin) {
          const fsig = this.exec(node.fin, env);
          if (fsig) sig = fsig; // finally can override (return/break)
        }
      }
      return sig;
    }

    execSwitch(node, env) {
      const val = this.eval(node.value, env);
      let start = -1;
      outer: for (let i = 0; i < node.cases.length; i++) {
        const c = node.cases[i];
        if (!c.labels) continue;
        for (const lab of c.labels) {
          if (this.switchMatch(val, lab, env)) { start = i; break outer; }
        }
      }
      if (start < 0) start = node.cases.findIndex((c) => !c.labels);
      if (start < 0) return null;
      const e = { scope: Object.create(env.scope), thisObj: env.thisObj, cls: env.cls, method: env.method, inInit: env.inInit };
      if (node.cases[start].arrow) {
        const sig = this.exec(node.cases[start].body[0], e);
        if (sig === BREAK) return null;
        return sig;
      }
      for (let i = start; i < node.cases.length; i++) {
        for (const s of node.cases[i].body) {
          const sig = this.exec(s, e);
          if (sig === BREAK) return null;
          if (sig) return sig;
        }
      }
      return null;
    }
    switchMatch(val, lab, env) {
      if (val instanceof JObject && val.enumName !== undefined && lab.k === 'name') return lab.id === val.enumName;
      const lv = this.eval(lab, env);
      return this.valuesEqual(val, lv);
    }

    checkRedeclare(env, name, line) {
      if (env.scope[name] !== undefined) {
        const m = env.method;
        const where = m ? (m.k === 'ctor' ? `constructor ${m.name}(${m.params.map((p) => typeStr(p.ty)).join(',')})` : `method ${m.name}(${m.params.map((p) => typeStr(p.ty)).join(',')})`) : 'this scope';
        throw compileErr(`variable ${name} is already defined in ${where}`, line);
      }
    }

    declareVar(env, name, ty, init, isFinal, line) {
      this.checkRedeclare(env, name, line);
      let v, vty = ty;
      if (ty.name === 'var' && ty.dims === 0) {
        if (!init) throw compileErr("cannot infer type for local variable " + name, line);
        v = this.eval(init, env);
        vty = null;
      } else if (init) {
        v = this.evalInit(init, ty, env);
      } else {
        v = undefined; // definitely-unassigned; reading gives an error
      }
      env.scope[name] = { ty: vty, v, final: isFinal && init !== null, unassigned: v === undefined };
    }

    evalCond(node, env) {
      const v = this.eval(node, env);
      if (typeof v !== 'boolean') throw compileErr(`incompatible types: ${typeName(v)} cannot be converted to boolean`, node.line || this.curLine);
      return v;
    }

    evalInit(init, ty, env) {
      if (init.k === 'arrayLit') {
        if (ty.dims === 0) throw compileErr('illegal initializer for ' + ty.name, init.line);
        return this.buildArrayLit(init, ty, env);
      }
      const v = this.eval(init, env);
      return coerce(v, ty, init.line || this.curLine);
    }
    buildArrayLit(lit, ty, env) {
      const elemTy = { name: ty.name, dims: ty.dims - 1 };
      const items = lit.elems.map((e) => {
        if (e.k === 'arrayLit') {
          if (elemTy.dims === 0) throw compileErr('illegal initializer for ' + ty.name, e.line);
          return this.buildArrayLit(e, elemTy, env);
        }
        return coerce(this.eval(e, env), elemTy, e.line || lit.line);
      });
      return new JArray(arrTypeStr(ty), items);
    }

    /* ---------- expressions ---------- */
    eval(node, env) {
      this.tick();
      switch (node.k) {
        case 'lit': return node.value;
        case 'paren': return this.eval(node.e, env);
        case 'name': return this.evalName(node, env);
        case 'this':
          if (!env.thisObj) throw compileErr('non-static variable this cannot be referenced from a static context', node.line);
          return env.thisObj;
        case 'binary': return this.evalBinary(node, env);
        case 'logical': {
          const a = this.eval(node.a, env);
          if (typeof a !== 'boolean') throw compileErr(`bad operand types for binary operator '${node.op}'\n  first type:  ${typeName(a)}`, node.line);
          if (node.op === '&&' ? !a : a) return a;
          const b = this.eval(node.b, env);
          if (typeof b !== 'boolean') throw compileErr(`bad operand types for binary operator '${node.op}'\n  second type: ${typeName(b)}`, node.line);
          return b;
        }
        case 'unary': return this.evalUnary(node, env);
        case 'ternary': {
          const c = this.evalCond(node.cond, env);
          return this.eval(c ? node.a : node.b, env);
        }
        case 'assign': return this.evalAssign(node, env);
        case 'incdec': return this.evalIncDec(node, env);
        case 'call': return this.evalCall(node, env);
        case 'field': return this.evalField(node, env);
        case 'index': {
          const arr = this.eval(node.obj, env);
          const idx = this.eval(node.idx, env);
          return this.arrayGet(arr, idx, node);
        }
        case 'new': return this.evalNew(node, env);
        case 'newArray': return this.evalNewArray(node, env);
        case 'arrayLit': throw compileErr('illegal start of expression (array initializer needs "new Type[]")', node.line);
        case 'cast': return this.evalCast(node, env);
        case 'lambda': return this.makeLambda(node, env);
        case 'mref': return this.makeMethodRef(node, env);
        case 'instanceof': {
          const v = this.eval(node.expr, env);
          let r = false;
          if (v instanceof JObject) r = this.isSubclassOf(v.cls, node.ty.name) || node.ty.name === 'Object';
          else if (typeof v === 'string') r = node.ty.name === 'String' || node.ty.name === 'Object';
          else if (typeof v === 'number') r = node.ty.name === 'Integer' || node.ty.name === 'Number' || node.ty.name === 'Object';
          else if (v instanceof JDouble) r = node.ty.name === 'Double' || node.ty.name === 'Number' || node.ty.name === 'Object';
          else if (v !== null && v !== undefined) r = node.ty.name === 'Object';
          if (r && node.bind) env.scope[node.bind] = { ty: null, v };
          return r;
        }
        case 'ctorCall': throw compileErr(`call to ${node.which} must be first statement in constructor`, node.line);
        case 'super': throw compileErr("'.' expected", node.line);
        default:
          throw compileErr('unsupported expression: ' + node.k, node.line);
      }
    }

    evalName(node, env) {
      const id = node.id;
      const e = env.scope[id];
      if (e !== undefined) {
        if (e.v === undefined) throw compileErr(`variable ${id} might not have been initialized`, node.line);
        return e.v;
      }
      if (env.thisObj) {
        const f = this.findField(env.thisObj.cls, id);
        if (f && !f.isStatic) return env.thisObj.f[id];
      }
      for (let c = env.cls; c; c = c.outer) {
        const f = this.findField(c, id);
        if (f && f.isStatic) { this.ensureInit(f.owner); return f.owner.statics[id]; }
        if (f && !f.isStatic && !env.thisObj) throw compileErr(`non-static variable ${id} cannot be referenced from a static context`, node.line);
      }
      const ci = this.classes.get(id);
      if (ci) return new JClassRef(ci);
      if (NATIVE_CLASSES.has(id)) return new NativeRef(id);
      throw compileErr(`cannot find symbol\n  symbol:   variable ${id}`, node.line);
    }

    arrayGet(arr, idx, node) {
      if (arr === null) this.throwNew('NullPointerException', 'Cannot load from array because value is null', node.line);
      if (!(arr instanceof JArray)) throw compileErr('array required, but ' + typeName(arr) + ' found', node.line);
      const i = idxInt(idx, node.line);
      if (i < 0 || i >= arr.items.length) this.throwNew('ArrayIndexOutOfBoundsException', `Index ${i} out of bounds for length ${arr.items.length}`, node.line);
      return arr.items[i];
    }

    evalUnary(node, env) {
      const v = this.eval(node.e, env);
      switch (node.op) {
        case '!':
          if (typeof v !== 'boolean') throw compileErr(`bad operand type ${typeName(v)} for unary operator '!'`, node.line);
          return !v;
        case '-':
          if (typeof v === 'number') return -v;
          if (v instanceof JDouble) return new JDouble(-v.v);
          if (v instanceof JChar) return -v.c;
          throw compileErr(`bad operand type ${typeName(v)} for unary operator '-'`, node.line);
        case '+':
          if (v instanceof JChar) return v.c;
          if (typeof v === 'number' || v instanceof JDouble) return v;
          throw compileErr(`bad operand type ${typeName(v)} for unary operator '+'`, node.line);
        case '~':
          if (typeof v === 'number') return ~v;
          throw compileErr(`bad operand type ${typeName(v)} for unary operator '~'`, node.line);
      }
    }

    evalBinary(node, env) {
      const a = this.eval(node.a, env);
      const b = this.eval(node.b, env);
      return this.binop(node.op, a, b, node.line);
    }

    binop(op, a, b, line) {
      if (op === '+' && (typeof a === 'string' || typeof b === 'string')) {
        return this.str(a) + this.str(b);
      }
      if (op === '==' || op === '!=') {
        let r;
        const na = numOf(a), nb = numOf(b);
        if (na !== null && nb !== null) r = na === nb;
        else if (typeof a === 'boolean' && typeof b === 'boolean') r = a === b;
        else if ((a === null || b === null) || (isRef(a) && isRef(b)) || (typeof a === 'string' && typeof b === 'string')) r = a === b || (a instanceof JChar && b instanceof JChar && a.c === b.c);
        else throw compileErr(`incomparable types: ${typeName(a)} and ${typeName(b)}`, line);
        return op === '==' ? r : !r;
      }
      if (typeof a === 'boolean' && typeof b === 'boolean' && (op === '&' || op === '|' || op === '^')) {
        return op === '&' ? (a && b) : op === '|' ? (a || b) : (a !== b);
      }
      const na = numOf(a), nb = numOf(b);
      if (na === null || nb === null) {
        throw compileErr(`bad operand types for binary operator '${op}'\n  first type:  ${typeName(a)}\n  second type: ${typeName(b)}`, line);
      }
      const isD = a instanceof JDouble || b instanceof JDouble;
      switch (op) {
        case '<': return na < nb;
        case '>': return na > nb;
        case '<=': return na <= nb;
        case '>=': return na >= nb;
        case '+': return isD ? new JDouble(na + nb) : na + nb;
        case '-': return isD ? new JDouble(na - nb) : na - nb;
        case '*': return isD ? new JDouble(na * nb) : na * nb;
        case '/':
          if (isD) return new JDouble(na / nb);
          if (nb === 0) this.throwNew('ArithmeticException', '/ by zero', line);
          return Math.trunc(na / nb);
        case '%':
          if (isD) return new JDouble(na % nb);
          if (nb === 0) this.throwNew('ArithmeticException', '/ by zero', line);
          return na % nb;
        case '&': return na & nb;
        case '|': return na | nb;
        case '^': return na ^ nb;
      }
      throw compileErr('unsupported operator ' + op, line);
    }

    /* ---------- assignment ---------- */
    evalAssign(node, env) {
      const t = node.target;
      // gather current value & a setter
      let cur, ty;
      let setter;
      if (t.k === 'name') {
        const ref = this.resolveVarRef(t, env, node.op !== '=');
        cur = ref.get; ty = ref.ty; setter = ref.set;
      } else if (t.k === 'field') {
        const ref = this.resolveFieldRef(t, env);
        cur = () => ref.get(); ty = ref.ty; setter = ref.set;
      } else { // index
        const arr = this.eval(t.obj, env);
        const idx = idxInt(this.eval(t.idx, env), t.line);
        if (arr === null) this.throwNew('NullPointerException', 'Cannot store to array because value is null', node.line);
        if (!(arr instanceof JArray)) throw compileErr('array required, but ' + typeName(arr) + ' found', node.line);
        if (idx < 0 || idx >= arr.items.length) this.throwNew('ArrayIndexOutOfBoundsException', `Index ${idx} out of bounds for length ${arr.items.length}`, node.line);
        ty = elemTypeOfArr(arr);
        cur = () => arr.items[idx];
        setter = (v) => { arr.items[idx] = v; };
      }
      let val;
      if (node.op === '=') {
        if (node.value.k === 'arrayLit') {
          if (!ty || ty.dims === 0) throw compileErr('illegal start of expression', node.line);
          val = this.buildArrayLit(node.value, ty, env);
        } else {
          val = this.eval(node.value, env);
          val = coerce(val, ty, node.line);
        }
      } else {
        const rhs = this.eval(node.value, env);
        const res = this.binop(node.op[0], typeof cur === 'function' ? cur() : cur, rhs, node.line);
        val = ty ? castTo(res, ty, node.line, true) : res;
      }
      setter(val);
      return val;
    }

    // Resolve a plain variable name to getter/setter/type
    resolveVarRef(t, env, needRead) {
      const id = t.id;
      const e = env.scope[id];
      if (e !== undefined) {
        return {
          get: () => { if (e.v === undefined) throw compileErr(`variable ${id} might not have been initialized`, t.line); return e.v; },
          ty: e.ty,
          set: (v) => {
            if (e.final) throw compileErr(`cannot assign a value to final variable ${id}`, t.line);
            e.v = v;
          }
        };
      }
      if (env.thisObj) {
        const f = this.findField(env.thisObj.cls, id);
        if (f && !f.isStatic) {
          return { get: () => env.thisObj.f[id], ty: f.ty, set: (v) => { this.checkFinalField(f, env, t.line); env.thisObj.f[id] = v; } };
        }
      }
      for (let c = env.cls; c; c = c.outer) {
        const f = this.findField(c, id);
        if (f && f.isStatic) {
          this.ensureInit(f.owner);
          return { get: () => f.owner.statics[id], ty: f.ty, set: (v) => { this.checkFinalField(f, env, t.line); f.owner.statics[id] = v; } };
        }
        if (f && !f.isStatic && !env.thisObj) throw compileErr(`non-static variable ${id} cannot be referenced from a static context`, t.line);
      }
      throw compileErr(`cannot find symbol\n  symbol:   variable ${id}`, t.line);
    }
    checkFinalField(f, env, line) {
      if (f.isFinal && !env.inInit) throw compileErr(`cannot assign a value to final variable ${f.name}`, line);
    }

    resolveFieldRef(t, env) {
      let obj;
      if (t.obj.k === 'this') obj = this.eval(t.obj, env);
      else obj = this.eval(t.obj, env);
      if (obj instanceof JClassRef) {
        const f = this.findField(obj.cls, t.id);
        if (!f || !f.isStatic) throw compileErr(`cannot find symbol\n  symbol:   variable ${t.id}\n  location: class ${obj.cls.name}`, t.line);
        this.ensureInit(f.owner);
        return { get: () => f.owner.statics[t.id], ty: f.ty, set: (v) => { this.checkFinalField(f, env, t.line); f.owner.statics[t.id] = v; } };
      }
      if (obj === null) this.throwNew('NullPointerException', `Cannot assign field "${t.id}" because value is null`, t.line);
      if (obj instanceof JArray && t.id === 'length') throw compileErr('cannot assign a value to final variable length', t.line);
      if (!(obj instanceof JObject)) throw compileErr(`${typeName(obj)} cannot be dereferenced`, t.line);
      const f = this.findField(obj.cls, t.id);
      if (!f) throw compileErr(`cannot find symbol\n  symbol:   variable ${t.id}\n  location: class ${obj.cls.name}`, t.line);
      this.checkAccess(f, env, t.line, obj.cls);
      if (f.isStatic) { this.ensureInit(f.owner); return { get: () => f.owner.statics[t.id], ty: f.ty, set: (v) => { f.owner.statics[t.id] = v; } }; }
      return { get: () => obj.f[t.id], ty: f.ty, set: (v) => { this.checkFinalField(f, env, t.line); obj.f[t.id] = v; } };
    }

    checkAccess(member, env, line, viaCls) {
      if (member.mods && member.mods.has('private')) {
        const owner = this.outermost(member.owner);
        const from = env.cls ? this.outermost(env.cls) : null;
        if (owner !== from) {
          const what = member.k === 'field' ? member.name : (member.k === 'ctor' ? `${member.name}(${member.params.map((p) => typeStr(p.ty)).join(',')})` : `${member.name}(${member.params.map((p) => typeStr(p.ty)).join(',')})`);
          throw compileErr(`${what} has private access in ${member.owner.name}`, line);
        }
      }
    }

    evalIncDec(node, env) {
      const t = node.target;
      let get, set, ty;
      if (t.k === 'name') { const r = this.resolveVarRef(t, env, true); get = r.get; set = r.set; ty = r.ty; }
      else if (t.k === 'field') { const r = this.resolveFieldRef(t, env); get = r.get; set = r.set; ty = r.ty; }
      else {
        const arr = this.eval(t.obj, env);
        const idx = idxInt(this.eval(t.idx, env), t.line);
        if (!(arr instanceof JArray)) { if (arr === null) this.throwNew('NullPointerException', 'Cannot load from array because value is null', node.line); throw compileErr('array required, but ' + typeName(arr) + ' found', node.line); }
        if (idx < 0 || idx >= arr.items.length) this.throwNew('ArrayIndexOutOfBoundsException', `Index ${idx} out of bounds for length ${arr.items.length}`, node.line);
        get = () => arr.items[idx]; set = (v) => { arr.items[idx] = v; }; ty = elemTypeOfArr(arr);
      }
      const old = get();
      if (numOf(old) === null) throw compileErr(`bad operand type ${typeName(old)} for unary operator '${node.op}'`, node.line);
      const d = node.op === '++' ? 1 : -1;
      let nv;
      if (old instanceof JDouble) nv = new JDouble(old.v + d);
      else if (old instanceof JChar) nv = new JChar(old.c + d);
      else nv = old + d;
      set(nv);
      return node.prefix ? nv : old;
    }

    evalCast(node, env) {
      const v = this.eval(node.e, env);
      const ty = node.ty;
      if (ty.dims === 0 && (PRIM.has(ty.name))) return castTo(v, ty, node.line, false);
      // reference cast
      if (v instanceof JObject && this.classes.has(ty.name) && !this.isSubclassOf(v.cls, ty.name)) {
        this.throwNew('ClassCastException', `class ${v.cls.name} cannot be cast to class ${ty.name}`, node.line);
      }
      return v;
    }

    /* ---------- creating things ---------- */
    evalNewArray(node, env) {
      const ty = node.ty;
      if (node.init) return this.buildArrayLit(node.init, ty, env);
      const dims = node.dimExprs.map((d) => {
        const n = idxInt(this.eval(d, env), node.line);
        if (n < 0) this.throwNew('NegativeArraySizeException', String(n), node.line);
        return n;
      });
      const build = (level, curTy) => {
        const len = dims[level];
        const items = new Array(len);
        const childTy = { name: ty.name, dims: curTy.dims - 1 };
        for (let i = 0; i < len; i++) {
          if (level + 1 < dims.length) items[i] = build(level + 1, childTy);
          else items[i] = childTy.dims > 0 ? null : defaultValue(childTy);
        }
        return new JArray(arrTypeStr(curTy), items);
      };
      return build(0, ty);
    }

    evalNew(node, env) {
      const args = node.args.map((a) => this.eval(a, env));
      const ci = this.classes.get(node.cls);
      if (ci) {
        const obj = this.instantiate(ci, args, node.line, env);
        return obj;
      }
      const nat = Object.prototype.hasOwnProperty.call(NATIVE_CTORS, node.cls) ? NATIVE_CTORS[node.cls] : null;
      if (nat) return nat.call(this, args, node.line);
      throw compileErr(`cannot find symbol\n  symbol:   class ${node.cls}`, node.line);
    }

    instantiate(cls, args, line, env) {
      this.ensureInit(cls);
      if (cls.kind === 'interface' || cls.isAbstract) throw compileErr(`${cls.name} is abstract; cannot be instantiated`, line);
      if (cls.kind === 'enum') throw compileErr('enum classes may not be instantiated', line);
      const obj = new JObject(cls);
      for (let c = cls; c; c = c.superCls) for (const [n, f] of c.fields) if (!f.isStatic) obj.f[n] = defaultValue(f.ty);
      this.construct(cls, obj, args, line, env);
      return obj;
    }

    runInstanceInits(cls, obj) {
      const env = { scope: Object.create(null), thisObj: obj, cls, inInit: true };
      for (const item of cls.node.instItems) {
        this.curLine = item.line;
        if (item.k === 'field') {
          if (item.init) obj.f[item.name] = this.evalInit(item.init, item.ty, env);
        } else this.exec(item.body, env);
      }
    }

    construct(cls, obj, args, line, callerEnv) {
      const ctors = cls.ctors;
      if (ctors.length === 0) {
        if (cls.superCls) {
          // prelude classes inherit constructors for convenience (exceptions etc.)
          this.construct(cls.superCls, obj, cls.fromPrelude ? args : [], line);
          if (!cls.fromPrelude && args.length) throw compileErr(`constructor ${cls.name} in class ${cls.name} cannot be applied to given types;\n  required: no arguments\n  found:    ${args.map(typeName).join(',')}`, line);
        } else if (args.length) {
          throw compileErr(`constructor ${cls.name} in class ${cls.name} cannot be applied to given types;\n  required: no arguments\n  found:    ${args.map(typeName).join(',')}`, line);
        }
        this.runInstanceInits(cls, obj);
        return;
      }
      const ct = this.selectOverload(ctors, args, cls.name, line, 'constructor');
      this.checkAccess(ct, callerEnv || { cls: null }, line);
      this.runCtor(cls, ct, obj, args);
    }

    runCtor(cls, ct, obj, args) {
      if (++this.depth > MAX_DEPTH) { this.depth--; this.throwNew('StackOverflowError', undefined, ct.line); }
      try {
        const scope = Object.create(null);
        const env = { scope, thisObj: obj, cls, method: ct, inInit: true };
        this.bindParams(ct, scope, args);
        const body = ct.body.body;
        let i = 0;
        const first = body[0];
        let delegated = false;
        if (first && first.k === 'expr' && first.expr.k === 'ctorCall') {
          const cc = first.expr;
          const cargs = cc.args.map((a) => this.eval(a, env));
          this.curLine = first.line;
          if (cc.which === 'this') {
            const others = cls.ctors.filter((c) => c !== ct);
            const target = this.selectOverload(others, cargs, cls.name, cc.line, 'constructor');
            this.runCtor(cls, target, obj, cargs);
            delegated = true;
          } else {
            if (cls.superCls) this.construct(cls.superCls, obj, cargs, cc.line, env);
            else if (cargs.length) throw compileErr('constructor Object in class Object cannot be applied to given types;', cc.line);
          }
          i = 1;
        } else if (cls.superCls) {
          this.construct(cls.superCls, obj, [], ct.line, env);
        }
        if (!delegated) this.runInstanceInits(cls, obj);
        const e2 = { scope: Object.create(scope), thisObj: obj, cls, method: ct, inInit: true };
        for (; i < body.length; i++) {
          const sig = this.exec(body[i], e2);
          if (sig && sig.ret) break;
        }
      } finally { this.depth--; }
    }

    bindParams(m, scope, args) {
      const ps = m.params;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (p.varargs) {
          let rest;
          if (args.length === ps.length && (args[i] instanceof JArray || (args[i] === null))) rest = args[i];
          else {
            const elemTy = { name: p.ty.name, dims: p.ty.dims - 1 };
            rest = new JArray(arrTypeStr(p.ty), args.slice(i).map((a) => coerce(a, elemTy, m.line)));
          }
          scope[p.name] = { ty: p.ty, v: rest };
        } else {
          scope[p.name] = { ty: p.ty, v: coerce(args[i], p.ty, m.line) };
        }
      }
    }

    /* ---------- overloads ---------- */
    selectOverload(cands, args, name, line, what) {
      let best = null, bestScore = -1;
      for (const m of cands) {
        const sc = this.scoreMethod(m, args);
        if (sc > bestScore) { best = m; bestScore = sc; }
      }
      if (!best) {
        const sigs = cands.map((m) => `${m.name}(${m.params.map((p) => typeStr(p.ty)).join(',')})`);
        if (cands.length === 1) {
          const m = cands[0];
          throw compileErr(`${what} ${name} in class ${m.owner ? m.owner.name : name} cannot be applied to given types;\n  required: ${m.params.length ? m.params.map((p) => typeStr(p.ty)).join(',') : 'no arguments'}\n  found:    ${args.length ? args.map(typeName).join(',') : 'no arguments'}\n  reason: ${m.params.length !== args.length && !m.params.some((p) => p.varargs) ? 'actual and formal argument lists differ in length' : 'argument mismatch'}`, line);
        }
        throw compileErr(`no suitable ${what} found for ${name}(${args.map(typeName).join(',')})\n  candidates: ${sigs.join(', ')}`, line);
      }
      return best;
    }
    scoreMethod(m, args) {
      const ps = m.params;
      const va = ps.length && ps[ps.length - 1].varargs;
      if (!va && ps.length !== args.length) return -1;
      if (va && args.length < ps.length - 1) return -1;
      let total = 1;
      const fixed = va ? ps.length - 1 : ps.length;
      for (let i = 0; i < fixed; i++) {
        const s = this.matchScore(args[i], ps[i].ty);
        if (s < 0) return -1;
        total += s;
      }
      if (va) {
        const p = ps[ps.length - 1];
        if (args.length === ps.length && (args[fixed] instanceof JArray || args[fixed] === null) ) return total + 1;
        const elemTy = { name: p.ty.name, dims: p.ty.dims - 1 };
        for (let i = fixed; i < args.length; i++) {
          const s = this.matchScore(args[i], elemTy);
          if (s < 0) return -1;
        }
        return total; // varargs match is weaker than a fixed match
      }
      return total + 1;
    }
    matchScore(v, ty) {
      if (ty.dims > 0) return (v instanceof JArray) ? 3 : (v === null ? 2 : -1);
      const n = ty.name;
      switch (n) {
        case 'int': case 'long': case 'short': case 'byte':
          return typeof v === 'number' ? 3 : (v instanceof JChar ? 2 : -1);
        case 'double': case 'float':
          return v instanceof JDouble ? 3 : (typeof v === 'number' ? 2 : (v instanceof JChar ? 1 : -1));
        case 'boolean': return typeof v === 'boolean' ? 3 : -1;
        case 'char': return v instanceof JChar ? 3 : -1;
        case 'String': return typeof v === 'string' ? 3 : (v === null ? 2 : -1);
        case 'Integer': return typeof v === 'number' ? 3 : (v === null ? 2 : -1);
        case 'Double': return v instanceof JDouble ? 3 : (typeof v === 'number' ? 1 : (v === null ? 2 : -1));
        case 'Boolean': return typeof v === 'boolean' ? 3 : (v === null ? 2 : -1);
        case 'Object': return 1;
      }
      if (v === null) return 2;
      const ci = this.classes.get(n);
      if (v instanceof JObject) {
        if (v.cls.name === n) return 3;
        if (this.isSubclassOf(v.cls, n)) return 2;
        if (ci) return -1;
        return 1; // unknown type name (probably a generic or library interface)
      }
      if (v instanceof JFunc) return ci && ci.kind !== 'interface' ? -1 : 2;
      if (ci) return -1; // a user class/interface type but value isn't an object of it
      if (typeof v === 'number' || v instanceof JDouble || typeof v === 'boolean' || typeof v === 'string' || v instanceof JChar) {
        return n.length <= 2 ? 1 : -1; // generic type variable like T
      }
      return 1;
    }

    /* ---------- invoking ---------- */
    invoke(m, thisObj, args) {
      if (!m.body) throw compileErr(`abstract method ${m.name} has no body`, m.line);
      if (++this.depth > MAX_DEPTH) { this.depth--; this.throwNew('StackOverflowError', undefined, this.curLine); }
      try {
        const scope = Object.create(null);
        const env = { scope, thisObj, cls: m.owner, method: m };
        this.bindParams(m, scope, args);
        const sig = this.exec(m.body, env);
        const isVoid = m.retTy.name === 'void' && m.retTy.dims === 0;
        if (isVoid) return undefined;
        if (!sig || !sig.ret) throw compileErr('missing return statement', m.body.endLine || m.line);
        if (sig.val === undefined) throw compileErr('incompatible types: missing return value', m.line);
        return coerce(sig.val, m.retTy, this.curLine);
      } finally { this.depth--; }
    }

    callFunc(fn, args) { return fn.fn(args); }

    makeLambda(node, env) {
      const captured = env;
      return new JFunc((args) => {
        const scope = Object.create(captured.scope);
        node.params.forEach((p, i) => { scope[p] = { ty: null, v: args[i] }; });
        const e = { scope, thisObj: captured.thisObj, cls: captured.cls, method: captured.method };
        if (node.body.k === 'block') {
          if (++this.depth > MAX_DEPTH) { this.depth--; this.throwNew('StackOverflowError', undefined, node.line); }
          try {
            const sig = this.exec(node.body, e);
            return sig && sig.ret ? sig.val : undefined;
          } finally { this.depth--; }
        }
        return this.eval(node.body, e);
      });
    }

    makeMethodRef(node, env) {
      const t = node.target;
      // Class::method / Class::new
      let recv;
      if (t.k === 'name' && env.scope[t.id] === undefined && !(env.thisObj && this.findField(env.thisObj.cls, t.id))) {
        const ci = this.classes.get(t.id);
        if (ci) {
          if (node.id === 'new') return new JFunc((args) => this.instantiate(ci, args, node.line, env));
          return new JFunc((args) => {
            const cands = this.findMethods(ci, node.id);
            const statics = cands.filter((m) => m.mods.has('static'));
            const st = statics.length ? this.trySelect(statics, args) : null;
            if (st) return this.invoke(st, null, args);
            // unbound instance method: first arg is the receiver
            if (!args.length) throw compileErr(`invalid method reference: ${node.id}`, node.line);
            return this.callMethodOnValue(args[0], node.id, args.slice(1), node, env);
          });
        }
        if (NATIVE_CLASSES.has(t.id)) {
          const ref = new NativeRef(t.id);
          return new JFunc((args) => this.callStaticNative(ref, node.id, args, node.line));
        }
      }
      if (t.k === 'super') {
        const self = env.thisObj;
        return new JFunc((args) => this.callSuperMethod(node.id, args, env, node));
      }
      recv = this.eval(t, env);
      if (recv === null) this.throwNew('NullPointerException', undefined, node.line);
      return new JFunc((args) => this.callMethodOnValue(recv, node.id, args, node, env));
    }
    trySelect(cands, args) {
      let best = null, bs = -1;
      for (const m of cands) { const s = this.scoreMethod(m, args); if (s > bs) { bs = s; best = m; } }
      return best;
    }

    callSuperMethod(name, args, env, node) {
      const sup = env.cls && env.cls.superCls;
      let cands = sup ? this.findMethods(sup, name) : [];
      for (const i of (env.cls ? env.cls.ifaceCls : [])) cands = cands.concat(this.findMethods(i, name));
      cands = cands.filter((m) => m.body);
      if (!cands.length) {
        // default Object methods
        return this.objectMethod(env.thisObj, name, args, node.line, true);
      }
      const m = this.selectOverload(cands, args, name, node.line, 'method');
      return this.invoke(m, env.thisObj, args);
    }

    evalCall(node, env) {
      const argNodes = node.args;
      const target = node.obj;
      // super.method(...)
      if (target && target.k === 'super') {
        const args = argNodes.map((a) => this.eval(a, env));
        if (!env.thisObj) throw compileErr('non-static variable super cannot be referenced from a static context', node.line);
        return this.callSuperMethod(node.id, args, env, node);
      }
      if (target === null) {
        const args = argNodes.map((a) => this.eval(a, env));
        this.curLine = node.line;
        return this.callUnqualified(node, args, env);
      }
      // Receiver evaluation
      const recv = this.eval(target, env);
      const args = argNodes.map((a) => this.eval(a, env));
      this.curLine = node.line;
      if (recv === null) {
        this.throwNew('NullPointerException', `Cannot invoke "${nullTypeHint(target, env)}.${node.id}()" because ${nullWhy(target, env)} is null`, node.line);
      }
      if (recv instanceof JClassRef) return this.callStatic(recv.cls, node, args, env);
      if (recv instanceof NativeRef) return this.callStaticNative(recv, node.id, args, node.line);
      return this.callMethodOnValue(recv, node.id, args, node, env);
    }

    callUnqualified(node, args, env) {
      const name = node.id;
      // search the enclosing classes
      for (let c = env.cls; c; c = c.outer) {
        let cands = this.findMethods(c, name);
        if (!cands.length) continue;
        // virtual dispatch from this
        if (env.thisObj && this.isSubclassOf(env.thisObj.cls, c.name)) {
          const vc = this.findMethods(env.thisObj.cls, name);
          if (vc.length) cands = vc;
        }
        const m = this.selectOverload(cands, args, name, node.line, 'method');
        if (m.mods.has('static')) return this.invoke(m, null, args);
        if (!env.thisObj) throw compileErr(`non-static method ${name}(${m.params.map((p) => typeStr(p.ty)).join(',')}) cannot be referenced from a static context`, node.line);
        return this.invoke(m, env.thisObj, args);
      }
      if (env.thisObj && ['getClass', 'hashCode', 'toString', 'equals', 'name', 'ordinal'].includes(name)) {
        return this.objectMethod(env.thisObj, name, args, node.line, false);
      }
      throw compileErr(`cannot find symbol\n  symbol:   method ${name}(${args.map(typeName).join(',')})`, node.line);
    }

    callStatic(cls, node, args, env) {
      this.ensureInit(cls);
      const name = node.id;
      if (cls.kind === 'enum') {
        if (name === 'values' && args.length === 0) return new JArray(cls.name, cls.enumConsts.slice());
        if (name === 'valueOf' && args.length === 1) {
          const f = cls.enumConsts.find((o) => o.enumName === args[0]);
          if (!f) this.throwNew('IllegalArgumentException', `No enum constant ${cls.name}.${args[0]}`, node.line);
          return f;
        }
      }
      const cands = this.findMethods(cls, name);
      if (!cands.length) throw compileErr(`cannot find symbol\n  symbol:   method ${name}(${args.map(typeName).join(',')})\n  location: class ${cls.name}`, node.line);
      const m = this.selectOverload(cands, args, name, node.line, 'method');
      this.checkAccess(m, env, node.line);
      if (!m.mods.has('static')) throw compileErr(`non-static method ${name}(${m.params.map((p) => typeStr(p.ty)).join(',')}) cannot be referenced from a static context`, node.line);
      return this.invoke(m, null, args);
    }

    callMethodOnValue(recv, name, args, node, env) {
      const line = node.line;
      if (recv instanceof JObject) {
        const cands = this.findMethods(recv.cls, name);
        if (cands.length) {
          const m = this.selectOverload(cands, args, name, line, 'method');
          this.checkAccess(m, env || { cls: null }, line);
          if (m.mods.has('static')) return this.invoke(m, null, args);
          return this.invoke(m, recv, args);
        }
        return this.objectMethod(recv, name, args, line, false);
      }
      if (typeof recv === 'string') return stringMethod.call(this, recv, name, args, line);
      if (recv instanceof JFunc) {
        if (name === 'andThen' || name === 'compose' || name === 'negate' || name === 'and' || name === 'or') return funcCombinator.call(this, recv, name, args, line);
        return this.callFunc(recv, args);
      }
      if (recv instanceof JNative) return nativeMethod.call(this, recv, name, args, line);
      if (recv instanceof JArray) {
        if (name === 'clone') return new JArray(recv.elem, recv.items.slice());
        if (name === 'length') throw compileErr('cannot find symbol\n  symbol:   method length()', line);
        return this.objectMethod(recv, name, args, line, false);
      }
      if (typeof recv === 'number' || recv instanceof JDouble || typeof recv === 'boolean' || recv instanceof JChar) {
        const tn = typeName(recv);
        // Allow a few boxed-style conveniences
        if (name === 'equals' && args.length === 1) return this.valuesEqual(recv, args[0]);
        if (name === 'toString') return this.str(recv);
        if (name === 'intValue') return Math.trunc(numOf(recv));
        if (name === 'doubleValue') return new JDouble(numOf(recv));
        if (name === 'compareTo') return Math.sign(numOf(recv) - numOf(args[0]));
        throw compileErr(`${tn} cannot be dereferenced`, line);
      }
      if (recv === undefined) throw compileErr("'void' type not allowed here", line);
      throw compileErr(`cannot find symbol\n  symbol:   method ${name}`, line);
    }

    objectMethod(o, name, args, line, viaSuper) {
      if (o instanceof JObject) {
        if (o.enumName !== undefined) {
          if (name === 'name' || name === 'toString') return o.enumName;
          if (name === 'ordinal') return o.enumOrdinal;
          if (name === 'compareTo') return o.enumOrdinal - args[0].enumOrdinal;
        }
        if (name === 'toString' && args.length === 0) return `${o.cls.name}@${hashHex(o)}`;
        if (name === 'equals' && args.length === 1) return o === args[0];
        if (name === 'hashCode' && args.length === 0) return hashInt(o);
        if (name === 'getClass' && args.length === 0) return new JNative('Class', o.cls);
      }
      if (name === 'equals' && args.length === 1) return o === args[0];
      if (name === 'hashCode') return hashInt(o);
      if (name === 'toString') return this.str(o);
      throw compileErr(`cannot find symbol\n  symbol:   method ${name}(${args.map(typeName).join(',')})${o instanceof JObject ? `\n  location: class ${o.cls.name}` : ''}`, line);
    }

    callStaticNative(ref, name, args, line) {
      const tbl = Object.prototype.hasOwnProperty.call(STATIC_NATIVES, ref.name) ? STATIC_NATIVES[ref.name] : null;
      if (!tbl || !Object.prototype.hasOwnProperty.call(tbl, name)) throw compileErr(`cannot find symbol\n  symbol:   method ${name}(${args.map(typeName).join(',')})\n  location: class ${ref.name}`, line);
      return tbl[name].call(this, args, line);
    }

    evalField(node, env) {
      const t = node.obj;
      if (t.k === 'super') throw compileErr("'.' expected", node.line);
      const recv = this.eval(t, env);
      const id = node.id;
      if (recv instanceof JClassRef) {
        const f = this.findField(recv.cls, id);
        if (f && f.isStatic) {
          this.checkAccess(f, env, node.line);
          this.ensureInit(f.owner);
          return f.owner.statics[id];
        }
        const inner = this.classes.get(id);
        if (inner && inner.outer === recv.cls) return new JClassRef(inner);
        if (recv.cls.kind === 'enum' && id === 'length') { /* fallthrough */ }
        if (f && !f.isStatic) throw compileErr(`non-static variable ${id} cannot be referenced from a static context`, node.line);
        throw compileErr(`cannot find symbol\n  symbol:   variable ${id}\n  location: class ${recv.cls.name}`, node.line);
      }
      if (recv instanceof NativeRef) {
        const consts = NATIVE_CONSTS[recv.name];
        if (consts && id in consts) {
          const c = consts[id];
          return typeof c === 'function' ? c.call(this) : c;
        }
        throw compileErr(`cannot find symbol\n  symbol:   variable ${id}\n  location: class ${recv.name}`, node.line);
      }
      if (recv === null) {
        this.throwNew('NullPointerException', `Cannot read field "${id}" because ${nullWhy(t, env)} is null`, node.line);
      }
      if (recv instanceof JArray) {
        if (id === 'length') return recv.items.length;
        throw compileErr(`cannot find symbol\n  symbol:   variable ${id}`, node.line);
      }
      if (recv instanceof JObject) {
        const f = this.findField(recv.cls, id);
        if (!f) throw compileErr(`cannot find symbol\n  symbol:   variable ${id}\n  location: variable of type ${recv.cls.name}`, node.line);
        this.checkAccess(f, env, node.line);
        if (f.isStatic) { this.ensureInit(f.owner); return f.owner.statics[id]; }
        return recv.f[id];
      }
      throw compileErr(`${typeName(recv)} cannot be dereferenced`, node.line);
    }

    /* ---------- strings & equality ---------- */
    str(v) {
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return String(v);
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (v instanceof JDouble) return fmtDouble(v.v);
      if (v instanceof JChar) return String.fromCharCode(v.c);
      if (v instanceof JObject) {
        const cands = this.findMethods(v.cls, 'toString').filter((m) => m.params.length === 0 && m.body);
        if (cands.length) {
          const r = this.invoke(cands[0], v, []);
          return r === null ? 'null' : this.str(r);
        }
        if (v.enumName !== undefined) return v.enumName;
        return `${v.cls.name}@${hashHex(v)}`;
      }
      if (v instanceof JArray) return `[${arrCode(v.elem)}@${hashHex(v)}`;
      if (v instanceof JFunc) return `Main$$Lambda@${hashHex(v)}`;
      if (v instanceof JNative) return nativeToString.call(this, v);
      if (v instanceof JClassRef) return 'class ' + v.cls.name;
      return String(v);
    }
    valuesEqual(a, b) {
      if (a === null || b === null) return a === b;
      const na = numOf(a), nb = numOf(b);
      if (na !== null && nb !== null) return (a instanceof JDouble) === (b instanceof JDouble) ? na === nb : false;
      if (typeof a === 'string' || typeof a === 'boolean') return a === b;
      if (a instanceof JObject) {
        const cands = this.findMethods(a.cls, 'equals').filter((m) => m.params.length === 1 && m.body);
        if (cands.length) return this.invoke(cands[0], a, [b]) === true;
        return a === b;
      }
      if (a instanceof JNative && b instanceof JNative && a.kind === 'List' && b.kind === 'List') {
        return a.data.length === b.data.length && a.data.every((x, i) => this.valuesEqual(x, b.data[i]));
      }
      return a === b;
    }
  }

  const BREAK = { brk: true };
  const CONTINUE = { cont: true };

  /* ------------------------------------------------------------------ *
   * Free helper functions used by the interpreter
   * ------------------------------------------------------------------ */

  function isRef(v) {
    return v instanceof JObject || v instanceof JArray || v instanceof JFunc || v instanceof JNative || v instanceof JClassRef;
  }
  function numOf(v) {
    if (typeof v === 'number') return v;
    if (v instanceof JDouble) return v.v;
    if (v instanceof JChar) return v.c;
    return null;
  }
  function typeName(v) {
    if (v === null) return '<null>';
    if (v === undefined) return 'void';
    if (typeof v === 'number') return 'int';
    if (typeof v === 'string') return 'String';
    if (typeof v === 'boolean') return 'boolean';
    if (v instanceof JDouble) return 'double';
    if (v instanceof JChar) return 'char';
    if (v instanceof JObject) return v.cls.name;
    if (v instanceof JArray) return v.elem + '[]';
    if (v instanceof JNative) return v.kind === 'List' ? 'ArrayList' : v.kind === 'Map' ? 'HashMap' : v.kind;
    if (v instanceof JFunc) return 'lambda';
    if (v instanceof JClassRef) return 'class ' + v.cls.name;
    return 'Object';
  }
  function typeStr(ty) { return ty.name + '[]'.repeat(ty.dims); }
  function arrTypeStr(ty) { return ty.name + '[]'.repeat(Math.max(0, ty.dims - 1)); }
  function arrCode(elem) {
    const dims = (elem.match(/\[\]/g) || []).length;
    const base = elem.replace(/\[\]/g, '');
    const code = { int: 'I', double: 'D', boolean: 'Z', char: 'C', long: 'J', float: 'F', short: 'S', byte: 'B' }[base];
    return '['.repeat(dims) + (code || 'L' + (QUALIFIED[base] || (base === 'String' ? 'java.lang.String' : base)) + ';');
  }
  function elemTypeOfArr(arr) {
    const m = /^([A-Za-z_$][\w$]*)((?:\[\])*)$/.exec(arr.elem);
    return m ? { name: m[1], dims: m[2].length / 2 } : null;
  }
  function idxInt(v, line) {
    if (typeof v === 'number') return v;
    if (v instanceof JChar) return v.c;
    if (v instanceof JDouble) throw compileErr('incompatible types: possible lossy conversion from double to int', line);
    throw compileErr(`incompatible types: ${typeName(v)} cannot be converted to int`, line);
  }
  function hashInt(o) { return ((o.id || 1) * 2654435761) >>> 1; }
  function hashHex(o) { return (hashInt(o) & 0x7fffffff).toString(16); }

  function nullWhy(node, env) {
    if (node.k === 'name') return `"${node.id}"`;
    if (node.k === 'field') return `"${node.obj.k === 'this' ? 'this.' : (node.obj.k === 'name' ? node.obj.id + '.' : '')}${node.id}"`;
    if (node.k === 'call') return `the return value of "${node.id}()"`;
    return 'value';
  }
  function nullTypeHint(node, env) {
    if (node.k === 'name') {
      const e = env.scope[node.id];
      if (e && e.ty) return typeStr(e.ty);
    }
    return 'Object';
  }

  // Assignment conversion (what Java allows without a cast)
  function coerce(v, ty, line) {
    if (!ty || ty.dims > 0) return v;
    switch (ty.name) {
      case 'int': case 'short': case 'byte': case 'long':
        if (typeof v === 'number') return v;
        if (v instanceof JChar) return v.c;
        if (v instanceof JDouble) throw compileErr(`incompatible types: possible lossy conversion from double to ${ty.name}`, line);
        throw incompatible(v, ty.name, line);
      case 'double': case 'float':
        if (v instanceof JDouble) return v;
        if (typeof v === 'number') return new JDouble(v);
        if (v instanceof JChar) return new JDouble(v.c);
        throw incompatible(v, ty.name, line);
      case 'boolean':
        if (typeof v === 'boolean') return v;
        throw incompatible(v, 'boolean', line);
      case 'char':
        if (v instanceof JChar) return v;
        if (typeof v === 'number') return new JChar(v);
        throw incompatible(v, 'char', line);
      case 'String':
        if (typeof v === 'string' || v === null) return v;
        throw incompatible(v, 'String', line);
      case 'Integer':
        if (typeof v === 'number' || v === null) return v;
        throw incompatible(v, 'Integer', line);
      case 'Double':
        if (v instanceof JDouble || v === null) return v;
        if (typeof v === 'number') return new JDouble(v);
        throw incompatible(v, 'Double', line);
      case 'Boolean':
        if (typeof v === 'boolean' || v === null) return v;
        throw incompatible(v, 'Boolean', line);
      default:
        if (v === undefined) throw compileErr("incompatible types: void cannot be converted to " + ty.name, line);
        return v;
    }
  }
  function incompatible(v, target, line) {
    if (v === undefined) return compileErr(`incompatible types: void cannot be converted to ${target}`, line);
    return compileErr(`incompatible types: ${typeName(v)} cannot be converted to ${target}`, line);
  }
  // Explicit cast / compound-assignment narrowing
  function castTo(v, ty, line, compound) {
    const n = numOf(v);
    switch (ty.name) {
      case 'int': case 'long': case 'short': case 'byte': {
        if (n === null) throw compileErr(`incompatible types: ${typeName(v)} cannot be converted to ${ty.name}`, line);
        if (!Number.isFinite(n)) return n > 0 ? 2147483647 : (n < 0 ? -2147483648 : 0);
        return Math.trunc(n);
      }
      case 'double': case 'float':
        if (n === null) throw compileErr(`incompatible types: ${typeName(v)} cannot be converted to ${ty.name}`, line);
        return new JDouble(n);
      case 'char':
        if (n === null) throw compileErr(`incompatible types: ${typeName(v)} cannot be converted to char`, line);
        return new JChar(Math.trunc(n) & 0xffff);
      case 'boolean':
        if (typeof v !== 'boolean') throw compileErr(`incompatible types: ${typeName(v)} cannot be converted to boolean`, line);
        return v;
      default:
        return compound ? coerce(v, ty, line) : v;
    }
  }

  /* ------------------------------------------------------------------ *
   * Native library: strings, lists, maps, Math, ...
   * ------------------------------------------------------------------ */

  const NATIVE_CLASSES = new Set(['Math', 'System', 'Integer', 'Double', 'Boolean', 'Character', 'String', 'Arrays',
    'List', 'Collections', 'Objects', 'Long', 'Host', 'Check', 'Thread', 'ArrayList', 'HashMap', 'Float']);

  const NATIVE_CONSTS = {
    Math: { PI: new JDouble(Math.PI), E: new JDouble(Math.E) },
    Integer: { MAX_VALUE: 2147483647, MIN_VALUE: -2147483648 },
    Long: { MAX_VALUE: Number.MAX_SAFE_INTEGER, MIN_VALUE: Number.MIN_SAFE_INTEGER },
    Double: { MAX_VALUE: new JDouble(Number.MAX_VALUE), MIN_VALUE: new JDouble(5e-324), POSITIVE_INFINITY: new JDouble(Infinity), NEGATIVE_INFINITY: new JDouble(-Infinity), NaN: new JDouble(NaN) },
    System: {
      out: function () { return new JNative('PrintStream', { err: false }); },
      err: function () { return new JNative('PrintStream', { err: true }); }
    }
  };

  const NATIVE_CTORS = {
    ArrayList(args) { const l = new JNative('List', []); if (args[0] instanceof JNative && args[0].kind === 'List') l.data = args[0].data.slice(); return l; },
    LinkedList(args) { return NATIVE_CTORS.ArrayList.call(this, args); },
    HashMap() { return new JNative('Map', new Map()); },
    LinkedHashMap() { return new JNative('Map', new Map()); },
    StringBuilder(args) { return new JNative('StringBuilder', { s: typeof args[0] === 'string' ? args[0] : '' }); },
    Object() { return new JObject(new ClassInfo({ name: 'Object', kind: 'class', mods: new Set(), ctors: [], fields: [], methods: [], initItems: [], instItems: [], nested: [], consts: [], ifaces: [] }, null)); },
    Random() { return new JNative('Random', {}); }
  };
  NATIVE_CTORS.List = NATIVE_CTORS.ArrayList;
  for (const k of Object.keys(NATIVE_CTORS)) NATIVE_CLASSES.add(k);

  function mathNum(it, v, line) {
    const n = numOf(v);
    if (n === null) throw compileErr(`incompatible types: ${typeName(v)} cannot be converted to double`, line);
    return n;
  }

  const STATIC_NATIVES = {
    Math: {
      abs(a, l) { const v = a[0]; return v instanceof JDouble ? new JDouble(Math.abs(v.v)) : Math.abs(mathNum(this, v, l)); },
      max(a, l) { const x = a[0], y = a[1]; const r = Math.max(mathNum(this, x, l), mathNum(this, y, l)); return (x instanceof JDouble || y instanceof JDouble) ? new JDouble(r) : r; },
      min(a, l) { const x = a[0], y = a[1]; const r = Math.min(mathNum(this, x, l), mathNum(this, y, l)); return (x instanceof JDouble || y instanceof JDouble) ? new JDouble(r) : r; },
      pow(a, l) { return new JDouble(Math.pow(mathNum(this, a[0], l), mathNum(this, a[1], l))); },
      sqrt(a, l) { return new JDouble(Math.sqrt(mathNum(this, a[0], l))); },
      cbrt(a, l) { return new JDouble(Math.cbrt(mathNum(this, a[0], l))); },
      floor(a, l) { return new JDouble(Math.floor(mathNum(this, a[0], l))); },
      ceil(a, l) { return new JDouble(Math.ceil(mathNum(this, a[0], l))); },
      round(a, l) { return Math.floor(mathNum(this, a[0], l) + 0.5); },
      signum(a, l) { return new JDouble(Math.sign(mathNum(this, a[0], l))); },
      sin(a, l) { return new JDouble(Math.sin(mathNum(this, a[0], l))); },
      cos(a, l) { return new JDouble(Math.cos(mathNum(this, a[0], l))); },
      tan(a, l) { return new JDouble(Math.tan(mathNum(this, a[0], l))); },
      atan(a, l) { return new JDouble(Math.atan(mathNum(this, a[0], l))); },
      atan2(a, l) { return new JDouble(Math.atan2(mathNum(this, a[0], l), mathNum(this, a[1], l))); },
      hypot(a, l) { return new JDouble(Math.hypot(mathNum(this, a[0], l), mathNum(this, a[1], l))); },
      exp(a, l) { return new JDouble(Math.exp(mathNum(this, a[0], l))); },
      log(a, l) { return new JDouble(Math.log(mathNum(this, a[0], l))); },
      log10(a, l) { return new JDouble(Math.log10(mathNum(this, a[0], l))); },
      toRadians(a, l) { return new JDouble(mathNum(this, a[0], l) * Math.PI / 180); },
      toDegrees(a, l) { return new JDouble(mathNum(this, a[0], l) * 180 / Math.PI); },
      random() { return new JDouble(Math.random()); },
      copySign(a, l) { const m = Math.abs(mathNum(this, a[0], l)); const neg = mathNum(this, a[1], l) < 0 || Object.is(mathNum(this, a[1], l), -0); const r = neg ? -m : m; return (a[0] instanceof JDouble) ? new JDouble(r) : r; },
      floorMod(a, l) { const x = mathNum(this, a[0], l), y = mathNum(this, a[1], l); if (y === 0) this.throwNew('ArithmeticException', '/ by zero', l); return ((x % y) + y) % y; },
      floorDiv(a, l) { const x = mathNum(this, a[0], l), y = mathNum(this, a[1], l); if (y === 0) this.throwNew('ArithmeticException', '/ by zero', l); return Math.floor(x / y); }
    },
    Integer: {
      parseInt(a, l) {
        const s = a[0];
        if (s === null) this.throwNew('NumberFormatException', 'Cannot parse null string: null', l);
        if (!/^[+-]?\d+$/.test(s)) this.throwNew('NumberFormatException', `For input string: "${s}"`, l);
        return parseInt(s, 10);
      },
      valueOf(a, l) { return typeof a[0] === 'string' ? STATIC_NATIVES.Integer.parseInt.call(this, a, l) : a[0]; },
      toString(a) { return String(a[0]); },
      compare(a) { return Math.sign(numOf(a[0]) - numOf(a[1])); },
      max(a) { return Math.max(a[0], a[1]); },
      min(a) { return Math.min(a[0], a[1]); },
      sum(a) { return a[0] + a[1]; }
    },
    Long: {
      parseLong(a, l) { return STATIC_NATIVES.Integer.parseInt.call(this, a, l); }
    },
    Double: {
      parseDouble(a, l) {
        const s = a[0];
        if (s === null) this.throwNew('NullPointerException', undefined, l);
        const t = s.trim();
        if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[dDfF]?$/.test(t)) this.throwNew('NumberFormatException', t === '' ? 'empty String' : `For input string: "${s}"`, l);
        return new JDouble(parseFloat(t));
      },
      valueOf(a, l) { return typeof a[0] === 'string' ? STATIC_NATIVES.Double.parseDouble.call(this, a, l) : new JDouble(numOf(a[0])); },
      toString(a) { return this.str(a[0] instanceof JDouble ? a[0] : new JDouble(numOf(a[0]))); },
      compare(a) { return Math.sign(numOf(a[0]) - numOf(a[1])); },
      isNaN(a) { return Number.isNaN(numOf(a[0])); },
      max(a) { return new JDouble(Math.max(numOf(a[0]), numOf(a[1]))); },
      min(a) { return new JDouble(Math.min(numOf(a[0]), numOf(a[1]))); }
    },
    Boolean: {
      parseBoolean(a) { return typeof a[0] === 'string' && a[0].toLowerCase() === 'true'; },
      toString(a) { return String(a[0]); }
    },
    Character: {
      isDigit(a) { return /[0-9]/.test(String.fromCharCode(numOf(a[0]))); },
      isLetter(a) { return /[A-Za-z]/.test(String.fromCharCode(numOf(a[0]))); },
      isLetterOrDigit(a) { return /[A-Za-z0-9]/.test(String.fromCharCode(numOf(a[0]))); },
      isUpperCase(a) { return /[A-Z]/.test(String.fromCharCode(numOf(a[0]))); },
      isLowerCase(a) { return /[a-z]/.test(String.fromCharCode(numOf(a[0]))); },
      isWhitespace(a) { return /\s/.test(String.fromCharCode(numOf(a[0]))); },
      toUpperCase(a) { return new JChar(String.fromCharCode(numOf(a[0])).toUpperCase().charCodeAt(0)); },
      toLowerCase(a) { return new JChar(String.fromCharCode(numOf(a[0])).toLowerCase().charCodeAt(0)); },
      getNumericValue(a) { return numOf(a[0]) - 48; },
      toString(a) { return this.str(a[0]); }
    },
    String: {
      valueOf(a) { return this.str(a[0]); },
      format(a, l) { return javaFormat.call(this, a[0], a.slice(1), l); },
      join(a) {
        const sep = a[0];
        let items = a.slice(1);
        if (items.length === 1 && items[0] instanceof JArray) items = items[0].items;
        else if (items.length === 1 && items[0] instanceof JNative && items[0].kind === 'List') items = items[0].data;
        return items.map((x) => this.str(x)).join(sep);
      }
    },
    Arrays: {
      toString(a) {
        const arr = a[0];
        if (arr === null) return 'null';
        return '[' + arr.items.map((x) => this.str(x)).join(', ') + ']';
      },
      deepToString(a) {
        const f = (x) => (x instanceof JArray ? '[' + x.items.map(f).join(', ') + ']' : this.str(x));
        return f(a[0]);
      },
      sort(a) {
        const arr = a[0];
        arr.items.sort((x, y) => (typeof x === 'string' ? (x < y ? -1 : x > y ? 1 : 0) : numOf(x) - numOf(y)));
      },
      fill(a) { a[0].items.fill(a[1]); },
      asList(a) { const items = a.length === 1 && a[0] instanceof JArray ? a[0].items.slice() : a.slice(); return new JNative('List', items); },
      equals(a) { return a[0].items.length === a[1].items.length && a[0].items.every((x, i) => this.valuesEqual(x, a[1].items[i])); },
      stream() { throw compileErr('streams are not supported in this playground', this.curLine); }
    },
    List: {
      of(a) { return new JNative('List', a.length === 1 && a[0] instanceof JArray ? a[0].items.slice() : a.slice()); }
    },
    Collections: {
      sort(a) { a[0].data.sort((x, y) => (typeof x === 'string' ? (x < y ? -1 : x > y ? 1 : 0) : numOf(x) - numOf(y))); },
      reverse(a) { a[0].data.reverse(); },
      max(a) { return a[0].data.reduce((m, x) => (numOf(x) > numOf(m) ? x : m)); },
      min(a) { return a[0].data.reduce((m, x) => (numOf(x) < numOf(m) ? x : m)); }
    },
    Objects: {
      equals(a) { return this.valuesEqual(a[0], a[1]); },
      requireNonNull(a, l) { if (a[0] === null) this.throwNew('NullPointerException', a[1] === undefined ? undefined : a[1], l); return a[0]; },
      isNull(a) { return a[0] === null; },
      nonNull(a) { return a[0] !== null; },
      toString(a) { return this.str(a[0]); }
    },
    Thread: { sleep() { /* the playground doesn't really wait */ } },
    System: {
      exit(a) { throw new ExitSignal(a[0]); },
      currentTimeMillis() { return Date.now(); },
      nanoTime() { return Math.floor(performance.now() * 1e6); },
      lineSeparator() { return '\n'; }
    },
    Host: {
      emit(a) { this.events.push({ kind: a[0], args: a.slice(1).map((x) => (x instanceof JDouble ? x.v : (x instanceof JChar ? String.fromCharCode(x.c) : x))) }); }
    },
    Check: {
      equal(a) {
        const [label, actual, expected] = a;
        const pass = checkEq(this, actual, expected);
        this.checks.push({ label: String(label), pass, actual: this.str(actual), expected: this.str(expected) });
      },
      isTrue(a) { this.checks.push({ label: String(a[0]), pass: a[1] === true, actual: this.str(a[1]), expected: 'true' }); },
      isFalse(a) { this.checks.push({ label: String(a[0]), pass: a[1] === false, actual: this.str(a[1]), expected: 'false' }); },
      near(a) {
        const pass = Math.abs(numOf(a[1]) - numOf(a[2])) <= (a[3] === undefined ? 1e-6 : numOf(a[3]));
        this.checks.push({ label: String(a[0]), pass, actual: this.str(a[1]), expected: this.str(a[2]) });
      },
      fail(a) { this.checks.push({ label: String(a[0]), pass: false, actual: '', expected: '' }); }
    }
  };
  STATIC_NATIVES.Float = STATIC_NATIVES.Double;

  function checkEq(it, actual, expected) {
    if (actual instanceof JDouble || expected instanceof JDouble) {
      const x = numOf(actual), y = numOf(expected);
      return x !== null && y !== null && Math.abs(x - y) < 1e-9;
    }
    return it.valuesEqual(actual, expected);
  }

  function javaFormat(fmt, args, line) {
    let ai = 0;
    return fmt.replace(/%([-#+ 0,(]*)(\d+)?(?:\.(\d+))?([a-zA-Z%])/g, (m, flags, width, prec, conv) => {
      if (conv === '%') return '%';
      if (conv === 'n') return '\n';
      if (ai >= args.length) this.throwNew('IllegalArgumentException', `Format specifier '${m}'`, line);
      const v = args[ai++];
      let s;
      switch (conv) {
        case 'd': {
          if (typeof v !== 'number') this.throwNew('IllegalFormatConversionException', `d != ${v instanceof JDouble ? 'java.lang.Double' : v === null ? 'null' : 'java.lang.' + typeName(v).replace(/^./, (c) => c.toUpperCase())}`, line);
          s = String(Math.abs(v));
          if (flags.includes(',')) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          s = (v < 0 ? '-' : flags.includes('+') ? '+' : '') + s;
          break;
        }
        case 'f': case 'e': case 'E': {
          if (!(v instanceof JDouble)) this.throwNew('IllegalFormatConversionException', `${conv} != java.lang.${v === null ? 'Object' : (typeof v === 'number' ? 'Integer' : typeName(v).replace(/^./, (c) => c.toUpperCase()))}`, line);
          const p = prec === undefined ? 6 : parseInt(prec, 10);
          if (conv === 'f') {
            s = Math.abs(v.v).toFixed(p);
            if (flags.includes(',')) { const [i, d] = s.split('.'); s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d !== undefined ? '.' + d : ''); }
            s = (v.v < 0 || Object.is(v.v, -0) ? '-' : flags.includes('+') ? '+' : '') + s;
          } else {
            s = v.v.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2');
            if (conv === 'E') s = s.toUpperCase();
          }
          break;
        }
        case 's': case 'S': s = this.str(v); if (prec !== undefined) s = s.slice(0, parseInt(prec, 10)); if (conv === 'S') s = s.toUpperCase(); break;
        case 'b': case 'B': s = String(v !== null && v !== false); break;
        case 'c': s = v instanceof JChar ? String.fromCharCode(v.c) : String.fromCharCode(v); break;
        case 'x': s = Number(v).toString(16); break;
        case 'X': s = Number(v).toString(16).toUpperCase(); break;
        default: this.throwNew('IllegalArgumentException', `Unknown format conversion: ${conv}`, line);
      }
      if (width) {
        const w = parseInt(width, 10);
        if (s.length < w) {
          if (flags.includes('-')) s = s + ' '.repeat(w - s.length);
          else if (flags.includes('0') && 'dfeE'.includes(conv)) {
            const neg = /^[+-]/.test(s) ? s[0] : '';
            s = neg + '0'.repeat(w - s.length) + s.slice(neg.length);
          } else s = ' '.repeat(w - s.length) + s;
        }
      }
      return s;
    });
  }

  function funcCombinator(f, name, args) {
    const g = args[0];
    switch (name) {
      case 'andThen': return new JFunc((a) => { const r = this.callFunc(f, a); return g instanceof JFunc ? this.callFunc(g, r === undefined ? a : [r]) : r; });
      case 'compose': return new JFunc((a) => this.callFunc(f, [this.callFunc(g, a)]));
      case 'negate': return new JFunc((a) => !this.callFunc(f, a));
      case 'and': return new JFunc((a) => this.callFunc(f, a) && this.callFunc(g, a));
      case 'or': return new JFunc((a) => this.callFunc(f, a) || this.callFunc(g, a));
    }
  }

  function strIndex(it, s, i, line, max) {
    if (typeof i !== 'number') throw compileErr(`incompatible types: ${typeName(i)} cannot be converted to int`, line);
    if (i < 0 || i > max) it.throwNew('StringIndexOutOfBoundsException', `Index ${i} out of bounds for length ${s.length}`, line);
    return i;
  }

  function stringMethod(s, name, args, line) {
    const a = args;
    switch (name) {
      case 'length': return s.length;
      case 'isEmpty': return s.length === 0;
      case 'isBlank': return s.trim().length === 0;
      case 'charAt': {
        const i = a[0];
        if (typeof i !== 'number') throw compileErr(`incompatible types: ${typeName(i)} cannot be converted to int`, line);
        if (i < 0 || i >= s.length) this.throwNew('StringIndexOutOfBoundsException', `Index ${i} out of bounds for length ${s.length}`, line);
        return new JChar(s.charCodeAt(i));
      }
      case 'substring': {
        const b = strIndex(this, s, a[0], line, s.length);
        const e = a.length > 1 ? strIndex(this, s, a[1], line, s.length) : s.length;
        if (b > e) this.throwNew('StringIndexOutOfBoundsException', `begin ${b}, end ${e}, length ${s.length}`, line);
        return s.substring(b, e);
      }
      case 'indexOf': return s.indexOf(a[0] instanceof JChar ? String.fromCharCode(a[0].c) : a[0], a[1]);
      case 'lastIndexOf': return s.lastIndexOf(a[0] instanceof JChar ? String.fromCharCode(a[0].c) : a[0]);
      case 'contains': return s.includes(this.str(a[0]));
      case 'startsWith': return s.startsWith(a[0]);
      case 'endsWith': return s.endsWith(a[0]);
      case 'equals': return typeof a[0] === 'string' && a[0] === s;
      case 'equalsIgnoreCase': return typeof a[0] === 'string' && a[0].toLowerCase() === s.toLowerCase();
      case 'compareTo': { const o = a[0]; for (let i = 0; i < Math.min(s.length, o.length); i++) { if (s[i] !== o[i]) return s.charCodeAt(i) - o.charCodeAt(i); } return s.length - o.length; }
      case 'toUpperCase': return s.toUpperCase();
      case 'toLowerCase': return s.toLowerCase();
      case 'trim': case 'strip': return s.trim();
      case 'concat': return s + a[0];
      case 'replace': return s.split(this.str(a[0])).join(this.str(a[1]));
      case 'repeat': return s.repeat(a[0]);
      case 'split': return new JArray('String', s.split(a[0].length === 1 ? a[0] : new RegExp(a[0])));
      case 'toCharArray': return new JArray('char', [...s].map((c) => new JChar(c.charCodeAt(0))));
      case 'hashCode': { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; }
      case 'toString': return s;
      case 'chars': throw compileErr('streams are not supported in this playground', line);
      case 'format': case 'formatted': return javaFormat.call(this, s, a, line);
    }
    throw compileErr(`cannot find symbol\n  symbol:   method ${name}(${a.map(typeName).join(',')})\n  location: class String`, line);
  }

  function mapKey(k) {
    if (typeof k === 'string') return 's:' + k;
    if (typeof k === 'number') return 'i:' + k;
    if (k instanceof JDouble) return 'd:' + k.v;
    if (k instanceof JChar) return 'c:' + k.c;
    if (typeof k === 'boolean') return 'b:' + k;
    if (k === null) return 'null';
    return k;
  }

  function nativeToString(v) {
    switch (v.kind) {
      case 'List': return '[' + v.data.map((x) => (x === v ? '(this Collection)' : this.str(x))).join(', ') + ']';
      case 'Map': return '{' + [...v.data.values()].map((e) => this.str(e.k) + '=' + this.str(e.v)).join(', ') + '}';
      case 'StringBuilder': return v.data.s;
      case 'Class': return 'class ' + (QUALIFIED[v.data.name] || v.data.name);
    }
    return v.kind + '@' + hashHex(v);
  }

  function nativeMethod(o, name, a, line) {
    switch (o.kind) {
      case 'PrintStream': {
        const err = o.data.err;
        switch (name) {
          case 'println': this.write((a.length ? this.str(a[0]) : '') + '\n', err); return;
          case 'print': this.write(this.str(a[0]), err); return;
          case 'printf': case 'format': this.write(javaFormat.call(this, a[0], a.slice(1), line), err); return;
          case 'flush': return;
        }
        break;
      }
      case 'List': {
        const l = o.data;
        const bounds = (i) => { if (typeof i !== 'number') throw compileErr(`incompatible types: ${typeName(i)} cannot be converted to int`, line); if (i < 0 || i >= l.length) this.throwNew('IndexOutOfBoundsException', `Index ${i} out of bounds for length ${l.length}`, line); return i; };
        switch (name) {
          case 'add': if (a.length === 2) { if (a[0] < 0 || a[0] > l.length) this.throwNew('IndexOutOfBoundsException', `Index: ${a[0]}, Size: ${l.length}`, line); l.splice(a[0], 0, a[1]); return undefined; } l.push(a[0]); return true;
          case 'addFirst': l.unshift(a[0]); return;
          case 'get': return l[bounds(a[0])];
          case 'set': { const i = bounds(a[0]); const old = l[i]; l[i] = a[1]; return old; }
          case 'size': return l.length;
          case 'isEmpty': return l.length === 0;
          case 'clear': l.length = 0; return;
          case 'contains': return l.some((x) => this.valuesEqual(x, a[0]));
          case 'indexOf': return l.findIndex((x) => this.valuesEqual(x, a[0]));
          case 'remove': {
            if (typeof a[0] === 'number') { const i = bounds(a[0]); return l.splice(i, 1)[0]; }
            const i = l.findIndex((x) => this.valuesEqual(x, a[0]));
            if (i >= 0) { l.splice(i, 1); return true; }
            return false;
          }
          case 'addAll': l.push(...a[0].data); return true;
          case 'forEach': for (const x of l.slice()) this.callFunc(a[0], [x]); return;
          case 'toString': return nativeToString.call(this, o);
          case 'equals': return this.valuesEqual(o, a[0]);
          case 'sort': l.sort((x, y) => (a[0] ? this.callFunc(a[0], [x, y]) : (typeof x === 'string' ? (x < y ? -1 : x > y ? 1 : 0) : numOf(x) - numOf(y)))); return;
          case 'getFirst': return l[0];
          case 'getLast': return l[l.length - 1];
          case 'removeIf': { const keep = l.filter((x) => !this.callFunc(a[0], [x])); const changed = keep.length !== l.length; l.length = 0; l.push(...keep); return changed; }
          case 'stream': throw compileErr('streams are not supported in this playground', line);
        }
        break;
      }
      case 'Map': {
        const m = o.data;
        switch (name) {
          case 'put': { const key = mapKey(a[0]); const old = m.get(key); m.set(key, { k: a[0], v: a[1] }); return old ? old.v : null; }
          case 'get': { const e = m.get(mapKey(a[0])); return e ? e.v : null; }
          case 'getOrDefault': { const e = m.get(mapKey(a[0])); return e ? e.v : a[1]; }
          case 'containsKey': return m.has(mapKey(a[0]));
          case 'containsValue': return [...m.values()].some((e) => this.valuesEqual(e.v, a[0]));
          case 'remove': { const key = mapKey(a[0]); const e = m.get(key); m.delete(key); return e ? e.v : null; }
          case 'size': return m.size;
          case 'isEmpty': return m.size === 0;
          case 'clear': m.clear(); return;
          case 'keySet': return new JNative('List', [...m.values()].map((e) => e.k));
          case 'values': return new JNative('List', [...m.values()].map((e) => e.v));
          case 'putIfAbsent': { const key = mapKey(a[0]); if (!m.has(key)) m.set(key, { k: a[0], v: a[1] }); return m.get(key).v; }
          case 'toString': return nativeToString.call(this, o);
          case 'forEach': for (const e of [...m.values()]) this.callFunc(a[0], [e.k, e.v]); return;
        }
        break;
      }
      case 'StringBuilder': {
        const d = o.data;
        switch (name) {
          case 'append': d.s += this.str(a[0]); return o;
          case 'toString': return d.s;
          case 'length': return d.s.length;
          case 'reverse': d.s = [...d.s].reverse().join(''); return o;
          case 'insert': d.s = d.s.slice(0, a[0]) + this.str(a[1]) + d.s.slice(a[0]); return o;
          case 'charAt': return new JChar(d.s.charCodeAt(a[0]));
          case 'setLength': d.s = d.s.slice(0, a[0]); return;
          case 'isEmpty': return d.s.length === 0;
        }
        break;
      }
      case 'Class': {
        const c = o.data;
        if (name === 'getName') return QUALIFIED[c.name] || c.name;
        if (name === 'getSimpleName') return c.name;
        break;
      }
      case 'Random': {
        if (name === 'nextInt') return a.length ? Math.floor(Math.random() * a[0]) : Math.floor(Math.random() * 4294967296) - 2147483648;
        if (name === 'nextDouble') return new JDouble(Math.random());
        if (name === 'nextBoolean') return Math.random() < 0.5;
        break;
      }
    }
    throw compileErr(`cannot find symbol\n  symbol:   method ${name}(${a.map(typeName).join(',')})\n  location: class ${typeName(o)}`, line);
  }

  /* ------------------------------------------------------------------ *
   * run()
   * ------------------------------------------------------------------ */

  function run(source, opts) {
    opts = opts || {};
    const it = new Interp(opts);
    const result = { output: '', error: null, checks: [], events: [], hasEntry: false, stderrParts: [] };
    const userLines = opts.userLines || Infinity;
    try {
      // ---- load preludes ----
      it.load(parsedPrelude('$base', BASE_PRELUDE), true);
      for (const name of opts.prelude || []) {
        if (!PRELUDES[name]) throw new Error('Unknown prelude: ' + name);
        const pp = parsedPrelude(name, PRELUDES[name]);
        // prelude may also bring loose helpers: not supported, classes only
        it.load(pp, true);
      }
      // ---- parse user code (+ hidden harness) ----
      const full = source + (opts.harness ? '\n' + opts.harness : '');
      const prog = parseSource(full);
      const loose = prog.loose.length > 0 || prog.methods.length > 0;
      if (loose) {
        const stmts = prog.loose;
        const mainNode = {
          k: 'method', name: 'main', retTy: { name: 'void', dims: 0 }, params: [{ name: 'args', ty: { name: 'String', dims: 1 }, varargs: false }],
          body: { k: 'block', body: stmts, line: stmts.length ? stmts[0].line : 1 }, mods: new Set(['public', 'static']), line: stmts.length ? stmts[0].line : 1
        };
        const cnode = { k: 'class', kind: 'class', name: '$Main', line: 1, mods: new Set(), superName: null, ifaces: [], fields: [], methods: [mainNode, ...prog.methods], ctors: [], initItems: [], instItems: [], nested: [], consts: [] };
        // explicit main in classes + loose statements is confusing; prefer loose
        prog.classes.push(cnode);
      }
      it.load({ classes: prog.classes }, false);
      it.link();
      result.hasEntry = it.runMain(prog, loose);
    } catch (e) {
      handleError(it, e, result, userLines);
    }
    result.output = it.getOutput();
    result.stderrParts = it.outBuf;
    result.checks = it.checks;
    result.events = it.events;
    if (result.error && result.error.kind === 'compile') {
      // javac would have refused to run the program at all
      result.output = '';
      result.stderrParts = [];
    }
    return result;
  }

  /* ------------------------------------------------------------------ *
   * Sessions: load classes once, then run small snippets against them.
   * Used by the robot panel: the page "ticks" the fake robot 50 times a
   * second and pokes the virtual controller while the student's objects
   * (and every static, like the CommandScheduler) stay alive.
   *
   *   const s = MiniJava.createSession(source, { prelude: ['wpilib'] });
   *   if (s.error) ...;
   *   const r = s.exec('Sim.press(0, "A"); Sim.loops(3);');
   *   // r = { output, events, error }   (only what this call produced)
   * ------------------------------------------------------------------ */

  function createSession(source, opts) {
    opts = opts || {};
    const it = new Interp(opts);
    const cache = new Map();
    const session = { error: null, exec: null };
    const hostNode = {
      k: 'class', kind: 'class', name: '$Snip', line: 1, mods: new Set(), superName: null, ifaces: [],
      fields: [], methods: [], ctors: [], initItems: [], instItems: [], nested: [], consts: []
    };
    try {
      it.load(parsedPrelude('$base', BASE_PRELUDE), true);
      for (const name of opts.prelude || []) {
        if (!PRELUDES[name]) throw new Error('Unknown prelude: ' + name);
        it.load(parsedPrelude(name, PRELUDES[name]), true);
      }
      const prog = parseSource(source);
      if (prog.loose.length > 0 || prog.methods.length > 0) {
        throw compileErr('class, interface, or enum expected\n  (put your code inside a class)', (prog.loose[0] || prog.methods[0]).line);
      }
      it.load({ classes: prog.classes }, false);
      it.declareClass(hostNode, null, true);
      it.link();
    } catch (e) {
      const r = { error: null };
      handleError(it, e, r, Infinity);
      session.error = r.error;
      session.exec = () => ({ output: '', events: [], error: r.error });
      return session;
    }
    session.classNames = Array.from(it.classes.values()).filter((c) => !c.fromPrelude).map((c) => c.name);
    session.exec = function (src) {
      const res = { output: '', events: [], error: null };
      let node = cache.get(src);
      try {
        if (!node) {
          const p = parseSource(src);
          const stmts = p.loose;
          node = {
            k: 'method', name: 'main', retTy: { name: 'void', dims: 0 }, params: [],
            body: { k: 'block', body: stmts, line: 1 }, mods: new Set(['public', 'static']), line: 1
          };
          if (cache.size > 300) cache.clear();
          cache.set(src, node);
        }
        const ci = it.classes.get('$Snip');
        node.owner = ci;
        ci.methods.set('main', [node]);
        it.steps = 0; it.depth = 0;
        it.ensureInit(ci);
        it.invoke(node, null, []);
      } catch (e) {
        handleError(it, e, res, Infinity);
      }
      res.output = it.getOutput();
      res.events = it.events;
      it.outBuf = []; it.outLen = 0; it.events = [];
      if (res.error && res.error.kind === 'compile') res.output = '';
      return res;
    };
    return session;
  }

  function handleError(it, e, result, userLines) {
    if (e instanceof JavaError) {
      result.error = { kind: e.kind, message: e.message, line: e.line };
    } else if (e instanceof JavaThrow) {
      const o = e.obj;
      let desc;
      try { desc = it.str(o); } catch (_) { desc = o.cls.name; }
      result.error = { kind: 'exception', message: desc, line: o.throwLine || it.curLine, className: o.cls.name };
    } else if (e instanceof ExitSignal) {
      result.exitCode = e.code;
    } else if (e instanceof RangeError && /call stack|too much recursion/i.test(e.message)) {
      result.error = { kind: 'exception', message: 'java.lang.StackOverflowError', line: it.curLine, className: 'StackOverflowError' };
    } else {
      result.error = { kind: 'internal', message: 'Internal playground error: ' + (e && e.message ? e.message : e), line: it.curLine };
      if (typeof console !== 'undefined') console.error(e);
    }
  }

  return { run, createSession, registerPrelude, lex, parseSource, fmtDouble, BASE_PRELUDE };
});
