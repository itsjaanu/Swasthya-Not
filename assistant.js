// Multilingual healthcare navigation assistant (local rule-based engine; a server-side LLM can replace `answer()`).
// It NEVER diagnoses or prescribes. Emergency red flags always get the 108/112 message first.
import { h, icon, clear, haversine, km, ago } from "./util.js";
import { db } from "./db.js";
import { DISTRICTS, DEPARTMENTS } from "./seed.js";
import { t, lang, speechLang } from "./i18n.js";
import { bedTotals, provenance, pharmacyStockFor } from "./services.js";
import { directionsUrl } from "./map.js";

const RED = /chest pain|can'?t breathe|cannot breathe|difficulty breathing|unconscious|not breathing|stroke|face droop|seizure|heavy bleeding|snake|poison|overdose|suicid|kill myself|severe burn|pregnan\w* .*bleed|ఛాతి నొప్పి|శ్వాస|స్పృహ|పాము|विष|सीने में दर्द|सांस|बेहोश|साँप|आत्महत्या|நெஞ்சு வலி|மூச்சு|மயக்கம்|பாம்பு|தற்கொலை/i;
const EMERG = { en: "This could be an emergency. Call 108 (ambulance) or 112 now, or go to the nearest emergency department. Do not wait for online approval. If you are thinking of harming yourself, call 112 or the Tele-MANAS helpline 14416.", te: "ఇది అత్యవసర పరిస్థితి కావచ్చు. వెంటనే 108 (అంబులెన్స్) లేదా 112 కు కాల్ చేయండి లేదా దగ్గరలోని అత్యవసర విభాగానికి వెళ్లండి. ఆన్‌లైన్ ఆమోదం కోసం వేచి ఉండకండి.", hi: "यह आपात स्थिति हो सकती है। तुरंत 108 (एम्बुलेंस) या 112 पर कॉल करें या नज़दीकी आपातकालीन विभाग जाएँ। ऑनलाइन मंज़ूरी का इंतज़ार न करें।", ta: "இது அவசரநிலையாக இருக்கலாம். உடனே 108 (ஆம்புலன்ஸ்) அல்லது 112 ஐ அழைக்கவும்; அருகிலுள்ள அவசரப் பிரிவுக்குச் செல்லவும். இணைய ஒப்புதலுக்குக் காத்திருக்க வேண்டாம்." };
const NODIAG = { en: "I can't diagnose conditions or recommend medicines — a doctor needs to examine you. I can help you find a suitable department and prepare questions to ask.", te: "నేను వ్యాధిని నిర్ధారించలేను, మందులు సూచించలేను — డాక్టర్ పరీక్షించాలి. సరైన విభాగాన్ని కనుగొనడంలో, డాక్టర్‌ను అడగాల్సిన ప్రశ్నలు సిద్ధం చేయడంలో సహాయం చేయగలను.", hi: "मैं रोग का निदान या दवा की सलाह नहीं दे सकता — डॉक्टर को जाँच करनी होगी। मैं सही विभाग खोजने और डॉक्टर से पूछने के प्रश्न तैयार करने में मदद कर सकता हूँ।", ta: "என்னால் நோயைக் கண்டறியவோ மருந்து பரிந்துரைக்கவோ முடியாது — மருத்துவர் பரிசோதிக்க வேண்டும். சரியான பிரிவைக் கண்டறியவும் கேள்விகளைத் தயாரிக்கவும் உதவுவேன்." };
const T = { // short localized frames
  nearby: { en: "Facilities I found", te: "నాకు దొరికిన కేంద్రాలు", hi: "मुझे मिली सुविधाएँ", ta: "கிடைத்த மையங்கள்" },
  none: { en: "I couldn't find a match in the platform. Try a district name or use Find hospitals.", te: "ప్లాట్‌ఫారమ్‌లో దొరకలేదు. జిల్లా పేరు ప్రయత్నించండి లేదా 'ఆసుపత్రులు కనుగొనండి' వాడండి.", hi: "प्लेटफ़ॉर्म में कुछ नहीं मिला। ज़िले का नाम आज़माएँ या 'अस्पताल खोजें' का उपयोग करें।", ta: "தளத்தில் கிடைக்கவில்லை. மாவட்டப் பெயரை முயற்சிக்கவும் அல்லது 'மருத்துவமனை தேடு' பயன்படுத்தவும்." },
  help: { en: "I can help you find hospitals (try: “ICU in Guntur”), understand appointments and admissions, find camps, tests and medicine stock, and prepare questions for your doctor. In an emergency call 108.", te: "ఆసుపత్రులు కనుగొనడం (ఉదా: “Guntur లో ICU”), అపాయింట్‌మెంట్/అడ్మిషన్ ప్రక్రియ, శిబిరాలు, పరీక్షలు, మందుల స్టాక్ గురించి సహాయం చేస్తాను. అత్యవసరంలో 108 కు కాల్ చేయండి.", hi: "मैं अस्पताल खोजने (जैसे “Guntur में ICU”), अपॉइंटमेंट/भर्ती प्रक्रिया, शिविर, जाँच और दवा स्टॉक में मदद कर सकता हूँ। आपात में 108 पर कॉल करें।", ta: "மருத்துவமனை தேடல் (எ.கா. “Guntur ICU”), சந்திப்பு/அனுமதி செயல்முறை, முகாம்கள், பரிசோதனைகள், மருந்து இருப்பு குறித்து உதவுவேன். அவசரத்தில் 108 ஐ அழைக்கவும்." },
};
const L = (o) => o[lang()] || o.en;
const norm = (s) => s.toLowerCase();

