import { redirect } from "next/navigation";

export default function LegacyNewLessonPage() {
  redirect("/teacher/lessons/chapters/new");
}
