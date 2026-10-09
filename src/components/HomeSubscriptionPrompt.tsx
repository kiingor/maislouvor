import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, UsersRound } from "lucide-react";
import { useTeam } from "@/contexts/TeamContext";
import { getBillingContext } from "@/lib/billing/api";
import { canStartSubscription } from "@/lib/billing/types";

/** Uma orientação na Home; preços e contratação continuam na aba Assinatura. */
export function HomeSubscriptionPrompt() {
  const { currentTeam, profileId } = useTeam();
  const teamId = currentTeam?.id;
  const isOwner = Boolean(profileId && currentTeam?.owner_id === profileId);
  const billing = useQuery({
    queryKey: ["billing", teamId, profileId],
    queryFn: () => getBillingContext(teamId!),
    enabled: Boolean(teamId && isOwner),
    staleTime: 60_000,
    retry: false,
  });
  const context = billing.data;
  // Dados indisponíveis não viram propaganda nem erro extra na Home.
  // Equipes pagas, legadas e liberadas manualmente mantêm a Home sem a chamada.
  if (!isOwner || billing.isError || !context || context.team_id !== teamId ||
    !canStartSubscription(context) || context.subscription.plan !== "free" ||
    context.subscription.will_renew || context.capacity?.is_unlimited) return null;

  return <section className="mt-4 rounded-card bg-card px-4 py-3" aria-labelledby="home-plans-title">
    <div className="flex items-center gap-3">
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground" aria-hidden="true">
        <UsersRound className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="home-plans-title" className="text-body font-medium">Mais vagas para sua equipe</h2>
        <p className="text-footnote text-muted-foreground">Amplie quando precisar.</p>
      </div>
    </div>
    <Link to={`/app/settings?aba=assinatura&equipe=${encodeURIComponent(teamId!)}`}
      className="ml-[42px] inline-flex min-h-11 items-center gap-1 text-subhead font-semibold text-primary transition-opacity hover:opacity-80 focus-visible:outline-offset-4">
      Ver planos <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
    </Link>
  </section>;
}
