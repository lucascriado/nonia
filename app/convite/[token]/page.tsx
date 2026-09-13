import type { Metadata } from "next";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = {
  title: "Convite",
  description: "Aceite o convite para participar da equipe de uma igreja no nonia.",
  robots: { index: false },
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <main className="mk-main mk-auth">
      <div className="mk-container mk-auth-inner">
        <InviteForm token={token} />
      </div>
    </main>
  );
}
