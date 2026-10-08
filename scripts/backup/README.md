# Backups do +Louvor

Instalado na VPS em 08/10/2026. Não usa dados dos outros produtos hospedados nela.

- `backup.sh`: `/usr/local/sbin/maislouvor-backup`, executado por `maislouvor-backup.timer`, diariamente às 06h UTC (03h de Brasília), com atraso aleatório de até 5 minutos e execução perdida recuperada ao iniciar o servidor.
- Restic 0.18.1 do repositório apt do servidor; cópias criptografadas e deduplicadas.
- Repositório: `/var/backups/maislouvor-managed/restic`; janela `--keep-within 30d` e prune após cada backup bem-sucedido.
- Inclui dump PostgreSQL do banco do +Louvor, Storage, funções e configuração de implantação (`docker-compose.yml`, `.env` e `.env.*`). Arquivos temporários com segredos são removidos no encerramento, inclusive em erro.
- Exclusão automática aplica-se SOMENTE ao repositório gerenciado. Dumps antigos de implantação e backups do provedor ainda precisam da auditoria de retenção.
- Senha fora do repositório Git, restrita a root no servidor, com cópia privada no Mac do titular. Nunca imprimir ou anexar a relatórios.
- `flock` impede sobreposição. O uso de memória do Restic foi limitado com `GOMEMLIMIT=512MiB`.

## Validação real

Primeiro snapshot `046ba4a2`: todas as estruturas e todos os blocos de dados passaram pelo `restic check --read-data`. Dump recuperado do snapshot e restaurado com `pg_restore` (exit 0) em contêiner descartável da mesma imagem PostgreSQL, sem rede, portas ou volumes de produção, com tarefas cron desativadas. Consultas às tabelas principais e ao catálogo Storage funcionaram. O contêiner foi removido após o teste.

A segunda execução, já incluindo `.env.*` e limpeza em falhas, também terminou com exit 0. Serviço saudável e timer habilitado. O repositório ocupa cerca de 4,6 GB, para aproximadamente 12 GB de Storage mais banco/configuração; o tamanho varia.

`verify-restore.py` documenta a verificação em contêiner isolado; executar no servidor por SSH. Ele não restaura sobre o banco de produção. Logs privados e resultado da restauração ficam em `/var/lib/maislouvor-backup`.

## Pendente: cópia externa e retenção completa

O repositório acima está **na mesma VPS**. A perda da VPS ainda pode levar esta cópia junto. Falta verificar/habilitar a cópia independente da Hostinger na conta do titular (login solicitado) ou configurar outro destino aprovado. Não foi contratada infraestrutura paga.

Não foi copiado o repositório inteiro para o Mac: o espaço livre chegou a cerca de 3 GB, menor que a cópia. A chave de recuperação foi preservada fora da VPS, mas **uma chave não substitui um backup dos dados**.

Não publicar a política dizendo que TODAS as cópias expiram em 30 dias até conferir os backups do provedor e os dumps de implantação preexistentes.
