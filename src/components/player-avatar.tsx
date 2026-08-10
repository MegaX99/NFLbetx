import Image from "next/image";
import { createClient } from "@/lib/supabase";

const avatarColors = [
  "bg-blue-700 text-white",
  "bg-violet-700 text-white",
  "bg-emerald-700 text-white",
  "bg-amber-400 text-slate-950",
  "bg-rose-700 text-white",
  "bg-slate-950 text-lime-400",
];

export function playerInitials(screenName: string) {
  const parts = screenName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "NX";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function playerColor(screenName: string) {
  const hash = [...screenName].reduce((total, character) => total + character.charCodeAt(0), 0);
  return avatarColors[hash % avatarColors.length];
}

function publicAvatarUrl(path: string) {
  return createClient().storage.from("player-avatars").getPublicUrl(path).data.publicUrl;
}

export function PlayerAvatar({ screenName, avatarPath, size = 44 }: { screenName: string; avatarPath?: string | null; size?: number }) {
  const classes = "shrink-0 rounded-full border-2 border-white object-cover shadow-sm";

  if (avatarPath) {
    return <Image src={publicAvatarUrl(avatarPath)} alt={`${screenName} avatar`} width={size} height={size} unoptimized className={classes} style={{ width: size, height: size }} />;
  }

  return (
    <span
      aria-label={`${screenName} initials avatar`}
      className={`grid shrink-0 place-items-center rounded-full border-2 border-white font-black shadow-sm ${playerColor(screenName)}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.32)) }}
    >
      {playerInitials(screenName)}
    </span>
  );
}
