import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type UserAvatarProps = {
  /** La foto de Google, o `null`: se ven las iniciales (PF-44). */
  readonly image: string | null;
  readonly initials: string;
  readonly size?: "default" | "lg";
};

/**
 * La foto o las iniciales de la persona, del menú de la cuenta y del perfil.
 * Es decorativa: el nombre accesible lo pone quien la usa, al lado o en el
 * disparador.
 */
export function UserAvatar({ image, initials, size = "default" }: UserAvatarProps) {
  return (
    <Avatar size={size}>
      {image !== null && (
        // La foto de Google se pide sin referer; el CSP ya admite su dominio,
        // y `next/image` pediría configurar `remotePatterns`.
        <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />
      )}
      <AvatarFallback aria-hidden="true">{initials}</AvatarFallback>
    </Avatar>
  );
}
