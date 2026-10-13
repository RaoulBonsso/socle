import { cartes } from "@/lib/contenu";
import { Session } from "./session";

export const metadata = { title: "Réviser" };

export default function Reviser() {
  return <Session cartes={cartes()} />;
}
