// Multilingual healthcare navigation assistant.
// This assistant provides navigation and general information only.
// It never diagnoses conditions or prescribes medicines.
import { h, icon, clear, haversine, ago } from "./util.js";
import { db } from "./db.js";
import { DISTRICTS, DEPARTMENTS } from "./seed.js";
import { t, lang, speechLang } from "./i18n.js";
import { bedTotals, pharmacyStockFor } from "./services.js";

const RED = /chest pain|can'?t breathe|cannot breathe|difficulty breathing|unconscious|not breathing|stroke|face droop|seizure|heavy bleeding|snake bite|poison|overdose|severe burn|pregnan\w* .*bleed|ఛాతి నొప్పి|శ్వాస|స్పృహ|పాము|విషం|सीने में दर्द|सांस|बेहोश|साँप|ज़हर|நெஞ்சு வலி|மூச்சு|மயக்கம்|பாம்பு|விஷம்/i;

const EMERG = {
  en: "This could be an emergency. Call 108 (ambulance) or 112 now, or go to the nearest emergency department. Do not wait for online approval.",
  te: "ఇది అత్యవసర పరిస్థితి కావచ్చు. వెంటనే 108 (అంబులెన్స్) లేదా 112 కు కాల్ చేయండి లేదా దగ్గరలోని అత్యవసర విభాగానికి వెళ్లండి. ఆన్‌లైన్ ఆమోదం కోసం వేచి ఉండకండి.",
  hi: "यह आपात स्थिति हो सकती है। तुरंत 108 (एम्बुलेंस) या 112 पर कॉल करें या नज़दीकी आपातकालीन विभाग जाएँ। ऑनलाइन मंज़ूरी का इंतज़ार न करें।",
  ta: "இது அவசரநிலையாக இருக்கலாம். உடனே 108 (ஆம்புலன்ஸ்) அல்லது 112 ஐ அழைக்கவும்; அருகிலுள்ள அவசரப் பிரிவுக்குச் செல்லவும். இணைய ஒப்புதலுக்காகக் காத்திருக்க வேண்டாம்."
};

const NODIAG = {
  en: "I can't diagnose conditions or recommend medicines. A qualified doctor needs to assess your situation. I can help you find a suitable department and prepare questions to ask.",
  te: "నేను వ్యాధిని నిర్ధారించలేను లేదా మందులు సూచించలేను. అర్హత కలిగిన వైద్యుడు మీ పరిస్థితిని అంచనా వేయాలి. సరైన విభాగాన్ని కనుగొనడంలో, వైద్యుడిని అడగాల్సిన ప్రశ్నలను సిద్ధం చేయడంలో సహాయం చేయగలను.",
  hi: "मैं रोग का निदान या दवा की सलाह नहीं दे सकता। योग्य डॉक्टर को आपकी स्थिति का आकलन करना होगा। मैं सही विभाग खोजने और डॉक्टर से पूछने के प्रश्न तैयार करने में मदद कर सकता हूँ।",
  ta: "என்னால் நோயைக் கண்டறியவோ மருந்து பரிந்துரைக்கவோ முடியாது. தகுதியான மருத்துவர் உங்கள் நிலையை மதிப்பிட வேண்டும். சரியான பிரிவைக் கண்டறியவும் மருத்துவரிடம் கேட்க வேண்டிய கேள்விகளைத் தயாரிக்கவும் உதவுவேன்."
};

const T = {
  nearby: {
    en: "Facilities I found",
    te: "నాకు దొరికిన కేంద్రాలు",
    hi: "मुझे मिली सुविधाएँ",
    ta: "கிடைத்த மையங்கள்"
  },
  none: {
    en: "I couldn't find a match in the platform. Try a district name or use Find hospitals.",
    te: "ప్లాట్‌ఫారమ్‌లో సరిపోలే వివరాలు దొరకలేదు. జిల్లా పేరు ప్రయత్నించండి లేదా 'ఆసుపత్రులు కనుగొనండి' ఉపయోగించండి.",
    hi: "प्लेटफ़ॉर्म में कोई मेल नहीं मिला। ज़िले का नाम आज़माएँ या 'अस्पताल खोजें' का उपयोग करें।",
    ta: "தளத்தில் பொருத்தமான விவரம் கிடைக்கவில்லை. மாவட்டப் பெயரை முயற்சிக்கவும் அல்லது 'மருத்துவமனை தேடு' பயன்படுத்தவும்."
  },
  help: {
    en: "I can help you find hospitals (try: “ICU in Guntur”), understand appointments and admissions, find camps, tests and reported medicine stock, and prepare questions for your doctor. In an emergency call 108 or 112.",
    te: "ఆసుపత్రులు కనుగొనడం (ఉదా: “Guntur లో ICU”), అపాయింట్‌మెంట్ మరియు అడ్మిషన్ ప్రక్రియ, శిబిరాలు, పరీక్షలు, నివేదించిన మందుల నిల్వ గురించి సహాయం చేస్తాను. అత్యవసరంలో 108 లేదా 112 కు కాల్ చేయండి.",
    hi: "मैं अस्पताल खोजने (जैसे “Guntur में ICU”), अपॉइंटमेंट और भर्ती प्रक्रिया, शिविर, जाँच और बताई गई दवा की उपलब्धता में मदद कर सकता हूँ। आपात स्थिति में 108 या 112 पर कॉल करें।",
    ta: "மருத்துவமனைகளைக் கண்டறிதல் (எ.கா. “Guntur ICU”), சந்திப்பு மற்றும் அனுமதி செயல்முறை, முகாம்கள், பரிசோதனைகள், தெரிவிக்கப்பட்ட மருந்து இருப்பு குறித்து உதவுவேன். அவசரத்தில் 108 அல்லது 112 ஐ அழைக்கவும்."
  }
};

