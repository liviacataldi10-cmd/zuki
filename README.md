# Zuki

Zuki é uma legaltech fictícia, criada como projeto da disciplina **Ciência de Dados Aplicada ao Direito I** (2026/2). O produto é uma IA que analisa o risco das cláusulas de um contrato, do ponto de vista do cliente do advogado.

> Esta análise é gerada por inteligência artificial e não substitui a revisão de um advogado.

**Site:** [COLOCAR AQUI O ENDEREÇO DO NETLIFY]

## O que o produto faz

A página inicial explica como a Zuki funciona, lista os critérios de análise, mostra a escala de risco e oferece uma **análise de exemplo** (em `/exemplo`), feita sobre um contrato fictício e que não usa a IA. Para analisar um contrato:

1. O advogado escolhe o **papel do cliente** em uma lista organizada por tipo de contrato (compra e venda, locação, prestação de serviços, trabalho, empréstimo ou financiamento, franquia, licenciamento, sociedade ou investimento) ou escolhe **Outro** e descreve o papel.
2. Envia o contrato em **PDF** ou cola apenas as **cláusulas** que quer analisar.
3. Opcionalmente, descreve em até 500 caracteres **o que mais preocupa o cliente** no contrato (por exemplo, prazo de entrega ou multa por rescisão).
4. A Zuki identifica o **tipo de contrato** e o **regime jurídico provável** (civil/empresarial paritário, adesão, consumo ou trabalho), separa o texto em cláusulas e analisa cada uma, dando atenção especial às preocupações informadas.
5. O resultado mostra:
   - um resumo com o tipo de contrato, o lado analisado, a nota média de risco, a contagem de cláusulas por nível e as 3 mais críticas;
   - como o contrato trata cada preocupação informada pelo cliente;
   - um cartão por cláusula, com **nota de risco de 1 a 5** (verde a vermelho), critérios do alerta, comentário sobre o risco para o negócio do cliente, sugestão de melhoria e **proposta de nova redação**;
   - **lacunas** e contradições (somente quando o contrato inteiro é enviado em PDF);
   - filtro e ordenação por nota.

### Escala de risco

| Nota | Significado |
|---|---|
| 1 | Risco mínimo: cláusula padrão, equilibrada ou favorável ao cliente |
| 2 | Risco baixo: pequeno ponto de atenção, sem necessidade de mudança |
| 3 | Risco moderado: recomenda-se negociar ou ajustar a redação |
| 4 | Risco alto: pode causar prejuízo relevante; deve ser renegociada |
| 5 | Risco crítico: possível nulidade ou exposição grave; não assinar como está |

A nota combina a probabilidade de a cláusula gerar problema e o tamanho do impacto (financeiro ou operacional) para o cliente.

### Critérios que a IA aplica a cada cláusula

Validade (por exemplo, arts. 166 e 424 do Código Civil e art. 51 do CDC), clareza, equilíbrio entre as partes, exposição financeira (incluindo cláusula penal, arts. 412 e 413 do Código Civil), alocação de riscos, saída do contrato, restrições (exclusividade, não concorrência, propriedade intelectual, confidencialidade), solução de conflitos, desvio do padrão de mercado e, no contrato inteiro, lacunas e contradições.

A análise segue o direito brasileiro. A IA é instruída a **não inventar artigos de lei nem jurisprudência**: quando não tiver certeza da base legal, deve escrever "base legal a confirmar".

## Como funciona

- **Navegador (`public/`):** mostra o formulário e o resultado, lê o PDF (com a biblioteca pdf.js), separa o texto em cláusulas e agrupa as cláusulas em lotes pequenos.
- **Função no servidor (`netlify/functions/api.mjs`):** guarda a chave da API e chama o modelo Claude (Anthropic). As instruções jurídicas para a IA ficam aqui, não no navegador. A IA responde em JSON estruturado, com tipo de contrato, regime jurídico, lado analisado, cláusulas (nota, critérios, comentário de risco, como melhorar e redação sugerida) e lacunas.
- Contratos longos são processados em partes, para não ultrapassar o limite de texto nem o tempo limite das funções do Netlify.

```
public/                 o site (index.html, app.js, estilo.css, logo.webp)
public/exemplo-dados.js a análise de exemplo (contrato fictício, mostrada em /exemplo)
netlify/functions/      a função que chama o Claude (api.mjs)
netlify.toml            configuração do Netlify (inclui o endereço /exemplo)
```

## Privacidade e custo

- A página de exemplo usa dados fixos e fictícios e **não gasta a API**.
- Os contratos **não são salvos** em disco nem em banco de dados: o texto fica na memória do navegador e das chamadas, e é descartado depois da análise. O conteúdo não é registrado em logs.
- Para a análise, o texto é enviado à API da Anthropic. Não use contratos reais sem autorização do cliente.
- Cada análise é cobrada na conta da API de quem hospeda o site. Por isso o acesso pode ser protegido por senha (`ZUKI_SENHA`) e há um limite aproximado de uso por visitante.

## Como publicar (Netlify)

1. Conecte este repositório ao Netlify (**Add new project → Import an existing project → GitHub**). O `netlify.toml` já define a pasta `public` e as funções.
2. Em **Project configuration → Environment variables**, crie:
   - `ANTHROPIC_API_KEY`: chave da API da Anthropic (obrigatória);
   - `ZUKI_SENHA`: senha de acesso (opcional, recomendada);
   - `ZUKI_LIMITE_HORA`, `ZUKI_MODELO` e `ZUKI_ESFORCO`: ajustes opcionais.
3. Faça um novo deploy para as variáveis valerem.

A chave nunca fica no código nem no repositório.

## Limitações

- As funções do Netlify têm tempo máximo curto (de 10 a 30 segundos, conforme o plano). Por isso a análise usa lotes pequenos e pouco "raciocínio" do modelo, o que pode reduzir a profundidade. Cláusulas que estourem o tempo sozinhas aparecem marcadas para revisão manual.
- PDFs escaneados (imagens, sem texto) não são lidos: o site pede para colar as cláusulas.
- A qualidade jurídica das notas e das sugestões ainda **não foi avaliada de forma sistemática** contra a revisão de advogados.
- O resultado é apoio à revisão, nunca decisão.

## Uso de IA no desenvolvimento

O código foi escrito com apoio do **Claude Code** (Anthropic), e a análise dentro do site usa a **API do Claude**. As decisões de produto e a definição jurídica (escala, critérios, regras) vieram dos autores. O relatório de uso de IA do grupo descreve o que foi tentado, o que deu errado e o que mudou.

## Autores

Lívia Cataldi, Marina Jurado, Sofia Iennaco, Maria Bulgari, Fernanda Jotta
