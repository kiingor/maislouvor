# Preços aprovados para as assinaturas

Tabela aprovada em **06/10/2026** (horário de Fortaleza). Substitui a fórmula anterior de adicional por pessoa acima de 50 integrantes, que produzia 19 valores indisponíveis na conta Apple. Os preços até 50 integrantes foram mantidos.

## Mensal, por equipe

| Capacidade | Essencial | Estúdio | Asafe | Completo |
|---:|---:|---:|---:|---:|
| 5 | Grátis | R$ 21,90 | R$ 11,90 | R$ 26,90 |
| 10 | R$ 16,90 | R$ 36,90 | R$ 26,90 | R$ 41,90 |
| 20 | R$ 26,90 | R$ 56,90 | R$ 41,90 | R$ 61,90 |
| 40 | R$ 39,90 | R$ 79,90 | R$ 59,90 | R$ 89,90 |
| 50 | R$ 59,90 | R$ 109,90 | R$ 89,90 | R$ 124,90 |
| 75 | R$ 76,90 | R$ 219,90 | R$ 174,90 | R$ 269,90 |
| 100 | R$ 94,90 | R$ 329,90 | R$ 259,90 | R$ 409,90 |
| 150 | R$ 129,90 | R$ 559,90 | R$ 439,90 | R$ 699,90 |
| 200 | R$ 164,90 | R$ 779,90 | R$ 609,90 | R$ 979,90 |

## Anual e disponibilidade

O anual custa **dez mensalidades, em uma cobrança**. Não é parcelamento nem compromisso anual com pagamento mensal. Na API Apple, os dois períodos usam `UPFRONT`; `MONTHLY` representa outra modalidade comercial e não foi utilizado.

Quatro anuais ficam desabilitados no iOS por ultrapassarem R$ 6.000,00, o maior ponto de preço retornado para esta conta: **Estúdio/200, Asafe/200, Completo/150 e Completo/200**. Os IDs permanecem cadastrados como rascunhos, sem preço nem disponibilidade. A landing informa a restrição; a Offering não inclui esses quatro produtos. São 70 identidades pagas, 66 opções com preço no Brasil e Essencial até 5 gratuito, sem produto pago.

## Adicionar integrantes

O botão `+` acrescenta uma pessoa à quantidade desejada. Enquanto a quantidade cabe na capacidade já contratada, a mensalidade não muda. Ao ultrapassar o limite, a tela seleciona a menor capacidade disponível que comporta a equipe e apresenta o valor total e a diferença para a assinatura atual. O responsável precisa confirmar a alteração.

Exemplos: Completo 20 → 40 passa de R$ 61,90 para R$ 89,90/mês (+R$ 28,00). Essencial 20 → 40 passa de R$ 26,90 para R$ 39,90/mês (+R$ 13,00). A contratação inclui a faixa inteira. **Não há venda avulsa de uma vaga por um preço fixo** nem cobrança automática ao usar o seletor. O fluxo não convida nem adiciona pessoas à equipe; ele reserva capacidade no plano.

No iPhone, a ampliação mantém o plano e o período e substitui o produto no mesmo grupo Apple. As opções ficam no mesmo nível: a Apple trata a mudança de capacidade dentro do mesmo período como troca imediata. Alterações de plano, duração ou origem de cobrança usam o gerenciamento da assinatura. O backend confirma o novo produto antes de apresentar a ampliação como concluída.

Fontes: catálogo real de pontos BRL consultado na App Store Connect; [níveis de assinatura Apple](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions/); [trocas de produto RevenueCat](https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions).

Arquivos de referência: `revenuecat-catalog.json`, `../../landing/pricing.js` e `../../supabase/setup/revenuecat_catalog.sql`. Cadastro de preços não equivale à aprovação da Apple nem à ativação do checkout em produção.
