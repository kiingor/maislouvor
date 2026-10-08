# Prévias dos screenshots — 8 de outubro de 2026

Quatro imagens JPEG em **1320 × 2868**, dimensões conferidas nos arquivos e compatíveis com o slot de iPhone de 6,9″ segundo a [referência da Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications):

1. `01-biblioteca-1320x2868.jpg` — músicas da equipe.
2. `02-repertorio-1320x2868.jpg` — repertório e acesso ao ensaio.
3. `03-faixas-1320x2868.jpg` — mixer das faixas por instrumento.
4. `04-login-1320x2868.jpg` — login compacto com carrossel e opções Google/Apple.

São capturas dos componentes reais do app em ambiente local com dados fictícios, não capturas de um binário publicado no iPhone. Precisam da comparação final com a nova versão nativa antes de subir à loja. Nenhuma foi enviada ao App Store Connect nesta etapa.

Músicas e nomes fictícios vêm de `scripts/review-demo/data.mjs`. As capturas não contêm dados reais de usuários. A prévia não executa gravações no servidor; mostra estados de demonstração, inclusive faixas já preparadas.

Reproduzir a prévia: `npx vite --config scripts/store-screens/vite.config.mjs`, abrir `/scripts/store-screens/ui.html`. `capture.html` renderiza essa mesma interface com largura lógica de 440 e escala 3 para a captura em resolução de loja. Usar screenshot de página inteira; a janela visível pode limitar a captura à altura de 1750 pixels.

As imagens menores `aviso-computador.jpg` e `consentimento-privacidade.jpg` são evidências de QA, não screenshots propostos para a ficha da loja. As cópias `01-biblioteca.jpg` e `02-repertorio-previa.jpg` servem para visualização rápida.

## Diferença apontada pelo titular

A consulta direta a `https://maislouvor.com/login` confirmou o layout anterior, com “Bem-vindo de volta” (`login-site-publicado.jpg`). O login com carrossel aprovado foi distribuído somente no TestFlight 1.0.0 (6), conforme o registro de 06/10; não houve publicação dele no site naquela entrega. `login-beta-previa.jpg` mostra o componente atual preparado para o próximo beta, incluindo o rodapé jurídico novo. A captura antiga do site não é proposta como screenshot do próximo app. Não reverter o visual aprovado para igualar o site antigo.
