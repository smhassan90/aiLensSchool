import type { TeachingHelpOutput } from '../ai/schemas/teaching-help.schema';
import { themeShortLabel } from './classroom-activity-styles';

export type TeachingHelpUrduGuide = {
  teachingOverview: string;
  boardParts: string[];
  openingLine: string;
  partExamples: string[];
  steps: string[];
  warmUp: string;
  recap: string;
  studentWorkTemplate: string;
  checkQuestion: string;
  expectedAnswer: string;
  exitTicket: string;
  support?: string;
  stretch?: string;
};

function isPartExample(line: string): boolean {
  return /^Part\s+\d+/i.test(line.trim());
}

/** Simple Urdu guide for teachers (classroom Urdu, clear steps). */
export function buildUrduTeachingGuide(help: TeachingHelpOutput): TeachingHelpUrduGuide {
  const isRecap = help.classroomDelivery.activity?.title === 'Chapter recap';
  const boardParts = help.sourceAndConfidence.sourceSupportedClaims.slice(0, 5).map((p) => themeShortLabel(p));
  const partExamples = help.teacherExplanation.examples.filter(isPartExample);
  const partCount = Math.max(boardParts.length, partExamples.length, 3);

  const studentWorkTemplate = isRecap
    ? 'بورڈ پر طلبہ کے لیے یہ خانہ بنائیں (ہر گروپ ایک کاپی): حصے کا نام | آسان مطلب (اپنے الفاظ) | کتاب کی ایک سطر | گھر یا سکول کی ایک مثال'
    : 'بورڈ پر لکھیں: آج کا سبق | ایک آسان جملے میں مطلب | ایک مثال جو ہم سب کر سکیں';

  if (isRecap) {
    return {
      teachingOverview:
        'آج پورے یونٹ کا خلاصہ ہے۔ بورڈ پر ۳ سے ۵ اہم حصے لکھیں۔ ہر گروپ ایک حصہ سمجھائے — صرف پہلا ٹاپک نہیں۔',
      boardParts:
        boardParts.length > 0
          ? boardParts
          : ['بورڈ پر کتاب کے سرخیاں لکھیں (۳ سے ۴)'],
      openingLine: `آپ کہیں: “آج ہم یونٹ بند کر رہے ہیں۔ بورڈ پر ${partCount} نمبر والے حصے ہیں۔ ہر گروپ اپنا حصہ آسان الفاظ میں سمجھائے اور ایک مثال دے — صرف پہلی سرخی نہیں۔”`,
      partExamples: (partExamples.length
        ? partExamples.map(urduPartExampleLine)
        : [
            'حصہ ۱ — طالب علم کہے: “ہیلمیٹ لگانا لازم ہے۔” آپ جوڑیں: “سخت حادثے میں سر کی چوٹ کم ہوتی ہے۔”',
            'حصہ ۲ — طالب علم کہے: “بحث میں دو ٹیمیں ہوتی ہیں۔” آپ جوڑیں: “جج فیصلہ کرتا ہے، ہر بولنے والے کی باری مقرر ہوتی ہے۔”',
          ]).map((line) =>
        line.replace(/Student might say:/gi, 'طالب علم کہے:').replace(/You add:/gi, 'آپ جوڑیں:'),
      ),
      steps: [
        'بورڈ کے نمبروں والے حصے ایک بار آہستہ پڑھ کر سنائیں (تقریباً ایک منٹ)۔',
        'ہر گروپ ایک حصہ لے۔ معنی، کتاب کی ایک سطر، اور گھر/سکول کی مثال لکھیں۔',
        'ہر گروپ دو منٹ میں بیان کرے۔ جو بات کتاب سے رہ جائے آپ مکمل کریں۔',
        'آخر میں ایک طالب علم دو حصوں کو ایک مختصر جملے میں ملائے۔',
      ],
      warmUp: 'پوچھیں: “اس یونٹ میں ہم نے تین مختلف باتیں سیکھی ہیں؟ ایک ہی بات تین بار نہ کہیں۔”',
      recap: 'ایک طالب علم دو حصوں کو ایک جملے میں جوڑے (مثلاً سڑک کی حفاظت اور شہری سلوک)۔',
      studentWorkTemplate,
      checkQuestion: 'اپنے گروپ کے حصے کو کتاب کا عنوان پڑھے بغیر سمجھائیں۔',
      expectedAnswer: 'حصہ واضح ہو اور ایک درست مثال ہو۔',
      exitTicket: 'اپنے حصے کی ایک بات اور دوسرے گروپ سے سنی ہوئی ایک بات لکھیں۔',
      support: help.differentiation.struggling[0]
        ? 'گروپ کو کتاب کا پہلا جملہ دے کر آسان الفاظ میں مکمل کرائیں۔'
        : 'ضرورت ہو تو کتاب کا پہلا جملہ پڑھ کر سنائیں۔',
      stretch: help.differentiation.extension[0]
        ? 'گروپ اپنے حصے پر ایک مختصر امتحانی سوال بنا کر کلاس کو دے۔'
        : 'گروپ ایک سوال لکھے جو امتحان جیسا ہو۔',
    };
  }

  return {
    teachingOverview: help.overview.teachingOverview,
    boardParts: [],
    openingLine: help.teacherExplanation.simpleExplanation,
    partExamples: help.teacherExplanation.examples.map((e) => e),
    steps: help.classroomDelivery.activity?.steps ?? help.classroomDelivery.teachingSteps,
    warmUp: help.classroomDelivery.warmUp,
    recap: help.classroomDelivery.recap,
    studentWorkTemplate,
    checkQuestion: help.assessment.formativeQuestions[0]?.question ?? 'آج کے سبق کو اپنی زبان میں بتائیں۔',
    expectedAnswer: help.assessment.formativeQuestions[0]?.expectedAnswer ?? 'ایک مثال ضرور ہو۔',
    exitTicket: help.assessment.exitTicket,
    support: help.differentiation.struggling[0],
    stretch: help.differentiation.extension[0],
  };
}

function urduPartExampleLine(english: string): string {
  const m = english.match(/^Part\s+(\d+)\s*[—-]\s*(.+?)\.\s*Student might say:\s*["“](.+?)["”.]\s*You add:\s*["“](.+?)["”]/i);
  if (!m) return english;
  const [, num, label, student, teacher] = m;
  return `حصہ ${num} — ${label}. طالب علم کہے: “${student}” آپ جوڑیں: “${teacher}”`;
}