const L = values => values[lang()] || values.en;
const norm = value => String(value || "").toLowerCase().trim();

function findDistrict(text) {
  return DISTRICTS.find(district => {
    const name = norm(district.name);
    const first = name.split(" ")[0].replace(".", "");
    return name.length > 3 && (
      text.includes(name) ||
      text.includes(first)
    );
  });
}

function findDepartment(text) {
  return DEPARTMENTS.find(department => {
    const first = norm(department).split(" ")[0];
    return first.length > 3 && text.includes(first);
  }) || (
    /heart|cardiac|హృదయ|గుండె|हृदय|இதய/.test(text)
      ? "Cardiology"
      : /child|baby|పిల్ల|बच्चे|குழந்தை/.test(text)
        ? "Paediatrics"
        : /pregnan|maternity|delivery|గర్భ|गर्भ|கர்ப்ப/.test(text)
          ? "Obstetrics & Gynaecology"
          : null
  );
}

function prep(department) {
  const questions = [
    "Questions you could ask your doctor:",
    "• What might be causing these symptoms?",
    "• What tests, if any, are needed?",
    "• What treatment options are available?",
    "• What warning signs mean I should seek urgent care?",
    "• When should I schedule a follow-up?"
  ];

  if (department) {
    questions.push("", `A suitable department to start with: ${department}.`);
  }

  return questions.join("\n");
}

function emergencyAnswer() {
  return {
    alert: true,
    text: L(EMERG),
    src: "Emergency safety guidance",
    acts: [
      { label: "Call 108", href: "tel:108" },
      { label: "Call 112", href: "tel:112" }
    ]
  };
}

function campsAnswer(district, user) {
  const camps = db.where(
    "camps",
    camp =>
      camp.status === "published" &&
      (!district || camp.district === district.name)
  ).slice(0, 4);

  return {
    text: camps.length
      ? camps.map(camp =>
          `• ${camp.title} — ${camp.district}, ${camp.date} ${camp.start || ""}`
        ).join("\n")
      : "No upcoming published camps found.",
    src: "Platform data — may include DEMO entries.",
    acts: [
      {
        label: "See camps",
        hash: user ? "#/app/camps" : "#/login"
      }
    ]
  };
}

function medicineAnswer(text) {
  const match = text.match(
    /\b(paracetamol|metformin|amlodipine|ors|cetirizine|atorvastatin|salbutamol|pantoprazole|azithromycin|amoxicillin|iron)\b/
  );

  if (!match) {
    return {
      text: "Tell me the medicine name to check whether a pharmacy has reported it in stock. Stock information must be confirmed directly with the pharmacy.",
      src: "General information"
    };
  }

  const medicine = match[1];
  const results = pharmacyStockFor(medicine).slice(0, 4);

  return {
    text: results.length
      ? results.map(item =>
          `• ${item.org.name} (${item.org.district}) — ${item.stock.qty} reported in stock, updated ${ago(item.stock.updatedAt)}`
        ).join("\n")
      : `No pharmacy on the platform reports ${medicine} in stock.`,
    src: "Pharmacy-reported stock — DEMO data. Call the pharmacy to confirm. Prescription medicines require a valid prescription."
  };
}

function diagnosticsAnswer(district, user) {
  const organisations = db.where(
    "orgs",
    org =>
      (org.kind === "diagnostic" || org.kind === "hospital") &&
      org.tests?.length &&
      (!district || org.district === district.name)
  ).slice(0, 4);

  return {
    text: organisations.length
      ? organisations.map(org =>
          `• ${org.name} (${org.district}) — ${org.tests.length} listed tests`
        ).join("\n")
      : L(T.none),
    src: "Platform data — may include DEMO entries.",
    acts: [
      {
        label: "Tests & scans",
        hash: user ? "#/app/diagnostics" : "#/login"
      }
    ]
  };
}

