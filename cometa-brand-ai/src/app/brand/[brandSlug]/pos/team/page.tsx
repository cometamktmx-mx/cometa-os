"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PosIcon } from "../../components/pos-icons";
import { buildPosHref } from "../../components/pos-sidebar";
import { usePosContext } from "../../components/pos-shell";
import {
  PosBadge,
  PosButton,
  PosCard,
  PosInput,
  PosModal,
  PosPage,
  PosPageHeader,
  PosSection,
} from "../../components/pos-ui";

type CanonicalRole = "owner" | "admin" | "manager" | "cashier" | "inventory";
type MembershipRole = CanonicalRole | "editor" | "viewer";

type TeamMember = {
  userId: string;
  email: string;
  displayName: string | null;
  role: MembershipRole;
  effectiveRole: CanonicalRole | "viewer";
  status: "active";
  legacy: boolean;
  isCurrentUser: boolean;
  canChangeRole: boolean;
  canPromoteOwner: boolean;
  canRevoke: boolean;
  allowedTargetRoles: CanonicalRole[];
};

type TeamInvitation = {
  id: string;
  email: string;
  role: Exclude<CanonicalRole, "owner">;
  status: "pending";
  createdAt: string;
  expiresAt: string;
  canRevoke: boolean;
};

type TeamResponse = {
  ok: true;
  brand: { slug: string; name: string };
  commercial: {
    plan: { code: string; name: string; monthlyPriceMxn: string };
    activeUsers: number;
    pendingInvitations: number;
    effectiveUsage: number;
    maxUsers: number;
    availableSeats: number;
  };
  members: TeamMember[];
  invitations: TeamInvitation[];
  actor: {
    role: MembershipRole;
    permissions: string[];
    allowedInviteRoles: Exclude<CanonicalRole, "owner">[];
  };
};

type ConfirmationAction =
  | { kind: "revokeMember"; member: TeamMember }
  | { kind: "revokeInvitation"; invitation: TeamInvitation }
  | { kind: "promoteOwner"; member: TeamMember }
  | null;

const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
  inventory: "Inventario",
  editor: "Editor · Legacy",
  viewer: "Consulta · Legacy",
};

const ROLE_DESCRIPTIONS: Record<Exclude<CanonicalRole, "owner">, string> = {
  admin: "Gestiona la operación del POS y el equipo, excepto propiedad y suscripción.",
  manager: "Opera ventas, caja, productos, inventario, clientes y reportes.",
  cashier: "Vende, cobra y atiende clientes.",
  inventory: "Gestiona productos y existencias.",
};

function apiMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}

