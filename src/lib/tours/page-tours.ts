import type { TourStepDef, TourId } from '@/lib/tours/driver-config'

// Transition messages shown at the end of each page tour in Product Tour mode
export const TRANSITIONS: Record<string, string> = {
  dashboard: 'Agora que você conhece o Dashboard, vamos configurar seu projeto.',
  configuracoes: 'Projeto configurado! Agora vamos carregar seus dados.',
  importacao: 'Dados carregados! Vamos ver como ficou o cronograma.',
  cronograma: 'Cronograma OK. Vamos olhar os itens de compra e custos.',
  compras: 'Compras organizadas. Hora de controlar os pagamentos.',
  pagamentos: 'Pagamentos controlados! Se tem financiamento, é a próxima parada.',
  mutuos: 'Finanças na mão. Vamos ver como a IA ajuda com documentos.',
  documentos: 'Documentos enviados! Agora vamos auditar as classificações.',
  auditoria: 'IA calibrada. Vamos acompanhar o avanço físico.',
  avanco: 'Progresso registrado. Vamos ver as medições contratuais.',
  medicoes: 'Receitas controladas. Hora de conciliar com o banco.',
  conciliacao: 'Contas batendo. E se quiser simular cenários?',
  simulador: 'Cenários analisados. Por fim, relatórios profissionais.',
  relatorios: 'Parabéns! Você conheceu todo o Build Fleury. 🎉',
}

