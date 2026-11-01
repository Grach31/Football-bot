/* Адаптер: даёт приложению тот же интерфейс window.claude.use("db" | "user" | "sample"),
   но поверх Supabase (таблицы docs и members, вход по e-mail и паролю). */
(function () {
  "use strict";
  var cfg = window.APP_CONFIG || {};
  var configured = cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf("YOUR-") === -1;
  var sb = null, session = null, role = null;
  var readyResolve, ready = new Promise(function (r) { readyResolve = r; });

  /* ---------- экран входа ---------- */
  function overlay() {
    var o = document.getElementById("authOverlay");
    if (o) return o;
    o = document.createElement("div"); o.id = "authOverlay";
    o.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0e0e10;color:#f3f3f3;font-family:Onest,system-ui,sans-serif;padding:24px";
    o.innerHTML =
      '<form id="authForm" style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:12px">' +
      '<div style="font:700 26px Manrope,system-ui;margin-bottom:4px">Мой заработок</div>' +
      '<input id="authEmail" type="email" autocomplete="username" placeholder="E-mail" required style="padding:14px;border-radius:12px;border:1px solid #333;background:#18181b;color:inherit;font-size:16px">' +
      '<input id="authPass" type="password" autocomplete="current-password" placeholder="Пароль" required style="padding:14px;border-radius:12px;border:1px solid #333;background:#18181b;color:inherit;font-size:16px">' +
      '<button style="padding:14px;border-radius:12px;border:0;background:#e8c46a;color:#1a1400;font:600 16px Onest,system-ui">Войти</button>' +
      '<div id="authMsg" style="min-height:20px;font-size:14px;color:#ff8d8d"></div></form>';
    document.body.appendChild(o);
    return o;
  }
  function msg(t) { var m = document.getElementById("authMsg"); if (m) m.textContent = t || ""; }

  async function loadRole() {
    var r = await sb.from("members").select("role").eq("email", session.user.email.toLowerCase()).maybeSingle();
    role = r.data ? r.data.role : null;
    return role;
  }

  async function start() {
    if (!configured) {
      document.addEventListener("DOMContentLoaded", function () { overlay(); document.getElementById("authForm").innerHTML = '<div style="font-size:16px;line-height:1.5">Не заполнен config.js: нужны адрес проекта Supabase и anon-ключ.</div>'; });
      return;
    }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    var s = await sb.auth.getSession();
    session = s.data.session;
    if (session && await loadRole()) { readyResolve(); return; }
    var wait = function () {
      var o = overlay(); o.style.display = "flex";
      document.getElementById("authForm").onsubmit = async function (e) {
        e.preventDefault(); msg("");
        var res = await sb.auth.signInWithPassword({ email: document.getElementById("authEmail").value.trim(), password: document.getElementById("authPass").value });
        if (res.error) { msg("Неверный e-mail или пароль."); return; }
        session = res.data.session;
        if (!(await loadRole())) { await sb.auth.signOut(); msg("Этому аккаунту доступ не выдан."); return; }
        o.remove(); readyResolve();
      };
    };
    if (document.body) wait(); else document.addEventListener("DOMContentLoaded", wait);
  }

  /* ---------- «база» в стиле Firestore ---------- */
  function newId() {
    var a = new Uint8Array(15); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join("");
  }
  var listeners = {}; // collection -> [fn]
  var channel = null;
  function emit(col) { (listeners[col] || []).forEach(function (fn) { fn(); }); }
  function ensureChannel() {
    if (channel) return;
    channel = sb.channel("docs-all").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, function (p) {
      var row = p.new && p.new.collection ? p.new : p.old; if (row && row.collection) emit(row.collection);
    }).subscribe();
  }
  async function fetchCol(col) {
    var r = await sb.from("docs").select("id,data").eq("collection", col);
    if (r.error) throw r.error;
    return r.data;
  }
  function watch(col, fn, onErr) {
    ensureChannel();
    var run = function () { fetchCol(col).then(fn).catch(function (e) { if (onErr) onErr(e); }); };
    (listeners[col] = listeners[col] || []).push(run);
    run();
    return function () { listeners[col] = listeners[col].filter(function (x) { return x !== run; }); };
  }
  function split(path) { var i = path.indexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; }
  function wrap(row) { return { id: row.id, data: function () { return row.data; } }; }

  var db = {
    collection: function (col) {
      return {
        add: async function (data) {
          var id = newId();
          var r = await sb.from("docs").insert({ collection: col, id: id, data: data });
          if (r.error) throw r.error; emit(col); return { id: id };
        },
        onSnapshot: function (cb, err) { return watch(col, function (rows) { cb({ docs: rows.map(wrap) }); }, err); }
      };
    },
    doc: function (path) {
      var p = split(path), col = p[0], id = p[1];
      return {
        set: async function (data) {
          var r = await sb.from("docs").upsert({ collection: col, id: id, data: data, updated_at: new Date().toISOString() });
          if (r.error) throw r.error; emit(col);
        },
        update: async function (patch) {
          var cur = await sb.from("docs").select("data").eq("collection", col).eq("id", id).maybeSingle();
          if (cur.error) throw cur.error;
          var merged = Object.assign({}, cur.data ? cur.data.data : {}, patch);
          var r = await sb.from("docs").upsert({ collection: col, id: id, data: merged, updated_at: new Date().toISOString() });
          if (r.error) throw r.error; emit(col);
        },
        delete: async function () {
          var r = await sb.from("docs").delete().eq("collection", col).eq("id", id);
          if (r.error) throw r.error; emit(col);
        },
        onSnapshot: function (cb, err) {
          return watch(col, function (rows) {
            var row = rows.filter(function (x) { return x.id === id; })[0];
            cb({ exists: !!row, data: function () { return row ? row.data : undefined; } });
          }, err);
        }
      };
    }
  };

  /* ---------- распознавание чеков через Edge Function ---------- */
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(",")[1]); };
      fr.onerror = rej; fr.readAsDataURL(blob);
    });
  }
  var sample = {
    limits: async function () { return { images: true }; },
    json: async function (prompt, opts) {
      var blob = opts && opts.images; if (Array.isArray(blob)) blob = blob[0];
      var b64 = await blobToB64(blob);
      var r = await sb.functions.invoke("scan-receipt", { body: { prompt: prompt, image: b64, mediaType: blob.type || "image/jpeg" } });
      if (r.error) { var e = new Error("scan failed"); e.code = "failed"; throw e; }
      return r.data;
    }
  };

  window.claude = {
    use: async function (name) {
      await ready;
      if (name === "db") return db;
      if (name === "user") return { isOwner: async function () { return role === "owner"; } };
      if (name === "sample") return sample;
      return null;
    }
  };
  start();
})();
