/**
 * Avatar de iniciais. Sem foto, mostra as duas primeiras iniciais do nome
 * sobre um dos quatro tons da paleta — escolhido pelo próprio nome, para que
 * a mesma pessoa tenha sempre a mesma cor entre telas e sessões.
 */
export function initialsFrom(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");
}

/** Índice estável de 0 a 3 — a mesma pessoa nunca troca de cor. */
export function avatarToneFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 997;
  return hash % 4;
}

export function Avatar({
  name,
  photoUrl,
  size = 30,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const classes = ["initials-avatar", `avatar-${avatarToneFor(name)}`, className].filter(Boolean).join(" ");

  return (
    <span aria-hidden className={classes} style={{ "--avatar-size": `${size}px` } as React.CSSProperties}>
      {/* Foto real de membro ou visitante continua valendo; o placeholder é só
          a ausência dela. Não usamos next/image porque a origem pode ser um
          data URI vindo do banco. */}
      {photoUrl ? <img alt="" src={photoUrl} /> : initialsFrom(name)}
    </span>
  );
}
