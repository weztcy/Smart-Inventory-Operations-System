import { prisma } from "@/lib/db";
import { getSessionToken } from "@/lib/auth";
import { InviteClaimForm } from "@/components/auth-forms";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export const metadata = { title: "Undangan" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: { select: { name: true } } },
  });
  const session = await getSessionToken();

  const invalid =
    !inv ||
    inv.status !== "PENDING" ||
    inv.expiresAt < new Date() ||
    (inv.status === "PENDING" && !!session && (await prisma.user.findUnique({ where: { id: session.uid } }))?.email.toLowerCase() !== inv.email.toLowerCase() && !!(await prisma.membership.findUnique({ where: { userId_organizationId: { userId: session.uid, organizationId: inv.organizationId } } })));

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {invalid ? (
            <div className="text-center">
              <h1 className="text-lg font-semibold text-slate-900">Undangan tidak valid</h1>
              <p className="mt-2 text-sm text-slate-500">
                Tautan undangan sudah kedaluwarsa, telah dipakai, atau dibatalkan. Minta pemilik
                organisasi mengirim undangan baru.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-slate-900">Undangan Bergabung</h1>
              <p className="mt-2 text-sm text-slate-600">
                Anda diundang ke organisasi <strong>{inv!.organization.name}</strong> dengan peran{" "}
                <Badge tone="indigo">{ROLE_LABELS[inv!.role as Role] ?? inv!.role}</Badge> sebagai{" "}
                <span className="font-medium">{inv!.email}</span>.
              </p>
              <div className="mt-5">
                <InviteClaimForm token={token} needAccount={!session} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

