// Interface language: English, French, Arabic (right-to-left).
// Scope: the header, navigation, the crew dashboard headings and the Earth-mode
// heat card. Clinical text — alerts, advice and triage steps — stays in English
// until a clinician has reviewed a translation; a wrong word there could hurt.

export type Lang = "en" | "fr" | "ar";
export const LANGS: { id: Lang; label: string; dir: "ltr" | "rtl" }[] = [
  { id: "en", label: "English", dir: "ltr" },
  { id: "fr", label: "Français", dir: "ltr" },
  { id: "ar", label: "العربية", dir: "rtl" },
];
export const LANG_COOKIE = "hygieia_lang";

const en = {
  "nav.crew": "Crew",
  "nav.weather": "Space weather",
  "nav.kb": "Knowledge",
  "nav.sources": "Sources",
  "nav.about": "About",
  "role.astronaut": "Astronaut",
  "role.houston": "Houston",
  "role.worker": "Health worker",
  "role.doctor": "Remote doctor",
  "header.crewMember": "Crew member…",
  "crew.all": "All crew",
  "header.day": "Day",
  "header.delay": "delay",
  "header.inTransit": "in transit",
  "header.ask": "Ask",
  "header.emergency": "Emergency",
  "header.offline": "Offline — onboard functions work",
  "header.language": "Language",
  "footer.named": "named after the Greek goddess of health. Built by team Jovian Elites for NASA Space Apps 2026.",
  "footer.data": "Synthetic crew data, real environment data where stated.",
  "footer.notValidated": "Not medically validated.",
  "crew.title": "Crew · Day",
  "crew.tasks": "Upcoming tasks",
  "crew.alerts": "Alerts today",
  "crew.cabin": "Cabin environment",
  "crew.goals": "Team goals",
  "crew.link": "Link with Earth",
  "crew.readiness": "readiness / 100",
  "heat.title": "Outdoor heat today",
  "heat.index": "Heat index",
  "heat.air": "Air temperature (daily maximum)",
  "heat.humidity": "Relative humidity",
  "heat.last": "Last 14 days",
  "note.clinical": "Alerts, advice and emergency steps are shown in English until a clinician has reviewed the translation.",
  "status.green": "Green",
  "status.amber": "Amber",
  "status.red": "Red",
};

export type Key = keyof typeof en;

const fr: Record<Key, string> = {
  "nav.crew": "Équipage",
  "nav.weather": "Météo spatiale",
  "nav.kb": "Connaissances",
  "nav.sources": "Sources",
  "nav.about": "À propos",
  "role.astronaut": "Astronaute",
  "role.houston": "Houston",
  "role.worker": "Agent de santé",
  "role.doctor": "Médecin à distance",
  "header.crewMember": "Membre d'équipage…",
  "crew.all": "Tout l'équipage",
  "header.day": "Jour",
  "header.delay": "de délai",
  "header.inTransit": "en transit",
  "header.ask": "Demander",
  "header.emergency": "Urgence",
  "header.offline": "Hors ligne — les fonctions de bord marchent",
  "header.language": "Langue",
  "footer.named": "du nom de la déesse grecque de la santé. Conçu par l'équipe Jovian Elites pour NASA Space Apps 2026.",
  "footer.data": "Données d'équipage synthétiques, données d'environnement réelles là où c'est indiqué.",
  "footer.notValidated": "Non validé médicalement.",
  "crew.title": "Équipage — Jour",
  "crew.tasks": "Tâches à venir : feu vert ou non",
  "crew.alerts": "Alertes du jour",
  "crew.cabin": "Environnement de la cabine",
  "crew.goals": "Objectifs d'équipe",
  "crew.link": "Liaison avec la Terre",
  "crew.readiness": "aptitude / 100",
  "heat.title": "Chaleur extérieure aujourd'hui",
  "heat.index": "Indice de chaleur",
  "heat.air": "Température de l'air (maximum du jour)",
  "heat.humidity": "Humidité relative",
  "heat.last": "14 derniers jours",
  "note.clinical": "Les alertes, les conseils et les étapes d'urgence restent en anglais tant qu'un clinicien n'a pas relu la traduction.",
  "status.green": "Vert",
  "status.amber": "Orange",
  "status.red": "Rouge",
};

const ar: Record<Key, string> = {
  "nav.crew": "الطاقم",
  "nav.weather": "طقس الفضاء",
  "nav.kb": "المعرفة",
  "nav.sources": "المصادر",
  "nav.about": "حول",
  "role.astronaut": "رائد فضاء",
  "role.houston": "هيوستن",
  "role.worker": "عامل صحي",
  "role.doctor": "طبيب عن بُعد",
  "header.crewMember": "عضو الطاقم…",
  "crew.all": "كل الطاقم",
  "header.day": "اليوم",
  "header.delay": "تأخير",
  "header.inTransit": "في الطريق",
  "header.ask": "اسأل",
  "header.emergency": "طوارئ",
  "header.offline": "غير متصل — وظائف المركبة تعمل",
  "header.language": "اللغة",
  "footer.named": "سُمّي على اسم إلهة الصحة عند الإغريق. من إعداد فريق Jovian Elites في NASA Space Apps 2026.",
  "footer.data": "بيانات الطاقم اصطناعية، وبيانات البيئة حقيقية حيث يُذكر ذلك.",
  "footer.notValidated": "غير معتمد طبياً.",
  "crew.title": "الطاقم — اليوم",
  "crew.tasks": "المهام القادمة: جاهز أو غير جاهز",
  "crew.alerts": "تنبيهات اليوم",
  "crew.cabin": "بيئة المقصورة",
  "crew.goals": "أهداف الفريق",
  "crew.link": "الاتصال بالأرض",
  "crew.readiness": "الجاهزية / 100",
  "heat.title": "الحرارة في الخارج اليوم",
  "heat.index": "مؤشر الحرارة",
  "heat.air": "حرارة الهواء (القصوى اليومية)",
  "heat.humidity": "الرطوبة النسبية",
  "heat.last": "آخر 14 يوماً",
  "note.clinical": "تبقى التنبيهات والنصائح وخطوات الطوارئ بالإنجليزية إلى أن يراجع طبيب الترجمة.",
  "status.green": "أخضر",
  "status.amber": "برتقالي",
  "status.red": "أحمر",
};

export const DICT: Record<Lang, Record<Key, string>> = { en, fr, ar };

export function asLang(value: string | undefined | null): Lang {
  return value === "fr" || value === "ar" ? value : "en";
}

export function translator(lang: Lang): (key: Key) => string {
  return (key) => DICT[lang][key] ?? en[key];
}

export function dirOf(lang: Lang): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}