function appointmentAnswer() {
  return {
    text: [
      "1. Open a hospital and choose a department and doctor.",
      "2. Select a suitable appointment slot and who the visit is for.",
      "3. The hospital reviews and confirms or declines the request.",
      "4. Check your notifications for updates.",
      "",
      "An appointment is only a request until the hospital confirms it."
    ].join("\n"),
    src: "How the platform works",
    acts: [
      { label: "Find hospitals", hash: "#/find" }
    ]
  };
}

function admissionAnswer() {
  return {
    text: [
      "An admission request is sent to the hospital for review.",
      "The hospital may accept it, decline it or ask for more information.",
      "",
      "An admission request is NOT a confirmed bed.",
      "For an emergency, go directly to the nearest emergency department or call 108 or 112. Never wait for online approval."
    ].join("\n"),
    src: "How the platform works",
    acts: [
      { label: "Find hospitals", hash: "#/find" }
    ]
  };
}

function consentAnswer() {
  return {
    text: [
      "The platform is designed so that patients control record sharing.",
      "",
      "In Records → Sharing, a patient can choose which records to share, the purpose and the duration.",
      "Sharing can be revoked.",
      "Record access should be logged and visible to the patient."
    ].join("\n"),
    src: "Platform workflow description"
  };
}

function hospitalAnswer(text, district, department, user) {
  let facilities = db.where(
    "orgs",
    org =>
      org.kind === "hospital" &&
      (org.verification === "verified" || org.demo) &&
      (!district || org.district === district.name) &&
      (!department || org.depts?.includes(department)) &&
      (!/\bicu\b/.test(text) || Boolean(org.beds?.icu)) &&
      (!/emergency|24.?7|24.?hour/.test(text) || org.emergency24x7)
  );

  const userDistrict = user &&
    DISTRICTS.find(item => item.name === user.district);

  if (!district && userDistrict) {
    facilities = facilities
      .map(org => ({
        ...org,
        _distance: haversine(userDistrict, org)
      }))
      .sort((a, b) => a._distance - b._distance);
  }

  facilities = facilities.slice(0, 4);

  if (!facilities.length) {
    return {
      text: L(T.none),
      src: "Platform directory"
    };
  }

  const lines = facilities.map(org => {
    const beds = bedTotals(org);
    const wantsBeds = /bed|icu/.test(text);

    const bedInfo = wantsBeds
      ? ` · beds free ${beds.available} (reported ${ago(beds.updatedAt)})`
      : "";

    const icuInfo = wantsBeds && org.beds?.icu
      ? ` · ICU total ${org.beds.icu.total}`
      : "";

    return `• ${org.name} — ${org.district}${bedInfo}${icuInfo}`;
  });

  return {
    text: `${L(T.nearby)}:\n${lines.join("\n")}`,
    src: "Platform data — provider-reported or DEMO. Call the facility to confirm current services and availability.",
    acts: facilities.slice(0, 2).map(org => ({
      label: org.name.replace("Demo ", "").slice(0, 28),
      hash: user ? `#/app/hospital/${org.id}` : `#/find/${org.id}`
    }))
  };
}

export function answer(question, user) {
  const text = norm(question);

  if (!text) {
    return {
      text: L(T.help),
      src: ""
    };
  }

  if (RED.test(text)) {
    return emergencyAnswer();
  }

  const district = findDistrict(text);
  const department = findDepartment(text);

  if (
    /diagnos|what disease|which medicine|prescribe|dose|dosage|tablet for|medicine for|what.*(have|is wrong)|ఏ మందు|కౌన్ सी दवा|कौन सी दवा|என்ன மருந்து/.test(text) &&
    !/stock|available|pharmacy/.test(text)
  ) {
    return {
      text: `${L(NODIAG)}\n\n${prep(department)}`,
      src: "General information — not medical advice.",
      acts: department
        ? [{ label: `Find ${department}`, hash: "#/find" }]
        : []
    };
  }

  if (/camp|శిబిర|शिविर|முகாம்/.test(text)) {
    return campsAnswer(district, user);
  }

  if (
    /medicine|stock|pharmacy|మందు|दवा|மருந்து/.test(text) &&
    /stock|available|have|pharmacy|ఉన్న|उपलब्ध|இருப்பு/.test(text)
  ) {
    return medicineAnswer(text);
  }

  if (/test|scan|x-?ray|mri|ct |ultrasound|blood|పరీక్ష|जाँच|பரிசோதனை/.test(text)) {
    return diagnosticsAnswer(district, user);
  }

  if (/appointment|book|అపాయింట్|अपॉइंट|சந்திப்/.test(text)) {
    return appointmentAnswer();
  }

  if (
    /admission|admit|bed|ఆసుపత్రిలో చేర|भर्ती|அனுமதி/.test(text) &&
    !department &&
    !/icu|available/.test(text)
  ) {
    return admissionAnswer();
  }

  if (/consent|share|record|access|రికార్డ్|रिकॉर्ड|பதிவு/.test(text)) {
    return consentAnswer();
  }

  if (
    /hospital|icu|bed|emergency|doctor|clinic|phc|chc|ఆసుపత్రి|अस्पताल|மருத்துவமனை|near/.test(text) ||
    district ||
    department
  ) {
    return hospitalAnswer(text, district, department, user);
  }

  return {
    text: L(T.help),
    src: ""
  };
}