function initials(member: TeamMember) {
  const source = member.displayName || member.email || "CP";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function roleTone(role: MembershipRole) {
  if (role === "owner") return "primary" as const;
  if (role === "admin") return "info" as const;
  if (role === "cashier") return "success" as const;
  if (role === "viewer") return "neutral" as const;
  return "warning" as const;
}

export default function PosTeamPage() {
  const { brand, isLoading: isContextLoading } = usePosContext();
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<CanonicalRole, "owner"> | "">("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationAction>(null);

  const loadTeam = useCallback(async () => {
    if (!brand.slug) return;

    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const response = await fetch(
        `/api/pos/team?brandSlug=${encodeURIComponent(brand.slug)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => null)) as unknown;

      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(buildPosHref(brand.slug, "team"))}`);
        return;
      }
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(apiMessage(payload, "No pudimos cargar el equipo."));
      }

      setTeam(payload as TeamResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos cargar el equipo.");
    } finally {
      setLoading(false);
    }
  }, [brand.slug]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const isAtLimit = Boolean(team && team.commercial.effectiveUsage >= team.commercial.maxUsers);
  const onlyOwner = useMemo(
    () => (team?.members.filter((member) => member.role === "owner").length || 0) === 1,
    [team]
  );

  function openInvite() {
    if (!team || isAtLimit) return;
    setInviteEmail("");
    setInviteRole(team.actor.allowedInviteRoles[0] || "");
    setError(null);
    setNotice(null);
    setInviteOpen(true);
  }

  async function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteRole) return;

    setInviteLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/pos/team/invitations?brandSlug=${encodeURIComponent(brand.slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
        }
      );
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(apiMessage(payload, "No pudimos enviar la invitación."));

      setInviteOpen(false);
      setNotice("Invitación enviada. La persona deberá iniciar sesión para aceptarla.");
      await loadTeam();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "No pudimos enviar la invitación.");
    } finally {
      setInviteLoading(false);
    }
  }

  async function changeRole(member: TeamMember, role: CanonicalRole) {
    setActionLoading(`role:${member.userId}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/pos/team/members/${encodeURIComponent(member.userId)}?brandSlug=${encodeURIComponent(brand.slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(apiMessage(payload, "No pudimos actualizar el rol."));

      setNotice("Rol actualizado.");
      await loadTeam();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "No pudimos actualizar el rol.");
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmAction() {
    if (!confirmation) return;

    const item = confirmation.kind === "revokeInvitation"
      ? confirmation.invitation
      : confirmation.member;
    const actionKey = `${confirmation.kind}:${"id" in item ? item.id : item.userId}`;
    setActionLoading(actionKey);
    setError(null);

    try {
      if (confirmation.kind === "promoteOwner") {
        await changeRole(confirmation.member, "owner");
        setNotice("La persona ahora es propietaria del negocio.");
      } else if (confirmation.kind === "revokeMember") {
        const response = await fetch(
          `/api/pos/team/members/${encodeURIComponent(confirmation.member.userId)}?brandSlug=${encodeURIComponent(brand.slug)}`,
          { method: "DELETE" }
        );
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) throw new Error(apiMessage(payload, "No pudimos revocar el acceso."));
        setNotice("Acceso revocado.");
        await loadTeam();
      } else {
        const response = await fetch(
          `/api/pos/team/invitations/${encodeURIComponent(confirmation.invitation.id)}?brandSlug=${encodeURIComponent(brand.slug)}`,
          { method: "DELETE" }
        );
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) throw new Error(apiMessage(payload, "No pudimos revocar la invitación."));
        setNotice("Invitación revocada.");
        await loadTeam();
      }
      setConfirmation(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No pudimos completar la acción.");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading || isContextLoading) return <TeamSkeleton />;

  if (forbidden) {
    return (
      <PosPage width="wide">
        <PosCard className="mx-auto flex min-h-[52vh] max-w-2xl flex-col items-center justify-center border-amber-300/25 bg-amber-300/[0.06] p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--pos-warning-soft)] text-[var(--pos-warning)]">
            <PosIcon name="warning" className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-[var(--pos-text-primary)]">No tienes permiso para administrar el equipo.</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[var(--pos-text-secondary)]">Pide a un propietario o administrador que ajuste tu acceso si necesitas esta sección.</p>
          <Link href={buildPosHref(brand.slug, "")} className="pos-ui-focus mt-6 inline-flex h-11 items-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary)] px-5 text-sm font-semibold text-slate-950 hover:bg-[var(--pos-primary-hover)]">Volver al POS</Link>
        </PosCard>
      </PosPage>
    );
  }

  if (error && !team) {
    return (
      <PosPage width="wide">
        <PosPageHeader title="Equipo" description="Controla quién puede entrar a tu negocio y qué puede hacer." />
        <PosCard variant="danger" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--pos-danger)]">{error}</p>
          <PosButton variant="secondary" onClick={() => void loadTeam()}>Reintentar</PosButton>
        </PosCard>
      </PosPage>
    );
  }

  if (!team) return null;

  return (
    <PosPage width="wide" density="compact" className="pb-12">
      <PosPageHeader
        eyebrow="COMETA POS · EQUIPO"
        title="Tu equipo, bajo control."
        description="Controla quién puede entrar a tu negocio y qué puede hacer dentro de Cometa POS."
        actions={<PosButton leadingIcon={<PosIcon name="plus" className="h-4 w-4" />} onClick={openInvite} disabled={isAtLimit || team.actor.allowedInviteRoles.length === 0}>Invitar persona</PosButton>}
      />

      {error ? <Feedback tone="danger">{error}</Feedback> : null}
      {notice ? <Feedback tone="success">{notice}</Feedback> : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <PosCard className="relative overflow-hidden">
          <div className="absolute right-[-50px] top-[-60px] h-44 w-44 rounded-full bg-[var(--pos-primary)]/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--pos-primary)]">Plan actual</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[var(--pos-text-primary)]">{team.commercial.plan.name}</h2>
              <p className="mt-2 text-sm text-[var(--pos-text-secondary)]">{team.commercial.effectiveUsage} de {team.commercial.maxUsers} usuarios utilizados</p>
            </div>
            <PosBadge tone={isAtLimit ? "warning" : "success"} dot>{team.commercial.availableSeats} disponibles</PosBadge>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <UsageMetric label="Activos" value={team.commercial.activeUsers} />
            <UsageMetric label="Pendientes" value={team.commercial.pendingInvitations} />
            <UsageMetric label="Límite" value={team.commercial.maxUsers} />
            <UsageMetric label="Disponibles" value={team.commercial.availableSeats} />
          </div>
        </PosCard>

        {isAtLimit ? (
          <PosCard className="flex flex-col justify-between gap-4 border-amber-300/25 bg-amber-300/[0.06]">
            <div>
              <p className="text-base font-bold text-[var(--pos-text-primary)]">Llegaste al límite de usuarios de tu plan.</p>
              <p className="mt-2 text-sm leading-6 text-[var(--pos-text-secondary)]">{team.commercial.plan.name} permite hasta {team.commercial.maxUsers} usuarios.</p>
            </div>
            <Link href={buildPosHref(team.brand.slug, "subscription")} className="pos-ui-focus inline-flex min-h-11 items-center justify-center rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] px-4 text-sm font-semibold text-[var(--pos-text-primary)] hover:bg-white/[0.05]">Ver planes</Link>
          </PosCard>
        ) : (
          <PosCard className="flex flex-col justify-between gap-4">
            <div>
              <p className="text-base font-bold text-[var(--pos-text-primary)]">El equipo crece contigo.</p>
              <p className="mt-2 text-sm leading-6 text-[var(--pos-text-secondary)]">Las invitaciones pendientes también reservan un asiento.</p>
            </div>
            <PosButton variant="secondary" onClick={openInvite}>Agregar persona</PosButton>
          </PosCard>
        )}
      </section>

      <PosSection
        title="Miembros activos"
        description={`${team.members.length} persona${team.members.length === 1 ? "" : "s"} con acceso activo a ${team.brand.name}.`}
      >
        {team.members.length === 1 ? (
          <PosCard className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-bold text-[var(--pos-text-primary)]">Tu equipo empieza aquí.</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--pos-text-secondary)]">Invita a la primera persona y define qué puede hacer dentro de Cometa POS.</p>
            </div>
            <PosButton onClick={openInvite} disabled={isAtLimit}>Invitar persona</PosButton>
          </PosCard>
        ) : null}
        <div className="mt-3 grid gap-3">
          {team.members.map((member) => (
            <MemberCard
              key={member.userId}
              member={member}
              onlyOwner={onlyOwner}
              loading={actionLoading === `role:${member.userId}`}
              onChangeRole={(role) => void changeRole(member, role)}
              onConfirm={(action) => setConfirmation(action)}
            />
          ))}
        </div>
      </PosSection>

      <PosSection title="Invitaciones pendientes" description="Cada invitación vigente reserva un asiento hasta que se acepte, venza o sea revocada.">
        {team.invitations.length === 0 ? (
          <PosCard className="border-dashed text-sm text-[var(--pos-text-secondary)]">No tienes invitaciones pendientes.</PosCard>
        ) : (
          <div className="grid gap-3">
            {team.invitations.map((invitation) => (
              <article key={invitation.id} className="flex flex-col gap-4 rounded-[var(--pos-radius-md)] border border-[var(--pos-line-subtle)] bg-[var(--pos-panel)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">{invitation.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <RoleBadge role={invitation.role} />
                    <PosBadge tone="warning" size="compact" dot>Pendiente</PosBadge>
                    <span className="text-xs text-[var(--pos-text-muted)]">Vence: {formatExpiry(invitation.expiresAt)}</span>
                  </div>
                </div>
                {invitation.canRevoke ? <PosButton variant="danger" size="compact" onClick={() => setConfirmation({ kind: "revokeInvitation", invitation })}>Revocar invitación</PosButton> : null}
              </article>
            ))}
          </div>
        )}
      </PosSection>

      <InviteModal
        open={inviteOpen}
        email={inviteEmail}
        role={inviteRole}
        roles={team.actor.allowedInviteRoles}
        loading={inviteLoading}
        onClose={() => setInviteOpen(false)}
        onEmailChange={setInviteEmail}
        onRoleChange={setInviteRole}
        onSubmit={submitInvite}
      />
      <ConfirmationModal
        action={confirmation}
        loading={actionLoading !== null}
        onClose={() => setConfirmation(null)}
        onConfirm={() => void confirmAction()}
      />
    </PosPage>
  );
}

function UsageMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[var(--pos-radius-sm)] bg-[var(--pos-panel-muted)] p-3"><p className="text-lg font-bold text-[var(--pos-text-primary)]">{value}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-muted)]">{label}</p></div>;
}

function RoleBadge({ role }: { role: MembershipRole }) {
  return <span className="inline-flex items-center gap-2"><PosBadge tone={roleTone(role)} size="compact">{ROLE_LABELS[role]}</PosBadge>{(role === "editor" || role === "viewer") ? <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-muted)]">Legacy</span> : null}</span>;
}

function MemberCard({
  member,
  onlyOwner,
  loading,
  onChangeRole,
  onConfirm,
}: {
  member: TeamMember;
  onlyOwner: boolean;
  loading: boolean;
  onChangeRole: (role: CanonicalRole) => void;
  onConfirm: (action: ConfirmationAction) => void;
}) {
  const lastOwner = member.role === "owner" && onlyOwner;
  return (
    <article className="flex flex-col gap-4 rounded-[var(--pos-radius-md)] border border-[var(--pos-line-subtle)] bg-[var(--pos-panel)] p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--pos-primary-soft)] text-xs font-bold text-[var(--pos-primary)]">{initials(member)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">{member.displayName || member.email || "Miembro del equipo"}</p>
          {member.displayName && member.email ? <p className="mt-0.5 truncate text-xs text-[var(--pos-text-muted)]">{member.email}</p> : null}
          {member.role === "editor" ? <p className="mt-1 text-xs text-[var(--pos-text-muted)]">Acceso equivalente a Encargado en Cometa POS.</p> : null}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2"><RoleBadge role={member.role} /><PosBadge tone="success" size="compact" dot>Activo</PosBadge></div>
        {member.canChangeRole ? <label className="sr-only" htmlFor={`role-${member.userId}`}>Cambiar rol</label> : null}
        {member.canChangeRole ? <select id={`role-${member.userId}`} defaultValue="" disabled={loading} onChange={(event) => { const role = event.target.value as CanonicalRole; if (role) onChangeRole(role); event.currentTarget.value = ""; }} className="pos-ui-focus h-10 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-panel-muted)] px-3 text-xs font-semibold text-[var(--pos-text-primary)] disabled:opacity-50"><option value="">Cambiar rol</option>{member.allowedTargetRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select> : null}
        {member.canPromoteOwner ? <PosButton variant="secondary" size="compact" onClick={() => onConfirm({ kind: "promoteOwner", member })}>Convertir en propietario</PosButton> : null}
        {member.canRevoke ? <PosButton variant="danger" size="compact" onClick={() => onConfirm({ kind: "revokeMember", member })}>Revocar acceso</PosButton> : null}
        {lastOwner ? <span className="text-xs text-[var(--pos-text-muted)]">Debe existir al menos un propietario activo.</span> : null}
      </div>
    </article>
  );
}

function InviteModal({ open, email, role, roles, loading, onClose, onEmailChange, onRoleChange, onSubmit }: {
  open: boolean; email: string; role: Exclude<CanonicalRole, "owner"> | ""; roles: Exclude<CanonicalRole, "owner">[]; loading: boolean;
  onClose: () => void; onEmailChange: (value: string) => void; onRoleChange: (value: Exclude<CanonicalRole, "owner">) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <PosModal open={open} onClose={onClose} title="Invitar persona" description="La persona deberá iniciar sesión y aceptar explícitamente la invitación." footer={<><PosButton variant="ghost" onClick={onClose} disabled={loading}>Cancelar</PosButton><PosButton type="submit" form="invite-person-form" loading={loading}>Enviar invitación</PosButton></>}>
    <form id="invite-person-form" onSubmit={onSubmit} className="grid gap-5">
      <PosInput label="Correo electrónico" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="persona@negocio.com" autoComplete="email" required />
      <label className="grid gap-2 text-sm"><span className="font-semibold text-[var(--pos-text-primary)]">Rol</span><select value={role} onChange={(event) => onRoleChange(event.target.value as Exclude<CanonicalRole, "owner">)} className="pos-ui-focus h-[var(--pos-control-normal)] rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-panel-muted)] px-3 text-sm text-[var(--pos-text-primary)]" required>{roles.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></label>
      {role ? <div className="rounded-[var(--pos-radius-sm)] bg-[var(--pos-panel-muted)] p-4"><p className="text-sm font-semibold text-[var(--pos-text-primary)]">{ROLE_LABELS[role]}</p><p className="mt-1 text-xs leading-5 text-[var(--pos-text-secondary)]">{ROLE_DESCRIPTIONS[role]}</p></div> : null}
    </form>
  </PosModal>;
}

function ConfirmationModal({ action, loading, onClose, onConfirm }: { action: ConfirmationAction; loading: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!action) return null;
  const promotion = action.kind === "promoteOwner";
  const revokeInvite = action.kind === "revokeInvitation";
  const target = revokeInvite ? action.invitation.email : action.member.displayName || action.member.email;
  const title = promotion ? "¿Convertir en propietario?" : revokeInvite ? "¿Revocar esta invitación?" : "¿Revocar acceso?";
  const description = promotion ? `${target} podrá administrar el equipo, la suscripción y la propiedad del negocio.` : revokeInvite ? "La persona ya no podrá aceptarla y el asiento quedará disponible." : `${target} perderá el acceso a este negocio. Su cuenta y el historial operativo no se eliminarán.`;
  return <PosModal open onClose={onClose} title={title} description={description} footer={<><PosButton variant="ghost" onClick={onClose} disabled={loading}>Cancelar</PosButton><PosButton variant={promotion ? "primary" : "danger"} onClick={onConfirm} loading={loading}>{promotion ? "Convertir en propietario" : revokeInvite ? "Revocar invitación" : "Revocar acceso"}</PosButton></>}><div className="rounded-[var(--pos-radius-sm)] border border-[var(--pos-line-subtle)] bg-[var(--pos-panel-muted)] p-4 text-sm leading-6 text-[var(--pos-text-secondary)]">{promotion ? "Esta es una acción sensible. Confirma que esta persona debe tener autoridad total del negocio." : "Esta acción es reversible mediante una futura invitación o reactivación autorizada."}</div></PosModal>;
}

function Feedback({ tone, children }: { tone: "danger" | "success"; children: string }) {
  return <div className={`rounded-[var(--pos-radius-sm)] border px-4 py-3 text-sm font-medium ${tone === "danger" ? "border-rose-300/25 bg-rose-400/10 text-rose-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"}`} role={tone === "danger" ? "alert" : "status"}>{children}</div>;
}

function TeamSkeleton() {
  return <PosPage width="wide" density="compact" aria-busy="true"><div className="h-28 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.05]" /><div className="mt-6 grid gap-4 lg:grid-cols-2"><div className="h-48 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.05]" /><div className="h-48 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.05]" /></div><div className="mt-8 space-y-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.05]" />)}</div></PosPage>;
}