export function answer(q, user) {
  if (RED.test(q)) return { alert: true, text: L(EMERG), src: "Safety rule", acts: [{ label: "Call 108", href: "tel:108" }, { label: "Call 112", href: "tel:112" }] };
  const s = norm(q);
  const dist = DISTRICTS.find(d => s.includes(d.name.toLowerCase().split(" ")[0].replace(".", "")) && d.name.length > 3 || s.includes(d.name.toLowerCase()));
  const dept = DEPARTMENTS.find(d => s.includes(d.toLowerCase().split(" ")[0]) && d.length > 4) || (/heart|cardiac|हृदय|గుండె|இதய/.test(s) ? "Cardiology" : /child|baby|పిల్ల|बच्चे|குழந்தை/.test(s) ? "Paediatrics" : /pregnan|maternity|delivery|గర్భ|गर्भ|கர்ப்ப/.test(s) ? "Obstetrics & Gynaecology" : null);
  if (/diagnos|what disease|which medicine|prescribe|dose|dosage|tablet for|medicine for|what.*(have|is wrong)|ఏ మందు|कौन सी दवा|என்ன மருந்து/.test(s) && !/stock|available|pharmacy/.test(s)) return { text: L(NODIAG) + "\n\n" + prep(dept), src: "General information — not medical advice", acts: dept ? [{ label: "Find " + dept, hash: "#/find" }] : [] };
  if (/camp|శిబిర|शिविर|முகாம்/.test(s)) { const c = db.where("camps", c => c.status === "published" && (!dist || c.district === dist.name)).slice(0, 4); return { text: c.length ? c.map(x => `• ${x.title} — ${x.district}, ${x.date} ${x.start}`).join("\n") : "No upcoming published camps found.", src: "Platform data (camps may be DEMO)", acts: [{ label: "See camps", hash: user ? "#/app/camps" : "#/login" }] }; }
  if (/medicine|stock|pharmacy|మందు|दवा|மருந்து/.test(s) && /stock|available|have|pharmacy|ఉన్న|उपलब्ध|இருப்பு/.test(s)) {
    const m = s.match(/(paracetamol|metformin|amlodipine|ors|cetirizine|atorvastatin|salbutamol|pantoprazole|azithromycin|amoxicillin|iron)/);
    if (m) { const r = pharmacyStockFor(m[1]).slice(0, 4); return { text: r.length ? r.map(x => `• ${x.org.name} (${x.org.district}) — ${x.stock.qty} in stock, updated ${ago(x.stock.updatedAt)}`).join("\n") : `No pharmacy on the platform reports ${m[1]} in stock.`, src: "Pharmacy-reported stock (DEMO) — confirm by phone. Prescription medicines need a valid prescription." }; }
  }
  if (/test|scan|x-?ray|mri|ct |ultrasound|blood|పరీక్ష|जाँच|பரிசோதனை/.test(s)) { const o = db.where("orgs", o => (o.kind === "diagnostic" || o.kind === "hospital") && o.tests?.length && (!dist || o.district === dist.name)).slice(0, 4); return { text: o.length ? o.map(x => `• ${x.name} (${x.district}) — ${x.tests.length} tests`).join("\n") : L(T.none), src: "Platform data (DEMO)", acts: [{ label: "Tests & scans", hash: user ? "#/app/diagnostics" : "#/login" }] }; }
  if (/appointment|book|అపాయింట్|अपॉइंट|சந்திப்/.test(s)) return { text: "1. Open a hospital → choose department and doctor.\n2. Pick a free slot and who the visit is for.\n3. The hospital confirms or declines; you get a notification and reminder.\nA booking is a request until confirmed.", src: "How the platform works", acts: [{ label: "Find hospitals", hash: "#/find" }] };
  if (/admission|admit|bed|ఆసుపత్రిలో చేర|भर्ती|அனுமதி/.test(s) && !dept && !/icu|available/.test(s)) return { text: "An admission request goes to the hospital with your documents and a reference number. The hospital reviews it and accepts, declines or asks for more information. It is NOT a confirmed bed. Emergency patients should go straight to emergency — never wait for online approval.", src: "How the platform works" };
  if (/consent|share|record|access|రికార్డ్|रिकॉर्ड|பதிவு/.test(s)) return { text: "Doctors only see records you share. In Records → Sharing you choose which records, for what purpose and for how long, and you can revoke at any time. Every access is logged.", src: "How the platform works" };
  if (/hospital|icu|bed|emergency|doctor|clinic|phc|chc|ఆసుపత్రి|अस्पताल|மருத்துவமனை|near/.test(s) || dist || dept) {
    let f = db.where("orgs", o => o.kind === "hospital" && (o.verification === "verified" || o.demo) && (!dist || o.district === dist.name) && (!dept || o.depts.includes(dept)) && (!/icu/.test(s) || o.beds?.icu) && (!/emergency|24/.test(s) || o.emergency24x7));
    const me = user && DISTRICTS.find(d => d.name === user.district); if (!dist && me) f = f.map(o => ({ ...o, d: haversine(me, o) })).sort((a, b) => a.d - b.d);
    f = f.slice(0, 4); if (!f.length) return { text: L(T.none), src: "Platform data" };
    return { text: L(T.nearby) + ":\n" + f.map(o => { const b = bedTotals(o); const ic = o.beds?.icu ? ` · ICU free ${o.beds.icu.total - o.beds.icu.occupied - (o.beds.icu.unavailable || 0)}` : ""; return `• ${o.name} — ${o.district}${/bed|icu/.test(s) ? ` · beds free ${b.available} (reported ${ago(b.updatedAt)})${ic}` : ""}`; }).join("\n"), src: "Platform data — provider-reported, DEMO. Call to confirm.", acts: f.slice(0, 2).map(o => ({ label: o.name.replace("Demo ", "").slice(0, 28), hash: user ? "#/app/hospital/" + o.id : "#/find/" + o.id })) };
  }
  return { text: L(T.help), src: "" };
}
function prep(dept) { return "Questions you could ask your doctor:\n• What is the likely cause and what tests are needed?\n• What treatment options exist and what are the risks?\n• What warning signs mean I should come back or call 108?\n• When is my follow-up?" + (dept ? `\n\nA suitable department to start with: ${dept}.` : ""); }

