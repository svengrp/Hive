import {
  Briefcase, CalendarDays, Camera, Clapperboard, Code, Dumbbell, FlaskConical, Gamepad2,
  GraduationCap, HeartHandshake, Leaf, Megaphone, Music, Palette, PenLine, PenTool,
  Stethoscope, UtensilsCrossed,
} from "lucide-react";

/* Centres d'intérêt : liste fermée, mêmes clés que backend/utils/interests.js.
   Libellés dans les traductions (interests.<clé>). */
export const INTERESTS = [
  { key: "tech", Icon: Code },
  { key: "design", Icon: PenTool },
  { key: "business", Icon: Briefcase },
  { key: "marketing", Icon: Megaphone },
  { key: "music", Icon: Music },
  { key: "video", Icon: Clapperboard },
  { key: "photo", Icon: Camera },
  { key: "games", Icon: Gamepad2 },
  { key: "art", Icon: Palette },
  { key: "writing", Icon: PenLine },
  { key: "education", Icon: GraduationCap },
  { key: "science", Icon: FlaskConical },
  { key: "environment", Icon: Leaf },
  { key: "social", Icon: HeartHandshake },
  { key: "sport", Icon: Dumbbell },
  { key: "health", Icon: Stethoscope },
  { key: "food", Icon: UtensilsCrossed },
  { key: "events", Icon: CalendarDays },
];

export const MAX_INTERESTS = 3;

const KNOWN = new Set(INTERESTS.map((item) => item.key));

/* Clés connues seulement, sans doublon, dans la limite autorisée. */
export function cleanInterests(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((key) => KNOWN.has(key)))].slice(0, MAX_INTERESTS);
}