export function mountAssistant(getUser) {
  document.getElementById("assistant-root")?.remove();

  const root = h("div", { id: "assistant-root" });
  document.body.append(root);

  let open = false;
  let log = [];

  const speak = text => {
    if (!("speechSynthesis" in window)) return;

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLang();

    speechSynthesis.speak(utterance);
  };

  const draw = () => {
    clear(root);

    if (!open) {
      root.append(
        h("button", {
          class: "fab",
          "aria-label": t("assistant.title", "Health assistant"),
          onclick: () => {
            open = true;
            draw();
          }
        },
          icon("chat", 20),
          t("assistant.title", "Health assistant")
        )
      );

      return;
    }

    const logEl = h(
      "div",
      {
        class: "chat-log",
        "aria-live": "polite"
      },
      !log.length
        ? h(
            "div",
            { class: "msg a" },
            L(T.help),
            h(
              "span",
              { class: "src" },
              "Not medical advice. Platform information may contain DEMO data."
            )
          )
        : null,

      log.map(message =>
        h(
          "div",
          {
            class:
              "msg " +
              (message.u ? "u" : "a") +
              (message.alert ? " alert" : "")
          },
          message.text,

          message.src
            ? h("span", { class: "src" }, message.src)
            : null,

          message.acts?.length
            ? h(
                "div",
                { class: "acts" },
                message.acts.map(action =>
                  h(
                    "a",
                    {
                      class: "btn sm",
                      href: action.href || action.hash
                    },
                    action.label
                  )
                )
              )
            : null,

          !message.u
            ? h(
                "button",
                {
                  class: "btn sm ghost",
                  "aria-label": "Read aloud",
                  onclick: () => speak(message.text)
                },
                icon("speaker", 14)
              )
            : null
        )
      )
    );

    const input = h("input", {
      type: "text",
      placeholder: t("assistant.placeholder", "Ask here…"),
      "aria-label": "Message",
      onkeydown: event => {
        if (event.key === "Enter") send();
      }
    });

    const send = () => {
      const question = input.value.trim();

      if (!question) return;

      log.push({
        u: true,
        text: question
      });

      const response = answer(question, getUser());
      log.push(response);

      if (response.alert) {
        speak(response.text);
      }

      draw();
    };

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    const mic = SpeechRecognition
      ? h(
          "button",
          {
            class: "icon-btn",
            "aria-label": "Speak",
            onclick: () => {
              const recognition = new SpeechRecognition();

              recognition.lang = speechLang();

              recognition.onresult = event => {
                input.value = event.results[0][0].transcript;
                send();
              };

              recognition.onerror = () => {
                input.placeholder = "Voice input unavailable. Type your message.";
              };

              recognition.start();
            }
          },
          icon("mic", 18)
        )
      : null;

    const suggestions = [
      "ICU beds in Guntur",
      "Heart hospital in Visakhapatnam",
      "Medical camps",
      "Is paracetamol in stock?",
      "How do I request admission?"
    ];

    const panel = h(
      "div",
      {
        class: "chat",
        role: "dialog",
        "aria-label": "Health assistant",
        "aria-modal": "false"
      },

      h(
        "div",
        { class: "chat-head" },
        h("strong", {}, t("assistant.title", "Health assistant")),
        h(
          "button",
          {
            class: "icon-btn",
            "aria-label": "Close",
            style: { color: "#fff" },
            onclick: () => {
              open = false;
              draw();
            }
          },
          icon("x", 18)
        )
      ),

      logEl,

      !log.length
        ? h(
            "div",
            { class: "chips-row" },
            suggestions.map(suggestion =>
              h(
                "button",
                {
                  onclick: () => {
                    input.value = suggestion;
                    send();
                  }
                },
                suggestion
              )
            )
          )
        : null,

      h(
        "div",
        { class: "chat-in" },
        input,
        mic,
        h(
          "button",
          {
            class: "btn primary",
            onclick: send,
            "aria-label": "Send message"
          },
          icon("navi", 16)
        )
      )
    );

    root.append(panel);

    logEl.scrollTop = logEl.scrollHeight;
    input.focus();
  };

  draw();
}