export function mountAssistant(getUser) {
  document.getElementById("assistant-root")?.remove();
  const root = h("div", { id: "assistant-root" }); document.body.append(root);
  let open = false, log = [], panel;
  const speak = (txt) => { if (!("speechSynthesis" in window)) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = speechLang(); speechSynthesis.speak(u); };
  const draw = () => {
    clear(root);
    if (!open) return root.append(h("button", { class: "fab", "aria-label": t("assistant.title", "Health assistant"), onclick: () => { open = true; draw(); } }, icon("chat", 20), t("assistant.title", "Health assistant")));
    const logEl = h("div", { class: "chat-log", "aria-live": "polite" }, !log.length ? h("div", { class: "msg a" }, L(T.help), h("span", { class: "src" }, "Not medical advice. Replies from platform data are labelled; general information is labelled as such.")) : null,
      log.map(m => h("div", { class: "msg " + (m.u ? "u" : "a") + (m.alert ? " alert" : "") }, m.text, m.src ? h("span", { class: "src" }, m.src) : null, m.acts?.length ? h("div", { class: "acts" }, m.acts.map(a => h("a", { class: "btn sm", href: a.href || a.hash }, a.label))) : null, !m.u ? h("button", { class: "btn sm ghost", "aria-label": "Read aloud", onclick: () => speak(m.text) }, icon("speaker", 14)) : null)));
    const input = h("input", { type: "text", placeholder: t("assistant.placeholder", "Ask here…"), "aria-label": "Message", onkeydown: e => { if (e.key === "Enter") send(); } });
    const send = () => { const q = input.value.trim(); if (!q) return; log.push({ u: true, text: q }); const a = answer(q, getUser()); log.push(a); if (a.alert) speak(a.text); draw(); };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = SR ? h("button", { class: "icon-btn", "aria-label": "Speak", onclick: () => { const r = new SR(); r.lang = speechLang(); r.onresult = e => { input.value = e.results[0][0].transcript; send(); }; r.start(); } }, icon("mic", 18)) : null;
    const chips = ["ICU beds in Guntur", "Heart hospital in Visakhapatnam", "Medical camps", "Is paracetamol in stock?", "How do I request admission?"];
    panel = h("div", { class: "chat", role: "dialog", "aria-label": "Health assistant" }, h("div", { class: "chat-head" }, h("strong", {}, t("assistant.title", "Health assistant")), h("button", { class: "icon-btn", "aria-label": "Close", style: { color: "#fff" }, onclick: () => { open = false; draw(); } }, icon("x", 18))), logEl,
      !log.length ? h("div", { class: "chips-row" }, chips.map(c => h("button", { onclick: () => { input.value = c; send(); } }, c))) : null, h("div", { class: "chat-in" }, input, mic, h("button", { class: "btn primary", onclick: send }, icon("navi", 16))));
    root.append(panel); logEl.scrollTop = logEl.scrollHeight; input.focus();
  };
  draw();
}
