// Reusable UI components. Every view is built from these so behaviour and accessibility stay consistent.
import { h, icon, ago, fmtDate, clear, uid } from "./util.js";
import { PROV, ADM_LABEL, DGN_LABEL, EM_LABEL } from "./services.js";
import { t } from "./i18n.js";

export const badge = (text, cls = "muted", ic) => h("span", { class: "badge " + cls }, ic ? icon(ic, 12) : null, text);

export function provBadge(key, ts) {
  const p = PROV[key] || PROV.unverified;
  return h("span", { class: "prov " + p.cls, title: p.help }, h("span", { class: "dot" }), t("prov." + key, p.label), ts && key !== "demo" && key !== "public" ? h("small", {}, " · " + ago(ts)) : null);
}
const STATUS_CLS = { requested: "warn", submitted: "warn", received: "info", under_review: "info", info_requested: "warn", confirmed: "ok", accepted: "ok", completed: "ok", report_ready: "ok", arrived: "ok", admitted: "ok", discharged: "muted", resources_ready: "ok", acknowledged: "info", notified: "warn", rejected: "danger", cancelled: "muted", no_show: "danger", registered: "info", sample_collected: "info", processing: "info", published: "ok", pending_approval: "warn", draft: "muted", pending: "warn", verified: "ok", active: "ok", suspended: "danger", sent: "info", closed: "muted", hospital_proposed: "info", rescheduled: "warn" };
export const STATUS_TEXT = { ...Object.fromEntries(Object.entries({ ...ADM_LABEL, ...DGN_LABEL, ...EM_LABEL }).map(([k, v]) => [k, v])), no_show: "Missed", pending_approval: "Awaiting approval", published: "Published", draft: "Draft", completed: "Completed", requested: "Requested", confirmed: "Confirmed", pending: "Pending verification", verified: "Verified", active: "Active", suspended: "Suspended", sent: "Sent" };
export const statusBadge = (s) => badge(t("status." + s, STATUS_TEXT[s] || s.replace(/_/g, " ")), STATUS_CLS[s] || "muted");

export const pageHead = (title, sub, ...actions) => h("header", { class: "page-head" }, h("div", {}, h("h1", {}, title), sub ? h("p", { class: "sub" }, sub) : null), actions.length ? h("div", { class: "actions" }, actions) : null);
export const card = (opts, ...body) => {
  if (typeof opts === "string") opts = { title: opts };
  return h("section", { class: "card " + (opts.cls || "") }, (opts.title || opts.actions) ? h("div", { class: "card-head" }, h("div", {}, opts.title ? h("h2", {}, opts.title) : null, opts.sub ? h("p", { class: "sub" }, opts.sub) : null), opts.actions ? h("div", { class: "actions" }, opts.actions) : null) : null, h("div", { class: "card-body" }, body));
};
export const stat = (label, value, sub, tone = "") => h("div", { class: "stat " + tone }, h("div", { class: "stat-v" }, value), h("div", { class: "stat-l" }, label), sub ? h("div", { class: "stat-s" }, sub) : null);
export const grid = (cols, ...kids) => h("div", { class: "grid g" + cols }, kids);
export const empty = (msg, action) => h("div", { class: "empty" }, icon("info", 28), h("p", {}, msg), action || null);
export const notice = (kind, ...kids) => h("div", { class: "notice " + kind, role: kind === "danger" ? "alert" : "note" }, icon(kind === "danger" ? "alert" : kind === "ok" ? "check" : "info", 18), h("div", {}, kids));
export const demoNote = () => notice("demo", h("strong", {}, "DEMO DATA. "), "Records marked DEMO are samples for testing — not real patients, hospitals or availability.");
export const btn = (label, onclick, cls = "", ic) => h("button", { class: "btn " + cls, type: "button", onclick }, ic ? icon(ic, 16) : null, label);
export const link = (label, href, cls = "", ic) => h("a", { class: "btn " + cls, href }, ic ? icon(ic, 16) : null, label);

export function table(cols, rows, opts = {}) {
  if (!rows.length) return empty(opts.empty || "Nothing here yet.");
  return h("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": opts.label || "Table" }, h("table", { class: "table" },
    h("thead", {}, h("tr", {}, cols.map(c => h("th", { scope: "col", class: c.cls || "" }, c.h)))),
    h("tbody", {}, rows.map(r => h("tr", {}, cols.map(c => h("td", { class: c.cls || "", "data-label": c.h }, c.f(r))))))));
}

