// Translation layer. t(key, englishFallback). Views register their own strings with registerStrings().
// Telugu / Hindi / Tamil strings are first-pass drafts and MUST be reviewed by native-speaking health communicators.
export const LANGS = [["en", "English", "en-IN"], ["te", "తెలుగు", "te-IN"], ["hi", "हिन्दी", "hi-IN"], ["ta", "தமிழ்", "ta-IN"]];
const dict = {};
let cur = "en";
try { cur = localStorage.getItem("swasthya.lang") || ((navigator.language || "en").slice(0, 2)); } catch { /* ignore */ }
if (!LANGS.some(l => l[0] === cur)) cur = "en";
export const lang = () => cur;
export const speechLang = () => LANGS.find(l => l[0] === cur)[2];
export function setLang(l) { cur = l; try { localStorage.setItem("swasthya.lang", l); } catch { /* ignore */ } document.documentElement.lang = l; window.dispatchEvent(new Event("langchange")); }
export function t(key, fb) { const e = dict[key]; return (e && e[cur]) || fb || (e && e.en) || key; }
export function registerStrings(obj) { for (const [k, v] of Object.entries(obj)) dict[k] = { ...(dict[k] || {}), ...v }; }

registerStrings({
  "nav.home": { te: "హోమ్", hi: "होम", ta: "முகப்பு" }, "nav.find": { te: "ఆసుపత్రులు కనుగొనండి", hi: "अस्पताल खोजें", ta: "மருத்துவமனை தேடு" },
  "nav.appointments": { te: "అపాయింట్‌మెంట్లు", hi: "अपॉइंटमेंट", ta: "சந்திப்புகள்" }, "nav.admissions": { te: "అడ్మిషన్ అభ్యర్థనలు", hi: "भर्ती अनुरोध", ta: "அனுமதி கோரிக்கைகள்" },
  "nav.diagnostics": { te: "పరీక్షలు & స్కాన్లు", hi: "जाँच व स्कैन", ta: "பரிசோதனைகள்" }, "nav.records": { te: "నా ఆరోగ్య రికార్డులు", hi: "मेरे स्वास्थ्य रिकॉर्ड", ta: "என் மருத்துவ பதிவுகள்" },
  "nav.family": { te: "కుటుంబం", hi: "परिवार", ta: "குடும்பம்" }, "nav.medicines": { te: "మందులు", hi: "दवाइयाँ", ta: "மருந்துகள்" }, "nav.camps": { te: "వైద్య శిబిరాలు", hi: "चिकित्सा शिविर", ta: "மருத்துவ முகாம்கள்" },
  "nav.emergency": { te: "అత్యవసరం", hi: "आपातकाल", ta: "அவசரம்" }, "nav.notifications": { te: "నోటిఫికేషన్లు", hi: "सूचनाएँ", ta: "அறிவிப்புகள்" }, "nav.settings": { te: "సెట్టింగ్‌లు", hi: "सेटिंग्स", ta: "அமைப்புகள்" },
  "nav.schedule": { te: "షెడ్యూల్", hi: "कार्यक्रम", ta: "அட்டவணை" }, "nav.patients": { te: "రోగులు", hi: "मरीज़", ta: "நோயாளிகள்" }, "nav.overview": { te: "సారాంశం", hi: "अवलोकन", ta: "கண்ணோட்டம்" },
  "nav.beds": { te: "పడకలు", hi: "बिस्तर", ta: "படுக்கைகள்" }, "nav.doctors": { te: "వైద్యులు", hi: "डॉक्टर", ta: "மருத்துவர்கள்" }, "nav.analytics": { te: "విశ్లేషణలు", hi: "विश्लेषण", ta: "பகுப்பாய்வு" },
  "nav.households": { te: "కుటుంబాలు", hi: "परिवार सूची", ta: "குடும்பங்கள்" }, "nav.followups": { te: "ఫాలో-అప్‌లు", hi: "फॉलो-अप", ta: "தொடர் பணிகள்" }, "nav.referrals": { te: "రిఫరల్స్", hi: "रेफरल", ta: "பரிந்துரைகள்" },
  "nav.stock": { te: "స్టాక్", hi: "स्टॉक", ta: "இருப்பு" }, "nav.users": { te: "వినియోగదారులు", hi: "उपयोगकर्ता", ta: "பயனர்கள்" }, "nav.audit": { te: "ఆడిట్ లాగ్", hi: "ऑडिट लॉग", ta: "தணிக்கைப் பதிவு" },
  "common.save": { te: "సేవ్ చేయండి", hi: "सहेजें", ta: "சேமி" }, "common.cancel": { te: "రద్దు", hi: "रद्द करें", ta: "ரத்து" }, "common.search": { te: "వెతకండి", hi: "खोजें", ta: "தேடு" },
  "common.book": { te: "అపాయింట్‌మెంట్ బుక్ చేయండి", hi: "अपॉइंटमेंट बुक करें", ta: "சந்திப்பை பதிவு செய்" }, "common.view": { te: "చూడండి", hi: "देखें", ta: "பார்" }, "common.confirm": { te: "నిర్ధారించండి", hi: "पुष्टि करें", ta: "உறுதி செய்" },
  "common.reject": { te: "తిరస్కరించండి", hi: "अस्वीकार करें", ta: "நிராகரி" }, "common.signin": { te: "సైన్ ఇన్", hi: "साइन इन", ta: "உள்நுழை" }, "common.signout": { te: "సైన్ అవుట్", hi: "साइन आउट", ta: "வெளியேறு" },
  "common.register": { te: "నమోదు చేసుకోండి", hi: "पंजीकरण करें", ta: "பதிவு செய்" }, "common.email": { te: "ఇమెయిల్", hi: "ईमेल", ta: "மின்னஞ்சல்" }, "common.password": { te: "పాస్‌వర్డ్", hi: "पासवर्ड", ta: "கடவுச்சொல்" },
  "common.district": { te: "జిల్లా", hi: "ज़िला", ta: "மாவட்டம்" }, "common.all": { te: "అన్నీ", hi: "सभी", ta: "அனைத்தும்" }, "common.directions": { te: "దారి చూపండి", hi: "रास्ता देखें", ta: "வழி காட்டு" }, "common.call": { te: "కాల్ చేయండి", hi: "कॉल करें", ta: "அழை" },
  "common.nearMe": { te: "నా దగ్గర", hi: "मेरे पास", ta: "என் அருகில்" }, "common.cancelAppt": { te: "రద్దు చేయండి", hi: "रद्द करें", ta: "ரத்து செய்" }, "common.submit": { te: "సమర్పించండి", hi: "जमा करें", ta: "சமர்ப்பி" },
  "status.requested": { te: "అభ్యర్థించారు", hi: "अनुरोध किया", ta: "கோரப்பட்டது" }, "status.confirmed": { te: "నిర్ధారించబడింది", hi: "पुष्टि हो गई", ta: "உறுதியானது" }, "status.rejected": { te: "అంగీకరించలేదు", hi: "स्वीकार नहीं", ta: "ஏற்கப்படவில்லை" },
  "status.cancelled": { te: "రద్దు చేశారు", hi: "रद्द", ta: "ரத்தானது" }, "status.completed": { te: "పూర్తయింది", hi: "पूर्ण", ta: "முடிந்தது" }, "status.submitted": { te: "సమర్పించారు", hi: "जमा किया", ta: "சமர்ப்பிக்கப்பட்டது" },
  "status.under_review": { te: "పరిశీలనలో ఉంది", hi: "समीक्षाधीन", ta: "மதிப்பாய்வில்" }, "status.accepted": { te: "అంగీకరించారు", hi: "स्वीकृत", ta: "ஏற்கப்பட்டது" }, "status.report_ready": { te: "రిపోర్ట్ సిద్ధం", hi: "रिपोर्ट तैयार", ta: "அறிக்கை தயார்" },
  "prov.demo": { te: "డెమో డేటా", hi: "डेमो डेटा", ta: "டெமோ தரவு" }, "prov.provider": { te: "ఆసుపత్రి నివేదించింది", hi: "सुविधा द्वारा रिपोर्ट", ta: "மருத்துவமனை தெரிவித்தது" }, "prov.public": { te: "పబ్లిక్ డైరెక్టరీ", hi: "सार्वजनिक निर्देशिका", ta: "பொது அடைவு" },
  "prov.outdated": { te: "పాత సమాచారం", hi: "पुरानी जानकारी", ta: "பழைய தகவல்" }, "prov.verified": { te: "ధృవీకరించిన లైవ్ డేటా", hi: "सत्यापित लाइव डेटा", ta: "சரிபார்க்கப்பட்ட நேரடி தரவு" }, "prov.unverified": { te: "ధృవీకరించలేదు", hi: "असत्यापित", ta: "சரிபார்க்கப்படவில்லை" },
  "hero.title": { en: "Find the right care, close to home.", te: "మీ దగ్గరలోనే సరైన వైద్యం.", hi: "घर के पास सही इलाज खोजें।", ta: "வீட்டருகே சரியான சிகிச்சை." },
  "hero.sub": { en: "Hospitals, doctors, tests, pharmacies, camps and ambulances across Andhra Pradesh — one connected place.", te: "ఆంధ్రప్రదేశ్ అంతటా ఆసుపత్రులు, వైద్యులు, పరీక్షలు, మందుల షాపులు, శిబిరాలు, అంబులెన్స్‌లు — ఒకే చోట.", hi: "आंध्र प्रदेश भर के अस्पताल, डॉक्टर, जाँच, दवा दुकानें, शिविर और एम्बुलेंस — एक ही जगह।", ta: "ஆந்திரா முழுவதும் மருத்துவமனைகள், மருத்துவர்கள், பரிசோதனைகள், மருந்தகங்கள், முகாம்கள், ஆம்புலன்ஸ் — ஒரே இடத்தில்." },
  "emerg.banner": { en: "In an emergency call 108 (ambulance) or 112 now. Do not wait for online approval.", te: "అత్యవసరంలో వెంటనే 108 (అంబులెన్స్) లేదా 112 కు కాల్ చేయండి. ఆన్‌లైన్ ఆమోదం కోసం వేచి ఉండకండి.", hi: "आपात स्थिति में तुरंत 108 (एम्बुलेंस) या 112 पर कॉल करें। ऑनलाइन मंज़ूरी का इंतज़ार न करें।", ta: "அவசரத்தில் உடனே 108 (ஆம்புலன்ஸ்) அல்லது 112 ஐ அழைக்கவும். இணைய ஒப்புதலுக்குக் காத்திருக்க வேண்டாம்." },
  "assistant.title": { te: "ఆరోగ్య సహాయకుడు", hi: "स्वास्थ्य सहायक", ta: "சுகாதார உதவியாளர்" }, "assistant.placeholder": { te: "ఇక్కడ అడగండి…", hi: "यहाँ पूछें…", ta: "இங்கே கேளுங்கள்…" },
});
document.documentElement.lang = cur;
