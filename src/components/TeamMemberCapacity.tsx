import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { getMemberCapacity } from '@/lib/billing/api';
import { planLabels } from '@/lib/platform';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

/** A mesma capacidade aplicada pelo servidor ao aceitar um novo integrante. */
export function TeamMemberCapacity({ teamId, profileId, memberCountHint, onViewPlan }: {
  teamId: string; profileId: string | null; memberCountHint: number; onViewPlan: () => void;
}) {
  const capacity = useQuery({
    queryKey: ['team-capacity', 'summary', teamId, profileId, memberCountHint],
    queryFn: () => getMemberCapacity(teamId), retry: false, staleTime: 0,
  });
  const data = capacity.data;
  if (!data) return <section aria-label="Vagas da equipe" className="rounded-card bg-card p-4">
    {capacity.isError ? <><p role="alert" className="text-subhead text-muted-foreground">Não foi possível consultar o limite de integrantes.</p>
      <Button variant="ghost" onClick={() => void capacity.refetch()}>Tentar novamente</Button></>
      : <p role="status" className="text-subhead text-muted-foreground">Consultando vagas da equipe…</p>}
  </section>;
  const limit = data.member_limit;
  const remaining = limit === null ? null : Math.max(0, limit - data.member_count);
  const label = data.is_unlimited ? 'Acesso ilimitado' : planLabels[data.effective_plan as keyof typeof planLabels] ?? data.effective_plan;
  return <section aria-label="Vagas da equipe" className="space-y-3 rounded-card bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex min-w-0 items-center gap-2 text-subhead text-muted-foreground"><Users className="h-4 w-4 shrink-0" aria-hidden />Integrantes</span>
      <span className="text-right text-footnote font-medium">{label}</span>
    </div>
    <p className="text-title2 tabular-nums">{data.is_unlimited || limit === null ? `${data.member_count} integrantes` : `${data.member_count} de ${limit} vagas`}</p>
    {!data.is_unlimited && limit !== null && <Progress aria-label="Vagas ocupadas" value={limit > 0 ? Math.min(100, data.member_count / limit * 100) : 100} />}
    <div className="flex items-center justify-between gap-3">
      <p className="text-footnote text-muted-foreground">
        {data.is_unlimited ? 'Sem limite de integrantes.' : remaining === null ? 'Consulte os detalhes do plano.' : data.member_count > limit!
          ? 'Equipe acima do limite atual.' : remaining === 0 ? 'Todas as vagas estão ocupadas.' : `${remaining} ${remaining === 1 ? 'vaga disponível.' : 'vagas disponíveis.'}`}
        <span className="block">A contagem inclui o líder.</span>
      </p>
      <Button variant="ghost" className="shrink-0" onClick={onViewPlan}>Ver plano</Button>
    </div>
  </section>;
}
