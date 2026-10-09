# Retenção efetiva de backups — 8 de outubro de 2026

Esta política trata das cópias de recuperação do +Louvor. A retenção dos dados na aplicação e eventuais deveres legais de conservação são assuntos separados. A implementação abaixo não demonstra, por si só, conformidade jurídica integral.

## Política e alcance

| Camada | Regra implementada | Local e finalidade |
| --- | --- | --- |
| Restic gerenciado | Backups diários; janela operacional de 30 dias; remoção de snapshots vencidos e dos blocos sem referência | Repositório criptografado na VPS, para recuperar banco, Storage, funções e configuração |
| Cópias antigas de implantação | Exclusão a partir de 30 dias da data identificada no nome da cópia; avaliação diária independente de um novo backup | Exclusivamente `/var/backups/maislouvor` e `/var/lib/maislouvor-deploy` |
| Hostinger | Duas cópias semanais rotativas, fora da VPS | Brasil; estado verificado pelo agente principal na conta, com cópias de 27/09 e 04/10; não foi contratado backup diário pago |
| Cópia temporária de validação no NVMe | Removida após conferência SHA-256 integral, preservando os relatórios de integridade | Não constitui arquivo permanente nem rotina de backup externo; remoção concluída pelo agente principal em 08/10 e registrada no relatório da sessão |

Uma cópia semanal da VPS também pode conter o repositório restic e as cópias de implantação ainda não vencidas. Por isso, **30 dias não é um teto global**. Com as rotinas funcionando, a janela de 30 dias somada à próxima avaliação diária e às duas cópias semanais resulta em um ciclo operacional de até aproximadamente **45 dias** para os dados de recuperação. Uma cópia do provedor que já exista não é editada individualmente; ela sai pela rotação semanal.

O texto público deve informar esse ciclo operacional e os seus critérios, sem prometer destruição exata em 30 dias ou ausência absoluta de exceções. Falhas de backup, cópias bloqueadas por uso e desvios de retenção precisam ser tratados pelo responsável. As rotinas falham de forma visível no systemd/journal; **não foi configurado envio automático de alertas** nesta etapa.

O restic `--keep-within 30d` usa a data do snapshot mais recente. Por isso, ele foi complementado por um processo independente que compara cada snapshot com o relógio UTC atual. Quando todos os snapshots já tiverem mais de 30 dias, a rotina falha e preserva a recuperação existente, em vez de apagar a última cópia durante uma falha prolongada. O responsável deve corrigir o backup, verificar uma nova cópia e executar a retenção novamente. Isso é uma exceção operacional identificável, não conservação indefinida planejada.

## Controles implementados

- `scripts/backup/retain-restic.py`: repositório, tag e três caminhos fixos; valida identificadores/datas/escopo; bloqueio compartilhado com o backup diário; usa `forget --prune` e verifica o repositório após exclusões. Dry-run por padrão; `--apply` exige root.
- `scripts/backup/retain-legacy.py`: apenas os dois diretórios fixos; reconhece os formatos atuais de nomes datados. Não usa `mtime`, porque `cp`/tar preservam datas antigas dos arquivos. Conserva `landing.lock` e recusa nomes inesperados, symlinks, pontos de montagem e arquivos com referências de processos ou contêineres. Uma recusa retorna falha para avaliação.
- `maislouvor-backup-retention.timer`: diariamente às 07h UTC, equivalente a 04h em Brasília, com atraso aleatório de até cinco minutos e recuperação da execução após reinício. Independente do backup principal das 06h UTC.
- `scripts/backup/run-retention.py`: executa as duas verificações mesmo quando uma falha; o serviço termina em falha se qualquer etapa falhar. Assim, um problema no restic não impede a limpeza das cópias legadas e vice-versa.
- O serviço permite escrita apenas nos diretórios de retenção e locks; não altera `/var/www/maislouvor`, `/opt/supabase`, volumes de dados em uso ou os backups de outros aplicativos.
- Nenhuma chave, dump ou conteúdo de ambiente foi incluído neste documento ou no Git.

## Validação realmente executada

Em 09/10/2026, 00h06 UTC (08/10, 21h06 em Brasília):

1. Dez testes de retenção legada em diretórios temporários: limiar de 30 dias, dry-run, `mtime` antigo, formatos de nomes, arquivos desconhecidos/futuros, symlinks, mounts e referências ativas.
2. Seis testes da seleção restic: limiar real de 30 dias, diferença em relação à data do último snapshot, preservação da última recuperação, metadados/escopo inválidos, ausência de snapshots e repositório saudável.
   Mais dois testes do executor: continuação após falha de uma etapa e sucesso apenas quando ambas concluem sem erro. Total: **18 testes**.
3. Dry-run no servidor: **3 snapshots restic**, zero vencidos; **42 cópias legadas**, todas dentro do prazo; um `landing.lock` preservado.
4. Serviço instalado, executado uma vez e concluído com `Result=success` e `ExecMainStatus=0`; **zero exclusões**. Timer confirmado ativo; próxima execução 09/10, 07h01min32s UTC.
5. Antes da instalação, os diretórios atuais da aplicação e das funções eram caminhos reais independentes. Nenhum mount Docker ou `cwd` ativo apontava para as cópias legadas.

O backup diário, a leitura integral do repositório, a restauração isolada do banco e a verificação da cópia temporária no NVMe foram executados pelo agente principal e estão registrados nos relatórios próprios. Esta etapa não executou restauração de produção nem mudou cronograma/backup na Hostinger.

## Operação e incidentes

```bash
# Metadados apenas; não exibe chaves nem conteúdo de backups.
sudo /usr/local/sbin/maislouvor-restic-retention
sudo /usr/local/sbin/maislouvor-backup-retention
sudo systemctl status maislouvor-backup.timer maislouvor-backup-retention.timer
sudo journalctl -u maislouvor-backup.service -u maislouvor-backup-retention.service
```

Em falha, conferir espaço, disponibilidade da VPS/Docker, integridade restic e disponibilidade de uma cópia recente antes de repetir `systemctl start maislouvor-backup-retention.service`. Não contornar bloqueios com `rm -rf`, não rebatizar cópias para renovar a idade e não criar cópias permanentes em dispositivos externos sem uma regra própria de expiração. Antes de restaurar uma cópia antiga, revisar os pedidos de exclusão/revogação posteriores ao backup para evitar reintroduzi-los no uso normal.

Fontes verificadas em 08/10/2026: [retenção de snapshots no restic](https://restic.readthedocs.io/en/stable/060_forget.html), [backup e restauração de VPS Hostinger](https://www.hostinger.com/br/support/1583232-como-fazer-backup-ou-restaurar-um-servidor-vps-hostinger/). A documentação Hostinger descreve duas cópias de cada modalidade; na conta inspecionada, somente a modalidade semanal estava habilitada.
