// Translation layer.
// Views register their own strings with registerStrings().
// Telugu, Hindi and Tamil translations are first-pass drafts and should be
// reviewed by native-speaking healthcare communicators.

export const LANGS = [
  ["en", "English", "en-IN"],
  ["te", "తెలుగు", "te-IN"],
  ["hi", "हिन्दी", "hi-IN"],
  ["ta", "தமிழ்", "ta-IN"]
];

const dict = {};
let cur = "en";

try {
  const saved = localStorage.getItem("swasthya.lang");
  const browser = (navigator.language || "en").slice(0, 2);
  const preferred = saved || browser;

  if (LANGS.some(language => language[0] === preferred)) {
    cur = preferred;
  }
} catch {
  // Use English when browser storage is unavailable.
}

export const lang = () => cur;

export const speechLang = () =>
  LANGS.find(language => language[0] === cur)?.[2] || "en-IN";

export function setLang(language) {
  if (!LANGS.some(item => item[0] === language)) {
    return false;
  }

  cur = language;

  try {
    localStorage.setItem("swasthya.lang", language);
  } catch {
    // Language still changes for the current session.
  }

  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("langchange"));
  }

  return true;
}

export function t(key, fallback) {
  const entry = dict[key];

  return (
    entry?.[cur] ||
    fallback ||
    entry?.en ||
    key
  );
}

export function registerStrings(strings) {
  if (!strings || typeof strings !== "object") return;

  for (const [key, translations] of Object.entries(strings)) {
    if (
      !translations ||
      typeof translations !== "object" ||
      Array.isArray(translations)
    ) {
      continue;
    }

    dict[key] = {
      ...(dict[key] || {}),
      ...translations
    };
  }
}