export const pageTours: Record<TourId, TourStepDef[]> = {
  dashboard: [
    {
      element: '#tour-onboarding-panel',
      title: '📋 Seu Progresso',
      description: 'Este painel mostra o que falta configurar. Cada card te leva direto para a ação.',
    },
    {
      element: '#tour-kpi-cards',
      title: '📊 Indicadores Financeiros',
      description: 'Orçamento total, consumido, saldo disponível e cobertura de pedidos — tudo de relance.',
    },
    {
      element: '#tour-regra-ouro',
      title: '🏆 Regra de Ouro',
      description: 'A barra compara planejado vs. gasto. Verde = saúde financeira.',
    },
    {
      element: '#tour-fluxo-caixa',
      title: '💰 Fluxo de Caixa',
      description: 'Projeção mensal de entradas (medições) e saídas (parcelas). O saldo nunca pode ficar negativo.',
    },
  ],

  configuracoes: [
    {
      element: '#tour-dados-empresa',
      title: '🏢 Dados da Empresa',
      description: 'Preencha razão social, CNPJ e localização. Estes dados aparecem nos relatórios.',
    },
    {
      element: '#tour-dados-obra',
      title: '🏗 Dados da Obra',
      description: 'Quantidade de casas, área e data de início calibram todo o cronograma.',
    },
    {
      element: '#tour-dados-financeiros',
      title: '💵 Dados Financeiros',
      description: 'Faturamento e custo total do contrato são a base de todos os indicadores.',
    },
    {
      element: '#tour-equipe',
      title: '👥 Equipe & Convites',
      description: 'Convide membros da equipe. Cada um recebe um link de acesso por e-mail.',
    },
  ],

  importacao: [
    {
      element: '#tour-import-tabs',
      title: '📑 Abas de Importação',
      description: 'Cada aba importa um tipo de dado: cronograma, itens, pedidos, medições e distribuição.',
    },
    {
      element: '#tour-import-upload',
      title: '📤 Upload de Planilha',
      description: 'Arraste sua planilha Excel ou CSV. O formato é detectado automaticamente.',
    },
    {
      element: '#tour-import-preview',
      title: '👁 Preview e Validação',
      description: 'Confira os dados antes de importar. Erros aparecem em vermelho por linha.',
    },
  ],

  cronograma: [
    {
      element: '#tour-crono-views',
      title: '👁 3 Visualizações',
      description: 'Alterne entre Gantt (timeline), WBS (hierarquia) e Kanban (por status).',
    },
    {
      element: '#tour-crono-filters',
      title: '🔍 Filtros',
      description: 'Filtre por busca, status ou período para encontrar o que precisa.',
    },
    {
      element: '#tour-crono-new',
      title: '➕ Nova Etapa',
      description: 'Crie novas etapas diretamente. Cada etapa tem datas, peso e distribuições.',
    },
    {
      element: '#tour-crono-table',
      title: '📋 Edição Inline',
      description: 'Edite datas, valores e status direto na tabela. Funciona como Excel.',
    },
  ],

  compras: [
    {
      element: '#tour-compras-tabs',
      title: '📊 Abas de Compras',
      description: 'Visualize por itens orçamentários, por fornecedor ou pela Curva ABC.',
    },
    {
      element: '#tour-compras-filters',
      title: '🔍 Filtros e Busca',
      description: 'Filtre por etapa, fornecedor, tipo ou status.',
    },
    {
      element: '#tour-compras-table',
      title: '📋 Tabela de Itens',
      description: 'Cada item mostra orçado, consumido, saldo e %. Clique para expandir e ver pedidos.',
    },
    {
      element: '#tour-compras-new',
      title: '➕ Novo Item',
      description: 'Cadastre novos itens de compra manualmente quando necessário.',
    },
  ],

  pagamentos: [
    {
      element: '#tour-pag-summary',
      title: '💳 Resumo',
      description: 'Veja de relance: quanto vence hoje, esta semana, e o total já pago.',
    },
    {
      element: '#tour-pag-filters',
      title: '🔍 Filtros de Status',
      description: 'Filtre por: a vencer, vencidas, pagas, parcialmente pagas.',
    },
    {
      element: '#tour-pag-table',
      title: '📋 Parcelas',
      description: 'Todas as parcelas com fornecedor, valor, vencimento e status.',
    },
  ],

  mutuos: [
    {
      element: '#tour-mutuos-summary',
      title: '🏦 Resumo de Capital',
      description: 'Total contratado, saldo devedor e próximo vencimento em um relance.',
    },
    {
      element: '#tour-mutuos-new',
      title: '➕ Novo Mútuo',
      description: 'Cadastre empréstimos, financiamentos ou capital de giro com taxas e prazos.',
    },
    {
      element: '#tour-mutuos-list',
      title: '📋 Parcelas do Mútuo',
      description: 'Acompanhe as parcelas e registre pagamentos realizados.',
    },
  ],

  documentos: [
    {
      element: '#tour-docs-upload',
      title: '📤 Upload de Documentos',
      description: 'Envie NFs, recibos e comprovantes. Aceita PDF, imagem e XML de NF-e.',
    },
    {
      element: '#tour-docs-list',
      title: '📋 Lista de Documentos',
      description: 'Acompanhe o status: recebido → processando → classificado pela IA.',
    },
  ],

  auditoria: [
    {
      element: '#tour-audit-indicators',
      title: '📊 Indicadores da IA',
      description: 'Pendentes, aprovadas, taxa de acerto e score médio da classificação.',
    },
    {
      element: '#tour-audit-queue',
      title: '📋 Fila de Revisão',
      description: 'Classificações ordenadas por urgência. Verde = alta confiança.',
    },
    {
      element: '#tour-audit-actions',
      title: '✅ Ações',
      description: 'Aprove se correto, corrija a etapa/item, ou rejeite com motivo. Suas correções treinam a IA.',
    },
  ],

  avanco: [
    {
      element: '#tour-avanco-grid',
      title: '📊 Grid de Etapas',
      description: 'Informe as casas concluídas em cada etapa. O percentual atualiza automaticamente.',
    },
    {
      element: '#tour-avanco-progress',
      title: '📈 Barra de Progresso',
      description: 'Compare meta planejada vs. avanço real. Vermelho = atrasado.',
    },
  ],

  medicoes: [
    {
      element: '#tour-medicoes-cards',
      title: '📋 Medições Contratuais',
      description: 'Cada medição mostra valor planejado, progresso das etapas e status.',
    },
    {
      element: '#tour-medicoes-actions',
      title: '🎯 Solicitar e Liberar',
      description: 'Quando a meta é atingida, solicite a medição. Depois registre o valor liberado.',
    },
  ],

  conciliacao: [
    {
      element: '#tour-conc-account',
      title: '🏦 Selecionar Conta',
      description: 'Escolha qual conta bancária conciliar.',
    },
    {
      element: '#tour-conc-upload',
      title: '📤 Importar Extrato',
      description: 'Importe o extrato em CSV ou OFX. O sistema pareia automaticamente.',
    },
    {
      element: '#tour-conc-matches',
      title: '✅ Conciliação',
      description: 'Lançamentos conciliados ficam em verde. Pendentes precisam de ação manual.',
    },
  ],

  simulador: [
    {
      element: '#tour-sim-base',
      title: '📊 Cenário Base',
      description: 'Reflete a projeção real atual — sem alterações.',
    },
    {
      element: '#tour-sim-create',
      title: '🔮 Criar Cenário',
      description: '"E se a medição atrasar 30 dias?" ou "E se o custo subir 10%?" — simule aqui.',
    },
  ],

  relatorios: [
    {
      element: '#tour-rel-types',
      title: '📄 Tipos de Relatório',
      description: 'Executivo, financeiro detalhado, cronograma ou customizado.',
    },
    {
      element: '#tour-rel-filters',
      title: '🔍 Filtros',
      description: 'Defina o período e os dados que quer incluir.',
    },
    {
      element: '#tour-rel-export',
      title: '📥 Exportar',
      description: 'Exporte para Excel ou PDF, pronto para apresentar.',
    },
  ],
}