// ---------- forms ------------------------------------------------------------------------------------
export function form(fields, opts = {}) {
  const vals = { ...(opts.initial || {}) };
  const err = h("div", { class: "form-err", role: "alert", "aria-live": "polite" });
  const els = {};
  const rows = fields.map(f => {
    const id = "f_" + f.name + "_" + uid("");
    let input;
    const cur = vals[f.name] ?? f.value ?? (f.type === "checkbox" ? false : "");
    const common = { id, name: f.name, required: !!f.required, placeholder: f.placeholder, "aria-describedby": f.hint ? id + "_h" : null, min: f.min, max: f.max, step: f.step, minlength: f.minlength, autocomplete: f.autocomplete, inputmode: f.inputmode, pattern: f.pattern };
    const opt = (f.options || []).map(o => typeof o === "object" ? o : { value: o, label: o });
    if (f.type === "select") input = h("select", common, f.placeholder === undefined && !f.required ? h("option", { value: "" }, "—") : h("option", { value: "" }, f.placeholder || "Select…"), opt.map(o => h("option", { value: o.value, selected: String(o.value) === String(cur) }, o.label)));
    else if (f.type === "textarea") { input = h("textarea", { ...common, rows: f.rows || 3 }); input.value = cur; }
    else if (f.type === "checkbox") { input = h("input", { ...common, type: "checkbox" }); input.checked = !!cur; }
    else if (f.type === "multiselect") { input = h("div", { class: "chips", role: "group", "aria-label": f.label }, opt.map(o => { const cb = h("input", { type: "checkbox", value: o.value, checked: (cur || []).includes(o.value) }); return h("label", { class: "chip-check" }, cb, o.label); })); }
    else if (f.type === "file") input = h("input", { ...common, type: "file", accept: f.accept });
    else { input = h("input", { ...common, type: f.type || "text" }); input.value = cur; }
    els[f.name] = input;
    const wrap = h("div", { class: "field " + (f.type === "checkbox" ? "check " : "") + (f.wide ? "wide" : "") },
      f.type === "checkbox" ? h("label", { for: id }, input, h("span", {}, f.label)) : [h("label", { for: id }, f.label, f.required ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null), input],
      f.hint ? h("small", { id: id + "_h", class: "hint" }, f.hint) : null);
    if (f.show) wrap.dataset.show = "1";
    wrap._f = f; return wrap;
  });
  const read = () => {
    const o = {};
    for (const f of fields) {
      const el = els[f.name];
      if (f.type === "checkbox") o[f.name] = el.checked;
      else if (f.type === "multiselect") o[f.name] = [...el.querySelectorAll("input:checked")].map(i => i.value);
      else if (f.type === "file") o[f.name] = el.files[0] || null;
      else if (f.type === "number") o[f.name] = el.value === "" ? "" : +el.value;
      else o[f.name] = el.value;
    }
    return o;
  };
  const sync = () => { const v = read(); rows.forEach(w => { if (w._f.show) w.hidden = !w._f.show(v); }); opts.onInput?.(v, els); };
  const submit = h("button", { class: "btn primary", type: "submit" }, opts.submitLabel || t("common.save", "Save"));
  const f = h("form", { class: "form", novalidate: false, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = "";
    submit.disabled = true;
    try { const v = read(); for (const fl of fields) { if (fl.show && !fl.show(v)) delete v[fl.name]; } await opts.onSubmit(v, f); }
    catch (ex) { err.textContent = ex.message || String(ex); err.scrollIntoView?.({ block: "nearest" }); }
    finally { submit.disabled = false; }
  } }, h("div", { class: "form-grid" }, rows), err, h("div", { class: "form-actions" }, opts.onCancel ? btn(t("common.cancel", "Cancel"), opts.onCancel) : null, submit));
  f.addEventListener("input", sync); f.addEventListener("change", sync); sync();
  f.els = els; f.read = read; return f;
}

