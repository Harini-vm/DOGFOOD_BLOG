/* Dog-Food write-up: the labs. Plain JavaScript, no libraries, nothing loaded from other hosts. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var SEAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#seal-ring"/>';
  function seal(label, detail, kind) {
    var mark = kind === "stamp" ? '<path d="M9 9l6 6M15 9l-6 6"/>' : kind === "ink" ? '<circle cx="12" cy="12" r="1.6"/>' : '<path d="M8.5 12.2l2.4 2.4 4.8-5"/>';
    return '<span class="seal ' + (kind && kind !== "ok" ? kind : "") + '">' + SEAL + mark + '</svg><span>' + esc(label) + '</span>' + (detail ? '<code>' + esc(detail) + '</code>' : '') + '</span>';
  }

  /* ---------------- chrome: theme, progress, rail ---------------- */
  var themeBtn = $("#theme");
  themeBtn.addEventListener("click", function () {
    var root = document.documentElement;
    var dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  });
  var bar = $("#progress");
  function onScroll() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  }
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  var railLinks = $$("#rail a");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        railLinks.forEach(function (a) {
          var on = a.getAttribute("href") === "#" + en.target.id;
          if (on) { a.setAttribute("aria-current", "page"); if (innerWidth <= 900) a.scrollIntoView({ block: "nearest", inline: "center" }); }
          else a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    $$("article > section").forEach(function (s) { io.observe(s); });
  }

  /* ---------------- Lab 1: psql console ---------------- */
  (function () {
    var con = $("#console"), box = $("#stmts");
    var sw = { deadline: $("#sw-deadline"), published: $("#sw-published"), voting: $("#sw-voting") };
    // Published results imply closed submissions (that's the real rule for publishing).
    sw.published.addEventListener("change", function () { if (sw.published.checked) sw.deadline.checked = true; });
    sw.deadline.addEventListener("change", function () { if (!sw.deadline.checked) sw.published.checked = false; });
    var err = function (code, msg) { return { cls: "err", text: "ERROR:  " + msg + "\nSQLSTATE " + code }; };
    var ok = function (msg, note) { return { cls: "ok", text: msg + (note ? "   -- " + note : "") }; };
    var S = [
      { sql: "UPDATE projects SET title = 'Better title' WHERE id = 'prj_07';", run: function (s) {
        return s.deadline ? err("DF001", "submissions for Sample Hack 2026 are closed") : ok("UPDATE 1", "window is open"); } },
      { sql: "INSERT INTO projects (team_id, title, status) VALUES ('tm_12', 'Late entry', 'submitted');", run: function (s) {
        return s.deadline ? err("DF001", "submissions for Sample Hack 2026 are closed") : ok("INSERT 0 1"); } },
      { sql: "UPDATE projects SET status = 'withdrawn' WHERE id = 'prj_07';", run: function (s) {
        return ok("UPDATE 1", s.deadline ? "status-only moderation is allowed after close" : "window is open"); } },
      { sql: "UPDATE score_items SET value = 5 WHERE score_id = 'sc_88';", run: function (s) {
        return s.published ? err("DF004", "results are published; scores are locked") : ok("UPDATE 1", "judging still open"); } },
      { sql: "UPDATE score_items SET value = 9 WHERE score_id = 'sc_88';", run: function (s) {
        return s.published ? err("DF004", "results are published; scores are locked") : err("DF002", "value 9 is outside the rubric's scale 1..5"); } },
      { sql: "UPDATE results SET body = jsonb_set(body, '{0,rank}', '1') WHERE version = 1;", run: function (s) {
        return s.published ? err("DF003", "a published results snapshot cannot be changed") : ok("UPDATE 0", "nothing published yet"); } },
      { sql: "DELETE FROM audit_log WHERE action = 'score.saved';", run: function () {
        return err("DF009", "audit_log is append-only"); } },
      { sql: "INSERT INTO votes (voter_id, project_id) VALUES ('v_3', 'prj_10');", run: function (s) {
        return s.voting ? ok("INSERT 0 1", "voting window is open") : err("DF005", "voting for Sample Hack 2026 is closed"); } }
    ];
    S.forEach(function (st) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "btn"; b.textContent = st.sql;
      b.addEventListener("click", function () {
        var state = { deadline: sw.deadline.checked, published: sw.published.checked, voting: sw.voting.checked };
        var r = st.run(state);
        var dim = con.querySelector(".dim:only-child"); if (dim) dim.remove();
        var q = document.createElement("div"); q.className = "q"; q.textContent = st.sql;
        var o = document.createElement("div"); o.className = r.cls; o.style.whiteSpace = "pre-wrap"; o.textContent = r.text;
        con.appendChild(q); con.appendChild(o); con.scrollTop = con.scrollHeight;
      });
      box.appendChild(b);
    });
    var cap = document.createElement("p"); cap.className = "figure-cap"; cap.style.margin = "var(--s2) 0 0";
    cap.textContent = "A replay of the trigger logic in your browser, not a live database. The error codes and rules are Dog-Food's; the message wording is shortened.";
    con.after(cap);
  })();

  /* ---------------- Lab 2: escape hatch state machine ---------------- */
  (function () {
    var version = "before", st;
    function reset() { st = { status: "draft", wasSubmitted: false, log: [] }; }
    reset();
    var states = $("#sm-states"), acts = $("#sm-actions"), verdict = $("#sm-verdict");
    var A = [
      { label: "Submit now", fn: function () { return { refused: "DF001: submissions are closed" }; } },
      { label: "Withdraw entry", fn: function () {
        if (st.status === "withdrawn") return { refused: "already withdrawn" };
        if (version === "after" && st.status !== "submitted") return { refused: "409: only a submitted entry can be withdrawn" };
        st.status = "withdrawn"; return { ok: "status → withdrawn (content unchanged, so the trigger allows it)" }; } },
      { label: "Restore entry", fn: function () {
        if (st.status !== "withdrawn") return { refused: "only a withdrawn entry can be restored" };
        if (version === "after" && !st.wasSubmitted) return { refused: "409: this entry was never submitted" };
        st.status = "submitted"; return { ok: "status → submitted (content unchanged, so the trigger allows it)" }; } },
      { label: "Edit the summary", fn: function () { return { refused: "DF001: content is frozen after the deadline" }; } }
    ];
    function render(last) {
      var order = ["draft", "submitted", "withdrawn"];
      states.innerHTML = order.map(function (s, i) {
        return (i ? '<span class="state-arrow">·</span>' : "") + '<span class="state-pill' + (st.status === s ? " on" : "") + '">' + s + "</span>";
      }).join("");
      var html = "";
      if (last) html += last.ok ? '<div class="note ok">' + esc(last.ok) + "</div>" : '<div class="note bad">Refused · ' + esc(last.refused) + "</div>";
      if (st.status === "submitted" && !st.wasSubmitted) html += seal("A late entry is now in the judging pool", "bug", "stamp");
      else if (version === "after" && last && last.refused && /never|only a submitted/.test(last.refused)) html += seal("The hatch only opens for real entries", "fixed", "ok");
      verdict.innerHTML = html;
    }
    A.forEach(function (a) {
      var b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = a.label;
      b.addEventListener("click", function () { render(a.fn()); });
      acts.appendChild(b);
    });
    var r = document.createElement("button"); r.type = "button"; r.className = "btn quiet"; r.textContent = "Reset";
    r.addEventListener("click", function () { reset(); render(); }); acts.appendChild(r);
    $$("[data-v]").forEach(function (b) {
      b.addEventListener("click", function () {
        version = b.dataset.v;
        $$("[data-v]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        reset(); render();
      });
    });
    render();
  })();

  /* ---------------- Lab 3: normalization bench (real fixture) ---------------- */
  (function () {
    var F = window.FIXTURE; if (!F) return;
    var reviews = F.reviews.map(function (r) { return { judge: r[0], project: r[1], x: r[2] }; });
    var mv = function (xs) { var n = xs.length, m = 0, v = 0; xs.forEach(function (x) { m += x; }); m /= n; xs.forEach(function (x) { v += (x - m) * (x - m); }); return [m, v / n]; };
    var all = mv(reviews.map(function (r) { return r.x; })), M = all[0], VAR = all[1], S = Math.sqrt(VAR);
    var byJ = {}, byP = {};
    reviews.forEach(function (r) { (byJ[r.judge] = byJ[r.judge] || []).push(r); (byP[r.project] = byP[r.project] || []).push(r); });
    var jName = function (id) { return F.judges[id]; };
    var findJ = function (name) { for (var k in F.judges) if (F.judges[k] === name) return k; };
    var spotlight = ["Tomas Varga", "Leila Nasser", "Iva Petrova", "Rafa Okonkwo", "Wei Lindqvist"].map(findJ).filter(Boolean);
    var tomas = findJ("Tomas Varga"), tomasProj = byJ[tomas] ? byJ[tomas][0].project : null;

    // raw ranking
    var rawScore = {};
    Object.keys(byP).forEach(function (p) { rawScore[p] = mv(byP[p].map(function (r) { return r.x; }))[0]; });
    var rank = function (score) {
      var ids = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; });
      var out = {}, prev = null, pr = 0;
      ids.forEach(function (id, i) { var s = Math.round(score[id] * 100) / 100; if (s !== prev) { pr = i + 1; prev = s; } out[id] = pr; });
      return { order: ids, rank: out };
    };
    var raw = rank(rawScore);

    var kIn = $("#k"), cIn = $("#c");
    function kVal() { return +kIn.value >= 21 ? 1000 : +kIn.value; }
    function compute() {
      var k = kVal(), c = +cIn.value, adj = {}, stats = {};
      Object.keys(byJ).forEach(function (j) {
        var xs = byJ[j].map(function (r) { return r.x; }), n = xs.length, mvv = mv(xs);
        var m2 = (n * mvv[0] + k * M) / (n + k), sd2 = Math.sqrt((n * mvv[1] + k * VAR) / (n + k));
        stats[j] = { n: n, mean: mvv[0], m2: m2 };
        byJ[j].forEach(function (r) { adj[r.judge + "|" + r.project] = sd2 > 1e-9 ? M + S * (r.x - m2) / sd2 : M; });
      });
      var score = {};
      Object.keys(byP).forEach(function (p) {
        var a = byP[p].map(function (r) { return adj[r.judge + "|" + r.project]; });
        score[p] = (a.reduce(function (s, x) { return s + x; }, 0) + c * M) / (a.length + c);
      });
      return { stats: stats, score: score, ranked: rank(score), adj: adj };
    }
    function render() {
      var k = kVal();
      $("#kv").textContent = k === 1000 ? "off" : k;
      $("#cv").textContent = cIn.value;
      var R = compute();
      // judges
      var jt = '<thead><tr><th>judge</th><th class="num">reviews</th><th class="num">own mean</th><th class="num">shift</th></tr></thead><tbody>';
      spotlight.forEach(function (j) {
        var s = R.stats[j], shift = M - s.m2;
        jt += '<tr' + (j === tomas ? ' class="hl"' : '') + '><td>' + esc(jName(j)) + '</td><td class="num">' + s.n + '</td><td class="num">' + s.mean.toFixed(1) +
          '</td><td class="num ' + (shift >= 0 ? "move-up" : "move-down") + '">' + (shift >= 0 ? "+" : "") + shift.toFixed(1) + "</td></tr>";
      });
      $("#judge-table").innerHTML = jt + "</tbody>";
      // ranking
      var ids = R.ranked.order.slice(0, 10);
      if (tomasProj && ids.indexOf(tomasProj) < 0) ids.push(tomasProj);
      var rt = '<thead><tr><th class="num">#</th><th>project</th><th class="num">score</th><th class="num">raw</th></tr></thead><tbody>';
      ids.forEach(function (p) {
        var r = R.ranked.rank[p], rr = raw.rank[p], d = rr - r;
        var mv2 = d > 0 ? '<span class="move-up">▲' + d + "</span>" : d < 0 ? '<span class="move-down">▼' + (-d) + "</span>" : '<span class="muted">·</span>';
        rt += '<tr' + (p === tomasProj ? ' class="hl"' : '') + '><td class="num place">' + r + "</td><td>" + esc(F.projects[p]) +
          ' <small class="muted">' + byP[p].length + 'r</small></td><td class="num">' + R.score[p].toFixed(1) + '</td><td class="num">' + rr + " " + mv2 + "</td></tr>";
      });
      $("#rank-table").innerHTML = rt + "</tbody>";
      var tr = R.ranked.rank[tomasProj], trr = raw.rank[tomasProj];
      $("#bench-note").innerHTML = "Highlighted: " + esc(F.projects[tomasProj]) + ", the only project Tomas reviewed. Raw rank " + trr + ", now rank " + tr + "." +
        (k === 0 ? " A plain z-score gives it a big lift from a single review." : k >= 1000 ? " With the correction off, scores are almost raw averages." : "");
      $$(".presets button").forEach(function (b) {
        var on = +b.dataset.k === k && +b.dataset.c === +cIn.value;
        b.classList.toggle("primary", on);
      });
    }
    kIn.addEventListener("input", render); cIn.addEventListener("input", render);
    $$(".presets button").forEach(function (b) {
      b.addEventListener("click", function () { kIn.value = +b.dataset.k >= 1000 ? 21 : b.dataset.k; cIn.value = b.dataset.c; render(); });
    });
    render();
  })();

  /* ---------------- Labs 4 and 5: proof charts ---------------- */
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, text) { var e = document.createElementNS(NS, tag); for (var a in attrs) e.setAttribute(a, attrs[a]); if (text != null) e.textContent = text; return e; }
  (function () {
    var svg = $("#methods-chart");
    var data = [["raw average", 0.839, ""], ["plain z-score (K 0, C 0)", 0.787, "bad"], ["shrunk z, no prior (K 3, C 0)", 0.870, ""], ["Dog-Food (K 3, C 1)", 0.870, "ours"]];
    var x0 = 210, x1 = 600, lo = 0.75, hi = 0.9, sx = function (v) { return x0 + (v - lo) / (hi - lo) * (x1 - x0); };
    [0.75, 0.8, 0.85, 0.9].forEach(function (t) {
      svg.appendChild(el("line", { x1: sx(t), x2: sx(t), y1: 8, y2: 182, class: "grid" }));
      svg.appendChild(el("text", { x: sx(t), y: 200, "text-anchor": "middle" }, t.toFixed(2)));
    });
    data.forEach(function (d, i) {
      var y = 14 + i * 42;
      svg.appendChild(el("text", { x: x0 - 10, y: y + 17, "text-anchor": "end", class: d[2] === "ours" ? "lbl" : "" }, d[0]));
      svg.appendChild(el("rect", { x: x0, y: y, width: sx(d[1]) - x0, height: 24, rx: 3, class: "bar " + d[2] }));
      svg.appendChild(el("text", { x: sx(d[1]) + 6, y: y + 17, class: "lbl" }, d[1].toFixed(3)));
    });
  })();
  (function () {
    var svg = $("#k-chart"), tip = $("#k-tip");
    var pts = [["0", 0.787, 0.006], ["1", 0.855, 0.004], ["2", 0.868, 0.004], ["3", 0.870, 0.004], ["5", 0.868, 0.005], ["10", 0.861, 0.005], ["1000 (off)", 0.841, 0.006]];
    var x0 = 50, x1 = 610, y0 = 200, y1 = 16, lo = 0.78, hi = 0.88;
    var sx = function (i) { return x0 + i * (x1 - x0) / (pts.length - 1); }, sy = function (v) { return y0 - (v - lo) / (hi - lo) * (y0 - y1); };
    [0.78, 0.8, 0.82, 0.84, 0.86, 0.88].forEach(function (t) {
      svg.appendChild(el("line", { x1: x0, x2: x1, y1: sy(t), y2: sy(t), class: "grid" }));
      svg.appendChild(el("text", { x: x0 - 8, y: sy(t) + 4, "text-anchor": "end" }, t.toFixed(2)));
    });
    svg.appendChild(el("line", { x1: x0, x2: x1, y1: sy(0.839), y2: sy(0.839), class: "ref" }));
    svg.appendChild(el("text", { x: x1, y: sy(0.839) - 6, "text-anchor": "end" }, "raw average 0.839"));
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + sx(i) + " " + sy(p[1]); }).join(" ");
    svg.appendChild(el("path", { d: d, class: "line" }));
    pts.forEach(function (p, i) {
      svg.appendChild(el("text", { x: sx(i), y: 222, "text-anchor": "middle", class: p[0] === "3" ? "lbl" : "" }, "K " + p[0]));
      var c = el("circle", { cx: sx(i), cy: sy(p[1]), r: p[0] === "3" ? 7 : 5.5, class: "dot" + (p[0] === "3" ? " best" : ""), tabindex: 0 });
      var show = function () {
        $$("#k-chart circle").forEach(function (o) { o.setAttribute("r", o.classList.contains("best") ? 7 : 5.5); });
        c.setAttribute("r", 8);
        var note = p[0] === "0" ? "plain z-score: worse than raw" : p[0] === "3" ? "the peak, and what Dog-Food uses" : p[0].indexOf("off") > 0 ? "correction effectively off" : (p[1] > 0.839 ? "beats raw" : "");
        tip.textContent = "K = " + p[0] + " · ρ " + p[1].toFixed(3) + " ± " + p[2] + (note ? " · " + note : "");
      };
      c.addEventListener("mouseenter", show); c.addEventListener("focus", show); c.addEventListener("click", show);
      svg.appendChild(c);
    });
  })();

  /* ---------------- Lab 6: Bradley–Terry panel ---------------- */
  (function () {
    var names = ["Still Beacon", "Slow Trail", "Salt Ledger", "Copper Kiln", "Dry Relay", "Glass Signal"];
    var q = [1.2, 0.75, 0.3, -0.15, -0.6, -1.05];               // hidden truth, gaps of 0.45
    var N = names.length, THRESH = Math.ceil(3 * N / 2);           // ~3 answers per entry
    var comps, history;
    var rubricRank = names.map(function (_, i) { return i; });    // the rubric ranking = index order
    function reset() { comps = []; history = []; render(); }
    function fit() {
      var p = names.map(function () { return 1; });
      for (var it = 0; it < 300; it++) {
        var np = p.map(function (pi, i) {
          var w = 0.5, den = 1 / (pi + 1);                          // virtual draw vs an average entry (strength 1)
          comps.forEach(function (c) {
            if (c.a !== i && c.b !== i) return;
            var j = c.a === i ? c.b : c.a;
            if (c.w === i) w += 1;
            den += 1 / (pi + p[j]);
          });
          return w / den;
        });
        p = np;
      }
      return p;
    }
    function order(p) { return names.map(function (_, i) { return i; }).sort(function (a, b) { return p[b] - p[a]; }); }
    function tau(ord) {
      var pos = []; ord.forEach(function (e, r) { pos[e] = r; });
      var c = 0, d = 0;
      for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++) { if ((pos[i] - pos[j]) * (rubricRank[i] - rubricRank[j]) > 0) c++; else d++; }
      return (c - d) / (N * (N - 1) / 2);
    }
    function nextPair() {
      var ord = order(fit()), cnt = {}, best = null;
      comps.forEach(function (c) { var k = Math.min(c.a, c.b) + "-" + Math.max(c.a, c.b); cnt[k] = (cnt[k] || 0) + 1; });
      [1, 2, 3].forEach(function (gap) {
        for (var r = 0; r + gap < N; r++) {
          var a = ord[r], b = ord[r + gap], k = Math.min(a, b) + "-" + Math.max(a, b);
          var cost = (cnt[k] || 0) * 3 + gap + Math.random() * 0.5;
          if (!best || cost < best.cost) best = { a: a, b: b, cost: cost };
        }
      });
      return Math.random() < 0.5 ? [best.a, best.b] : [best.b, best.a];   // which side is shown first varies
    }
    var pair;
    function answer(winner) {
      comps.push({ a: pair[0], b: pair[1], w: winner });
      history.push(tau(order(fit())));
      render();
    }
    function simulate() {
      var a = pair[0], b = pair[1], pa = 1 / (1 + Math.exp(-1.6 * (q[a] - q[b])));
      answer(Math.random() < pa ? a : b);
    }
    function render() {
      pair = nextPair();
      var duel = $("#duel");
      duel.innerHTML = "";
      [0, 1].forEach(function (s) {
        if (s === 1) { var v = document.createElement("span"); v.className = "vs"; v.textContent = "vs"; duel.appendChild(v); }
        var b = document.createElement("button"); b.type = "button"; b.className = "btn";
        b.innerHTML = '<span class="nm">' + esc(names[pair[s]]) + '</span><small class="muted">pick this one</small>';
        b.addEventListener("click", function () { answer(pair[s]); });
        duel.appendChild(b);
      });
      var p = fit(), ord = order(p);
      var t = '<thead><tr><th class="num">#</th><th>entry</th><th class="bar-cell"></th><th class="num">%</th><th class="num">rubric</th></tr></thead><tbody>';
      ord.forEach(function (e, r) {
        var pct = p[e] / (p[e] + 1) * 100;
        t += '<tr><td class="num">' + (r + 1) + "</td><td>" + esc(names[e]) + '</td><td class="bar-cell"><div class="hbar"><span style="left:0;width:' + pct.toFixed(1) + '%"></span></div></td><td class="num">' + pct.toFixed(0) + '</td><td class="num">' + (e + 1) + "</td></tr>";
      });
      $("#bt-table").innerHTML = t + "</tbody>";
      var agree = comps.filter(function (c) { return c.w === Math.min(c.a, c.b); }).length;
      var n = comps.length, html;
      if (!n) html = '<p class="muted">No answers yet.</p>';
      else {
        html = '<p>Judges agreed with the rubric in <strong>' + agree + " of " + n + "</strong> head-to-heads.</p>";
        html += n >= THRESH ? seal("Kendall τ", history[n - 1].toFixed(2), "ok")
          : seal("τ hidden", (THRESH - n) + " more answer" + (THRESH - n === 1 ? "" : "s") + " needed", "ink");
        var dis = comps.filter(function (c) { return c.w !== Math.min(c.a, c.b); }).slice(-3);
        if (dis.length) html += '<p class="muted" style="font-size:.85rem;margin-top:var(--s2)">Disagreements to look at: ' + dis.map(function (c) { return esc(names[c.w]) + " over " + esc(names[c.w === c.a ? c.b : c.a]); }).join("; ") + "</p>";
      }
      $("#bt-agree").innerHTML = html;
      // sparkline
      var sv = $("#bt-spark"); sv.innerHTML = "";
      var W = 300, H = 64, m = Math.max(history.length, THRESH + 4);
      var sx = function (i) { return 4 + i * (W - 8) / Math.max(m - 1, 1); }, sy = function (v) { return H / 2 - v * (H / 2 - 4); };
      sv.appendChild(el("line", { x1: 0, x2: W, y1: sy(0), y2: sy(0), class: "grid" }));
      sv.appendChild(el("line", { x1: sx(THRESH - 1), x2: sx(THRESH - 1), y1: 0, y2: H, class: "ref" }));
      if (history.length) {
        sv.appendChild(el("path", { d: history.map(function (v, i) { return (i ? "L" : "M") + sx(i) + " " + sy(v); }).join(" "), class: "line", "vector-effect": "non-scaling-stroke" }));
      }
    }
    $("#bt-one").addEventListener("click", simulate);
    $("#bt-ten").addEventListener("click", function () { for (var i = 0; i < 10; i++) { simulate(); } });
    $("#bt-reset").addEventListener("click", reset);
    reset();
  })();

  /* ---------------- Lab 7: invitation attack replay ---------------- */
  (function () {
    var before = [
      ["Organizer A (Spring Hack) invites judge@uni.edu. The account is created, pending activation.", "judge@uni.edu · <b>pending</b> · judge in Spring Hack"],
      ["Organizer B, of an unrelated event, invites the <em>same</em> email. Accepted: B receives a fresh one-time link.", "judge@uni.edu · <b>pending</b> · judge in Spring Hack, Event B"],
      ["B opens their own link and sets a password. The account activates with <em>B's</em> password.", "judge@uni.edu · <b>active</b> · password set by Organizer B"],
      ["B logs in as the judge and opens Spring Hack's scorecards.", "<span style=\"color:var(--stamp)\">TAKEOVER: B reads and writes A's judge scores</span>"]
    ];
    var after = [
      ["Organizer A (Spring Hack) invites judge@uni.edu. The account is created, pending activation.", "judge@uni.edu · <b>pending</b> · judge in Spring Hack"],
      ["Organizer B invites the same email. <strong>Refused: 409 pending_elsewhere.</strong> Only the admin can add a second event to a pending account.", "judge@uni.edu · <b>pending</b> · judge in Spring Hack"],
      ["The real judge opens A's link and sets their own password. Every other open link for the account is cancelled.", "judge@uni.edu · <b>active</b> · password set by the judge"],
      ["Even an old leftover link now fails: a link never works on an active account. It is never a password reset.", "<span style=\"color:var(--seal)\">The account stays with its owner</span>"]
    ];
    var step = 0;
    function fill(id, rows, acctId) {
      $(id).innerHTML = rows.map(function (r, i) { return '<li class="' + (i < step ? "seen" : "") + '">' + r[0] + "</li>"; }).join("");
      $(acctId).innerHTML = step ? "account: " + rows[step - 1][1] : '<span class="muted">account: (none yet)</span>';
    }
    function render() {
      fill("#atk-before", before, "#acct-before"); fill("#atk-after", after, "#acct-after");
      $("#atk-count").textContent = "step " + step + " of " + before.length;
      $("#atk-next").disabled = step >= before.length;
    }
    $("#atk-next").addEventListener("click", function () { if (step < before.length) step++; render(); });
    $("#atk-reset").addEventListener("click", function () { step = 0; render(); });
    render();
  })();

  /* ---------------- Lab 8: two doors, one budget ---------------- */
  (function () {
    var mode = "before", acct, mail, msg;
    function reset() { acct = 0; mail = 0; msg = ""; render(); }
    function vote(door) {
      if (mode === "before") {
        if (door === "acct") { if (acct >= 3) msg = '<div class="note bad">409 budget_spent (account budget)</div>'; else { acct++; msg = ""; } }
        else { if (mail >= 3) msg = '<div class="note bad">409 budget_spent (email-link budget)</div>'; else { mail++; msg = ""; } }
      } else {
        if (acct + mail >= 3) msg = '<div class="note bad">409 budget_spent · same person, same keyed email hash, whichever door</div>';
        else { door === "acct" ? acct++ : mail++; msg = ""; }
      }
      render();
    }
    function render() {
      var n = acct + mail, slots = Math.max(3, n), pips = "";
      for (var i = 0; i < slots; i++) pips += "<i class=\"" + (i < n ? "used" : "") + "\"></i>";
      var p = $("#v-pips"); p.innerHTML = pips; p.classList.toggle("over", n > 3);
      $("#v-n").textContent = n + " / 3" + (n ? "  (" + acct + " via account, " + mail + " via email link)" : "");
      $("#v-msg").innerHTML = (n > 3 ? seal("One person, " + n + " votes", "two budgets", "stamp") : "") + msg;
    }
    $("#v-acct").addEventListener("click", function () { vote("acct"); });
    $("#v-mail").addEventListener("click", function () { vote("mail"); });
    $("#v-reset").addEventListener("click", reset);
    $$("[data-vv]").forEach(function (b) {
      b.addEventListener("click", function () {
        mode = b.dataset.vv; $$("[data-vv]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); reset();
      });
    });
    reset();
  })();

  /* ---------------- Lab 9: now() vs clock_timestamp() ---------------- */
  (function () {
    var sIn = $("#tx-start"), lIn = $("#tx-len"), LO = -12, HI = 22;
    var pct = function (t) { return (t - LO) / (HI - LO) * 100; };
    var fmt = function (t) {
      var total = 18 * 3600 + t, h = Math.floor(total / 3600), m = Math.floor((total - h * 3600) / 60), sec = total - h * 3600 - m * 60;
      var ss = sec % 1 ? sec.toFixed(1) : String(sec);
      return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + (sec < 10 ? "0" : "") + ss;
    };
    function render() {
      var s = +sIn.value, L = +lIn.value, e = s + L;
      $("#tx-start-v").textContent = fmt(s); $("#tx-len-v").textContent = L + " s";
      $("#dl").style.left = pct(0) + "%";
      var bar = $("#txbar"); bar.style.left = pct(s) + "%"; bar.style.width = (pct(e) - pct(s)) + "%";
      var a = $("#mk-a"), b = $("#mk-b");
      a.style.left = pct(s) + "%"; a.textContent = "BEGIN " + fmt(s);
      b.style.left = pct(e) + "%"; b.textContent = "INSERT " + fmt(e);
      b.style.top = (pct(e) - pct(s) < 22) ? "74px" : "58px";
      var nowOk = s < 0, clkOk = e < 0;
      var vd = function (node, fn, okv, at) {
        node.className = "note " + (okv ? "ok" : "bad");
        node.innerHTML = "<code>" + fn + "</code> = " + fmt(at) + "<br><strong>" + (okv ? "accepted" : "refused · DF001") + "</strong>";
      };
      vd($("#vd-now"), "now()", nowOk, s);
      vd($("#vd-clock"), "clock_timestamp()", clkOk, e);
      if (nowOk && !clkOk) $("#vd-now").innerHTML += '<br><span style="color:var(--stamp)">A write after the deadline got in.</span>';
    }
    sIn.addEventListener("input", render); lIn.addEventListener("input", render);
    render();
  })();
})();
