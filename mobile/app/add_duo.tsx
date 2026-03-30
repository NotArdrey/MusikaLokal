import { Redirect } from "expo-router";

export default function AddDuoRoute() {
  return <Redirect href={{ pathname: "/add_group", params: { mode: "duo" } }} />;
}
