import { redirect } from "next/navigation";

/**
 * There is no group screen (docs/design.md 4.7, section 7). A group is a namespace, not a place: it does its work
 * in the same-people picker and in the band on a person view. An address from before that sends people home
 * instead of nowhere.
 */
export default function GroupPage(): never {
  redirect("/");
}
