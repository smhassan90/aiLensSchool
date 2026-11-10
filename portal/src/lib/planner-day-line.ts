import type { PlannerLesson } from "@/lib/planner-view-model";

const DISPLAY_ACTIVITIES: { name: string; goal: string; steps: string[] }[] = [
  {
    name: "Correct the mistake",
    goal: "Students spot a wrong explanation and rewrite it correctly.",
    steps: [
      "Write one idea from the lesson incorrectly on the board.",
      "Students say what is wrong and write a correct one-line version.",
      "Ask what would go wrong if someone believed the mistake.",
      "Hear two corrections and fix anything still unclear.",
    ],
  },
  {
    name: "Sixty-second teach-back",
    goal: "Each student teaches one idea to a partner in one minute.",
    steps: [
      "State the idea once, slowly.",
      "Pairs: one student teaches it in 60 seconds, the other adds the missing piece.",
      "Swap roles.",
      "Two students teach it to the class. Correct one gap.",
    ],
  },
  {
    name: "Two choices",
    goal: "Students choose between two actions and defend the choice.",
    steps: [
      "Put two actions on the board, one that fits the lesson and one that does not.",
      "Students vote, then say why in one sentence.",
      "Name the part of the idea that decides the better choice.",
      "Students write that reason down.",
    ],
  },
  {
    name: "Sketch and label",
    goal: "Students draw the idea and label the part that matters.",
    steps: [
      "Give one quiet minute to sketch the idea.",
      "Each student labels two parts in their own words.",
      "Neighbours compare and circle one difference.",
      "Show one strong sketch and fix one that missed the point.",
    ],
  },
  {
    name: "Finish the scene",
    goal: "Students finish a short situation using the lesson idea.",
    steps: [
      "Read a three-line scene that stops before the idea is used.",
      "Students write the next two lines so the idea changes what happens.",
      "Two volunteers read their ending.",
      "The class says which ending used the idea more clearly.",
    ],
  },
  {
    name: "Board sprint",
    goal: "Students race to write a correct one-line answer.",
    steps: [
      "Split the class into two lines facing the board.",
      "Call a prompt: write one true sentence about the idea.",
      "Second prompt: write what would go wrong if we ignored it.",
      "Give the point for a correct idea, then explain any miss.",
    ],
  },
  {
    name: "Reporter interview",
    goal: "One student asks and the other explains it to a younger pupil.",
    steps: [
      "Pairs sit face to face.",
      "The reporter asks three simple questions.",
      "The expert answers in short sentences, without notes.",
      "Reporters share the clearest answer they heard.",
    ],
  },
  {
    name: "True or false sort",
    goal: "Students sort statements and correct the false ones.",
    steps: [
      "Read four short statements. Two are false.",
      "Students mark true or false, then compare with a partner.",
      "The class corrects each false statement in one sentence.",
      "Leave the corrected lines on the board.",
    ],
  },
  {
    name: "One change",
    goal: "Students name one real change this idea would make, and why.",
    steps: [
      "Remind the class of the idea in one sentence.",
      "Each student writes one thing they would do differently because of it.",
      "They add a reason that uses the idea.",
      "Hear four answers and mark which reason used the lesson.",
    ],
  },
  {
    name: "Two-speaker exchange",
    goal: "Two students argue one claim and the class picks the stronger reason.",
    steps: [
      "Write one claim from the lesson on the board.",
      "One student gives a reason, another gives a careful objection. One minute each.",
      "The class names which reason used the lesson more accurately.",
      "Add the fact they both missed, in one sentence.",
    ],
  },
];

function pickDisplayActivity(seed: string) {
  let hash = 0;
  const text = seed.trim() || "lesson";
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 33) + text.charCodeAt(i)) >>> 0;
  }
  return DISPLAY_ACTIVITIES[hash % DISPLAY_ACTIVITIES.length];
}

function isCannedGroupScript(notes: string): boolean {
  return /make groups of 3 or 4/i.test(notes) || /how to run this activity/i.test(notes);
}

function ideasFromCannedNotes(notes: string): string[] {
  return notes
    .split("\n")
    .map((line) => line.trim().replace(/^\d+\.\s+/, ""))
    .filter((line) => line.length > 20 && line.length < 160)
    .filter((line) => !/make groups|real-life example|every student speaks|presents for|point they missed|give each group|how to run/i.test(line))
    .slice(0, 1);
}

function variedActivityText(title: string, notes: string): string {
  const style = pickDisplayActivity(title);
  const idea = ideasFromCannedNotes(notes)[0];
  const steps = style.steps.map((step, index) => `${index + 1}. ${step}`);
  if (idea) steps.splice(1, 0, `Use this idea: ${idea}`);
  return [style.name, ...steps].join("\n");
}

export function shortTodayLine(lesson: PlannerLesson): string {
  const notes = lesson.teacherNotes ?? "";
  const blob = `${lesson.title} ${lesson.objectives.join(" ")} ${notes}`.toLowerCase();
  const storedScriptIsLong =
    notes.length > 180 ||
    blob.includes("indexed section") ||
    blob.includes("example for the class") ||
    blob.includes("opening (");

  if (lesson.kind === "ACTIVITY" || /\bactivity\b/.test(blob)) {
    const objective = lesson.objectives.find((line) => line.trim().length > 0);
    if (
      objective &&
      objective.length < 180 &&
      !/help me teach/i.test(objective) &&
      !/groups recall the main ideas/i.test(objective)
    ) {
      return objective;
    }
    const style = pickDisplayActivity(lesson.title);
    return `${style.name}: ${style.goal}`;
  }
  if (/\bexercise\b/.test(blob)) {
    return "Do the textbook exercises for this chapter.";
  }
  if (blob.includes("continue reading")) {
    return "Continue reading from where the class stopped.";
  }
  if (blob.includes("· intro") || blob.includes("section 1") || /\bintroduce\b/.test(lesson.objectives[0] ?? "")) {
    if (!storedScriptIsLong && lesson.objectives[0] && lesson.objectives[0].length < 160) {
      return lesson.objectives[0];
    }
    return "Introduce the chapter with one short example, then start reading.";
  }
  if (storedScriptIsLong || lesson.objectives.length > 1) {
    return "Read the next section with the class.";
  }
  return lesson.objectives[0] ?? "Read the next section with the class.";
}

export function activityConductText(lesson: PlannerLesson): string | null {
  if (lesson.kind !== "ACTIVITY" && !/\bactivity\b/i.test(lesson.title)) return null;
  const notes = lesson.teacherNotes?.trim() ?? "";
  if (isCannedGroupScript(notes) || notes.length < 40) return variedActivityText(lesson.title, notes);
  if (notes.length < 900 && !/indexed section|opening \(/i.test(notes)) return notes;
  return variedActivityText(lesson.title, notes);
}