registerStrings({
  "nav.home": {
    en: "Home",
    te: "హోమ్",
    hi: "होम",
    ta: "முகப்பு"
  },
  "nav.find": {
    en: "Find hospitals",
    te: "ఆసుపత్రులు కనుగొనండి",
    hi: "अस्पताल खोजें",
    ta: "மருத்துவமனை தேடு"
  },
  "nav.appointments": {
    en: "Appointments",
    te: "అపాయింట్‌మెంట్లు",
    hi: "अपॉइंटमेंट",
    ta: "சந்திப்புகள்"
  },
  "nav.admissions": {
    en: "Admission requests",
    te: "అడ్మిషన్ అభ్యర్థనలు",
    hi: "भर्ती अनुरोध",
    ta: "அனுமதி கோரிக்கைகள்"
  },
  "nav.diagnostics": {
    en: "Tests & scans",
    te: "పరీక్షలు & స్కాన్లు",
    hi: "जाँच व स्कैन",
    ta: "பரிசோதனைகள்"
  },
  "nav.records": {
    en: "My health records",
    te: "నా ఆరోగ్య రికార్డులు",
    hi: "मेरे स्वास्थ्य रिकॉर्ड",
    ta: "என் மருத்துவ பதிவுகள்"
  },
  "nav.family": {
    en: "Family",
    te: "కుటుంబం",
    hi: "परिवार",
    ta: "குடும்பம்"
  },
  "nav.medicines": {
    en: "Medicines",
    te: "మందులు",
    hi: "दवाइयाँ",
    ta: "மருந்துகள்"
  },
  "nav.camps": {
    en: "Medical camps",
    te: "వైద్య శిబిరాలు",
    hi: "चिकित्सा शिविर",
    ta: "மருத்துவ முகாம்கள்"
  },
  "nav.emergency": {
    en: "Emergency",
    te: "అత్యవసరం",
    hi: "आपातकाल",
    ta: "அவசரம்"
  },
  "nav.notifications": {
    en: "Notifications",
    te: "నోటిఫికేషన్లు",
    hi: "सूचनाएँ",
    ta: "அறிவிப்புகள்"
  },
  "nav.settings": {
    en: "Settings",
    te: "సెట్టింగ్‌లు",
    hi: "सेटिंग्स",
    ta: "அமைப்புகள்"
  },
  "nav.schedule": {
    en: "Schedule",
    te: "షెడ్యూల్",
    hi: "कार्यक्रम",
    ta: "அட்டவணை"
  },
  "nav.patients": {
    en: "Patients",
    te: "రోగులు",
    hi: "मरीज़",
    ta: "நோயாளிகள்"
  },
  "nav.overview": {
    en: "Overview",
    te: "సారాంశం",
    hi: "अवलोकन",
    ta: "கண்ணோட்டம்"
  },
  "nav.beds": {
    en: "Beds",
    te: "పడకలు",
    hi: "बिस्तर",
    ta: "படுக்கைகள்"
  },
  "nav.doctors": {
    en: "Doctors",
    te: "వైద్యులు",
    hi: "डॉक्टर",
    ta: "மருத்துவர்கள்"
  },
  "nav.analytics": {
    en: "Analytics",
    te: "విశ్లేషణలు",
    hi: "विश्लेषण",
    ta: "பகுப்பாய்வு"
  },
  "nav.households": {
    en: "Households",
    te: "కుటుంబాలు",
    hi: "परिवार सूची",
    ta: "குடும்பங்கள்"
  },
  "nav.followups": {
    en: "Follow-ups",
    te: "ఫాలో-అప్‌లు",
    hi: "फॉलो-अप",
    ta: "தொடர் பணிகள்"
  },
  "nav.referrals": {
    en: "Referrals",
    te: "రిఫరల్స్",
    hi: "रेफरल",
    ta: "பரிந்துரைகள்"
  },
  "nav.stock": {
    en: "Stock",
    te: "స్టాక్",
    hi: "स्टॉक",
    ta: "இருப்பு"
  },
  "nav.users": {
    en: "Users",
    te: "వినియోగదారులు",
    hi: "उपयोगकर्ता",
    ta: "பயனர்கள்"
  },
  "nav.audit": {
    en: "Audit log",
    te: "ఆడిట్ లాగ్",
    hi: "ऑडिट लॉग",
    ta: "தணிக்கைப் பதிவு"
  },

  "common.save": {
    en: "Save",
    te: "సేవ్ చేయండి",
    hi: "सहेजें",
    ta: "சேமி"
  },
  "common.cancel": {
    en: "Cancel",
    te: "రద్దు",
    hi: "रद्द करें",
    ta: "ரத்து"
  },
  "common.search": {
    en: "Search",
    te: "వెతకండి",
    hi: "खोजें",
    ta: "தேடு"
  },
  "common.book": {
    en: "Book appointment",
    te: "అపాయింట్‌మెంట్ బుక్ చేయండి",
    hi: "अपॉइंटमेंट बुक करें",
    ta: "சந்திப்பை பதிவு செய்"
  },
  "common.view": {
    en: "View",
    te: "చూడండి",
    hi: "देखें",
    ta: "பார்"
  },
  "common.confirm": {
    en: "Confirm",
    te: "నిర్ధారించండి",
    hi: "पुष्टि करें",
    ta: "உறுதி செய்"
  },
  "common.reject": {
    en: "Reject",
    te: "తిరస్కరించండి",
    hi: "अस्वीकार करें",
    ta: "நிராகரி"
  },
  "common.signin": {
    en: "Sign in",
    te: "సైన్ ఇన్",
    hi: "साइन इन",
    ta: "உள்நுழை"
  },
  "common.signout": {
    en: "Sign out",
    te: "సైన్ అవుట్",
    hi: "साइन आउट",
    ta: "வெளியேறு"
  },
  "common.register": {
    en: "Register",
    te: "నమోదు చేసుకోండి",
    hi: "पंजीकरण करें",
    ta: "பதிவு செய்"
  },
  "common.email": {
    en: "Email",
    te: "ఇమెయిల్",
    hi: "ईमेल",
    ta: "மின்னஞ்சல்"
  },
  "common.password": {
    en: "Password",
    te: "పాస్‌వర్డ్",
    hi: "पासवर्ड",
    ta: "கடவுச்சொல்"
  },
  "common.district": {
    en: "District",
    te: "జిల్లా",
    hi: "ज़िला",
    ta: "மாவட்டம்"
  },
  "common.all": {
    en: "All",
    te: "అన్నీ",
    hi: "सभी",
    ta: "அனைத்தும்"
  },
  "common.directions": {
    en: "Get directions",
    te: "దారి చూపండి",
    hi: "रास्ता देखें",
    ta: "வழி காட்டு"
  },
  "common.call": {
    en: "Call",
    te: "కాల్ చేయండి",
    hi: "कॉल करें",
    ta: "அழை"
  },
  "common.nearMe": {
    en: "Near me",
    te: "నా దగ్గర",
    hi: "मेरे पास",
    ta: "என் அருகில்"
  },
  "common.cancelAppt": {
    en: "Cancel appointment",
    te: "రద్దు చేయండి",
    hi: "रद्द करें",
    ta: "ரத்து செய்"
  },
  "common.submit": {
    en: "Submit",
    te: "సమర్పించండి",
    hi: "जमा करें",
    ta: "சமர்ப்பி"
  },

  "status.requested": {
    en: "Requested",
    te: "అభ్యర్థించారు",
    hi: "अनुरोध किया",
    ta: "கோரப்பட்டது"
  },
  "status.confirmed": {
    en: "Confirmed",
    te: "నిర్ధారించబడింది",
    hi: "पुष्टि हो गई",
    ta: "உறுதியானது"
  },
  "status.rejected": {
    en: "Rejected",
    te: "అంగీకరించలేదు",
    hi: "स्वीकार नहीं",
    ta: "ஏற்கப்படவில்லை"
  },
  "status.cancelled": {
    en: "Cancelled",
    te: "రద్దు చేశారు",
    hi: "रद्द",
    ta: "ரத்தானது"
  },
  "status.completed": {
    en: "Completed",
    te: "పూర్తయింది",
    hi: "पूर्ण",
    ta: "முடிந்தது"
  },
  "status.submitted": {
    en: "Submitted",
    te: "సమర్పించారు",
    hi: "जमा किया",
    ta: "சமர்ப்பிக்கப்பட்டது"
  },
  "status.under_review": {
    en: "Under review",
    te: "పరిశీలనలో ఉంది",
    hi: "समीक्षाधीन",
    ta: "மதிப்பாய்வில்"
  },
  "status.accepted": {
    en: "Accepted",
    te: "అంగీకరించారు",
    hi: "स्वीकृत",
    ta: "ஏற்கப்பட்டது"
  },
  "status.report_ready": {
    en: "Report ready",
    te: "రిపోర్ట్ సిద్ధం",
    hi: "रिपोर्ट तैयार",
    ta: "அறிக்கை தயார்"
  },

  "prov.demo": {
    en: "Demo data",
    te: "డెమో డేటా",
    hi: "डेमो डेटा",
    ta: "டெமோ தரவு"
  },
  "prov.provider": {
    en: "Provider reported",
    te: "ఆసుపత్రి నివేదించింది",
    hi: "सुविधा द्वारा रिपोर्ट",
    ta: "மருத்துவமனை தெரிவித்தது"
  },
  "prov.public": {
    en: "Public directory",
    te: "పబ్లిక్ డైరెక్టరీ",
    hi: "सार्वजनिक निर्देशिका",
    ta: "பொது அடைவு"
  },
  "prov.outdated": {
    en: "Outdated information",
    te: "పాత సమాచారం",
    hi: "पुरानी जानकारी",
    ta: "பழைய தகவல்"
  },
  "prov.verified": {
    en: "Verified live data",
    te: "ధృవీకరించిన లైవ్ డేటా",
    hi: "सत्यापित लाइव डेटा",
    ta: "சரிபார்க்கப்பட்ட நேரடி தரவு"
  },
  "prov.unverified": {
    en: "Unverified",
    te: "ధృవీకరించలేదు",
    hi: "असत्यापित",
    ta: "சரிபார்க்கப்படவில்லை"
  },

  "hero.title": {
    en: "Find the right care, close to home.",
    te: "మీ దగ్గరలోనే సరైన వైద్యం.",
    hi: "घर के पास सही इलाज खोजें।",
    ta: "வீட்டருகே சரியான சிகிச்சை."
  },
  "hero.sub": {
    en: "Hospitals, doctors, tests, pharmacies, camps and ambulances across Andhra Pradesh — one connected place.",
    te: "ఆంధ్రప్రదేశ్ అంతటా ఆసుపత్రులు, వైద్యులు, పరీక్షలు, మందుల షాపులు, శిబిరాలు, అంబులెన్స్‌లు — ఒకే చోట.",
    hi: "आंध्र प्रदेश भर के अस्पताल, डॉक्टर, जाँच, दवा दुकानें, शिविर और एम्बुलेंस — एक ही जगह।",
    ta: "ஆந்திரா முழுவதும் மருத்துவமனைகள், மருத்துவர்கள், பரிசோதனைகள், மருந்தகங்கள், முகாம்கள், ஆம்புலன்ஸ் — ஒரே இடத்தில்."
  },
  "emerg.banner": {
    en: "In an emergency call 108 (ambulance) or 112 now. Do not wait for online approval.",
    te: "అత్యవసరంలో వెంటనే 108 (అంబులెన్స్) లేదా 112 కు కాల్ చేయండి. ఆన్‌లైన్ ఆమోదం కోసం వేచి ఉండకండి.",
    hi: "आपात स्थिति में तुरंत 108 (एम्बुलेंस) या 112 पर कॉल करें। ऑनलाइन मंज़ूरी का इंतज़ार न करें।",
    ta: "அவசரத்தில் உடனே 108 (ஆம்புலன்ஸ்) அல்லது 112 ஐ அழைக்கவும். இணைய ஒப்புதலுக்குக் காத்திருக்க வேண்டாம்."
  },
  "assistant.title": {
    en: "Health assistant",
    te: "ఆరోగ్య సహాయకుడు",
    hi: "स्वास्थ्य सहायक",
    ta: "சுகாதார உதவியாளர்"
  },
  "assistant.placeholder": {
    en: "Ask here…",
    te: "ఇక్కడ అడగండి…",
    hi: "यहाँ पूछें…",
    ta: "இங்கே கேளுங்கள்…"
  }
});

if (typeof document !== "undefined") {
  document.documentElement.lang = cur;
}