// ---------- overlays ---------------------------------------------------------------------------------
export function modal(title, body, opts = {}) {
  const prevFocus = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); prevFocus?.focus?.(); opts.onClose?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const content = typeof body === "function" ? body(close) : body;
  const back = h("div", { class: "modal-back", onclick: (e) => { if (e.target === back) close(); } },
    h("div", { class: "modal " + (opts.wide ? "wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "modal-head" }, h("h2", {}, title), h("button", { class: "icon-btn", "aria-label": "Close", onclick: close }, icon("x", 18))), h("div", { class: "modal-body" }, content)));
  document.body.append(back); document.addEventListener("keydown", onKey);
  (back.querySelector("input,select,textarea,button.primary") || back.querySelector("button"))?.focus();
  return { close };
}
export const confirmDialog = (msg, okLabel = "Confirm", danger = false) => new Promise(res => {
  let done = false;
  const m = modal("Please confirm", (close) => h("div", {}, h("p", {}, msg), h("div", { class: "form-actions" }, btn("Cancel", () => { done = true; close(); res(false); }), btn(okLabel, () => { done = true; close(); res(true); }, danger ? "danger" : "primary"))), { onClose: () => { if (!done) res(false); } });
});
export function toast(msg, kind = "ok") {
  let box = document.getElementById("toasts"); if (!box) { box = h("div", { id: "toasts", "aria-live": "polite", role: "status" }); document.body.append(box); }
  const el = h("div", { class: "toast " + kind }, icon(kind === "ok" ? "check" : kind === "danger" ? "alert" : "info", 16), msg);
  box.append(el); setTimeout(() => el.remove(), 4500);
}
export function tabs(items, active, onChange) {
  const body = h("div", { class: "tab-body", role: "tabpanel" });
  const bar = h("div", { class: "tabs", role: "tablist" });
  const show = (id) => { bar.querySelectorAll("button").forEach(b => { const on = b.dataset.id === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; }); clear(body).append(items.find(i => i.id === id).render()); onChange?.(id); };
  items.forEach(i => bar.append(h("button", { role: "tab", class: "tab", "data-id": i.id, onclick: () => show(i.id) }, i.label, i.count != null ? h("span", { class: "count" }, i.count) : null)));
  bar.addEventListener("keydown", (e) => { const bs = [...bar.children]; const i = bs.indexOf(document.activeElement); if (e.key === "ArrowRight") { bs[(i + 1) % bs.length].focus(); bs[(i + 1) % bs.length].click(); } if (e.key === "ArrowLeft") { bs[(i - 1 + bs.length) % bs.length].focus(); bs[(i - 1 + bs.length) % bs.length].click(); } });
  show(active || items[0].id); return h("div", {}, bar, body);
}
export const timeline = (events) => h("ol", { class: "timeline" }, events.map(e => h("li", { class: e.kind || "" }, h("span", { class: "tl-dot" }), h("div", {}, h("div", { class: "tl-text" }, e.text), h("div", { class: "tl-meta" }, `${e.by || ""} · ${fmtDate(e.at, true)}`)))));
export const kv = (pairs) => h("dl", { class: "kv" }, pairs.filter(Boolean).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v ?? "—")]));

// ---------- charts (inline SVG, no libraries) -------------------------------------------------------
export function barChart(items, { unit = "", max, height = 22, color } = {}) {
  const m = max ?? Math.max(1, ...items.map(i => i.value));
  return h("div", { class: "bars", role: "img", "aria-label": items.map(i => `${i.label}: ${i.value}${unit}`).join("; ") }, items.map(i => h("div", { class: "bar-row" }, h("div", { class: "bar-l" }, i.label), h("div", { class: "bar-t" }, h("div", { class: "bar-f " + (i.tone || ""), style: { width: Math.max(2, (i.value / m) * 100) + "%", background: color || undefined } })), h("div", { class: "bar-v" }, i.display ?? `${i.value}${unit}`))));
}
export function donut(parts, { size = 120, center } = {}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1, r = 42, c = 2 * Math.PI * r; let off = 0;
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("width", size); svg.setAttribute("height", size); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", parts.map(p => `${p.label} ${p.value}`).join(", "));
  parts.forEach(p => { const ci = document.createElementNS(NS, "circle"); ci.setAttribute("cx", 50); ci.setAttribute("cy", 50); ci.setAttribute("r", r); ci.setAttribute("fill", "none"); ci.setAttribute("stroke-width", 14); ci.setAttribute("class", "seg " + (p.tone || "")); ci.setAttribute("stroke-dasharray", `${(p.value / total) * c} ${c}`); ci.setAttribute("stroke-dashoffset", -off); ci.setAttribute("transform", "rotate(-90 50 50)"); off += (p.value / total) * c; svg.append(ci); });
  if (center != null) { const tx = document.createElementNS(NS, "text"); tx.setAttribute("x", 50); tx.setAttribute("y", 55); tx.setAttribute("text-anchor", "middle"); tx.setAttribute("class", "donut-c"); tx.textContent = center; svg.append(tx); }
  return h("div", { class: "donut" }, svg, h("ul", { class: "legend" }, parts.map(p => h("li", {}, h("span", { class: "sw " + (p.tone || "") }), `${p.label} · ${p.value}`))));
}
export const meter = (used, total, label) => { const pct = total ? Math.round(used / total * 100) : 0; return h("div", { class: "meter", role: "meter", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": used, "aria-label": label }, h("div", { class: "meter-f " + (pct > 90 ? "danger" : pct > 75 ? "warn" : "ok"), style: { width: pct + "%" } })); };

export function fileToData(file, maxKB = 400) {
  return new Promise((res, rej) => {
    if (!file) return res(null);
    if (file.size > maxKB * 1024) return rej(new Error(`File is larger than ${maxKB} KB (prototype stores files in the browser).`));
    const r = new FileReader(); r.onload = () => res({ name: file.name, type: file.type, data: r.result }); r.onerror = rej; r.readAsDataURL(file);
  });
}
