import { redirect } from "next/navigation";

export default function BiometricDevicesRedirect() {
  redirect("/school/setup/attendance");
}
