// Consulta pública de um convite: a tela /convite/[token] mostra igreja,
// e-mail e papel antes de pedir a senha.
import { col, fn, Op, where } from "sequelize";
import { notFound } from "@/lib/http";
import { hashInvitationToken } from "@/lib/invitations";
import { Invitation, Organization, Role, User } from "@/lib/models";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) throw notFound("Convite não encontrado ou expirado.", "invalid_invitation");

    const convite = await Invitation.findOne({
      attributes: ["email", "fullName", "expiresAt"],
      // Validade pelo relógio do BANCO, como no resto dos convites.
      where: { tokenHash: hashInvitationToken(token), status: "pending", expiresAt: { [Op.gt]: fn("now") } },
      include: [
        { model: Organization, as: "organization", attributes: ["name"], required: true },
        { model: Role, as: "role", attributes: ["name"], required: true },
      ],
    });

    if (!convite) throw notFound("Convite não encontrado ou expirado.", "invalid_invitation");

    // Já existe conta com este e-mail? Muda a tela: pede a senha de quem já
    // tem conta, em vez de criar uma. Comparação sem caixa, dos dois lados.
    const contas = await User.count({
      where: where(fn("lower", col("email")), fn("lower", convite.email)),
    });

    const { organization, role } = convite as Invitation & { organization: Organization; role: Role };
    return Response.json({
      email: convite.email,
      fullName: convite.fullName,
      organizationName: organization.name,
      roleName: role.name,
      expiresAt: convite.expiresAt,
      hasAccount: contas > 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
