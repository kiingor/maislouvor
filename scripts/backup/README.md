# Backups do +Louvor

Instalado na VPS em 08/10/2026. Não usa dados dos outros produtos hospedados nela.

- `backup.sh`: `/usr/local/sbin/maislouvor-backup`, executado por `maislouvor-backup.timer`, diariamente às 06h UTC (03h de Brasília), com atraso aleatório de até 5 minutos e execução perdida recuperada ao iniciar o servidor.
- Restic 0.18.1 do repositório apt do servidor; cópias criptografadas e deduplicadas.
- Repositório: `/var/backups/maislouvor-managed/restic`; janela `--keep-within 30d` e prune após cada backup bem-sucedido.
- Inclui dump PostgreSQL do banco do +Louvor, Storage, funções e configuração de implantação (`docker-compose.yml`, `.env` e `.env.*`). Arquivos temporários com segredos são removidos no encerramento, inclusive em erro.
- Retenção independente diária às 07h UTC: snapshots e cópias legadas de implantação com 30 dias; ver detalhes e exceções no documento de retenção.
- Senha fora do repositório Git, restrita a root no servidor, com cópia privada no Mac do titular. Nunca imprimir ou anexar a relatórios.
- `flock` impede sobreposição. O uso de memória do Restic foi limitado com `GOMEMLIMIT=512MiB`.

## Validação real

Primeiro snapshot `046ba4a2`: todas as estruturas e todos os blocos de dados passaram pelo `restic check --read-data`. Dump recuperado do snapshot e restaurado com `pg_restore` (exit 0) em contêiner descartável da mesma imagem PostgreSQL, sem rede, portas ou volumes de produção, com tarefas cron desativadas. Consultas às tabelas principais e ao catálogo Storage funcionaram. O contêiner foi removido após o teste.

A segunda execução, já incluindo `.env.*` e limpeza em falhas, também terminou com exit 0. Serviço saudável e timer habilitado. O repositório ocupa cerca de 4,6 GB, para aproximadamente 12 GB de Storage mais banco/configuração; o tamanho varia.

`verify-restore.py` documenta a verificação em contêiner isolado; executar no servidor por SSH. Ele não restaura sobre o banco de produção. Logs privados e resultado da restauração ficam em `/var/lib/maislouvor-backup`.

## Cópias independentes e retenção

A Hostinger mantém **duas cópias semanais fora da VPS, no Brasil**, confirmadas na conta em 08/10: 27/09 e 04/10. Não foi contratado backup diário pago. O restic local é diário. A cópia semanal também pode conter backups locais; o ciclo de recuperação é de aproximadamente 45 dias com as rotinas funcionando, com exceção explícita durante falhas para preservar a última recuperação.

A cópia temporária de validação no NVMe foi conferida novamente após configurar SMTP (**286 arquivos / 4.837.176.006 bytes**, SHA-256 idênticos à origem) e removida em 08/10, mantendo o relatório de conferência e todos os arquivos de compilação. Não existe rotina de backup externo no NVMe.

[Política, controles, operação e 18 testes da retenção](../../docs/lojas/retencao-backups-20261008.md). O job independente executou com sucesso, sem exclusões: 3 snapshots e 42 cópias dentro do prazo. Falhas ficam visíveis no systemd; alertas automáticos de e-mail não foram configurados.
