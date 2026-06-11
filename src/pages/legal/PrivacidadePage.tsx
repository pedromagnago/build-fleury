import { Link } from 'react-router-dom'
import { LegalLayout, LegalSection, Preencher } from './LegalLayout'

export default function PrivacidadePage() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      subtitle="Como o Build Fleury coleta, usa, armazena e protege dados pessoais, em conformidade com a Lei nº 13.709/2018 (LGPD)."
    >
      <p className="text-sm leading-relaxed text-slate-600">
        Última atualização: <Preencher>data de publicação</Preencher>
      </p>

      <LegalSection title="1. Quem somos (controlador)">
        <p>
          O Build Fleury é uma plataforma de gestão de obras com cronograma físico-financeiro integrado,
          operada por <Preencher>razão social</Preencher>, inscrita no CNPJ sob o nº{' '}
          <Preencher>CNPJ</Preencher>, com sede em <Preencher>endereço completo</Preencher> ("Build Fleury",
          "nós").
        </p>
        <p>
          Para os fins da LGPD, o Build Fleury atua como <strong className="font-semibold text-slate-900">controlador</strong>{' '}
          dos dados de cadastro e navegação dos usuários da plataforma e do site, e como{' '}
          <strong className="font-semibold text-slate-900">operador</strong> dos dados que as construtoras clientes
          inserem na plataforma no exercício de suas atividades (dados de fornecedores, colaboradores e documentos
          fiscais, por exemplo) — nesses casos, o controlador é a construtora cliente.
        </p>
      </LegalSection>

      <LegalSection title="2. Dados que coletamos">
        <p>Coletamos as seguintes categorias de dados pessoais:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-semibold text-slate-900">Dados de conta:</strong> nome, e-mail, senha
            (armazenada de forma criptografada), papel/perfil de acesso e empresa vinculada.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Dados de uso:</strong> registros de acesso (data,
            hora, IP), ações realizadas na plataforma e logs de auditoria de operações financeiras.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Dados inseridos pelo cliente:</strong> informações de
            obras, cronogramas, pedidos de compra, pagamentos, recebimentos e documentos (notas fiscais, recibos,
            contratos), que podem conter dados pessoais de terceiros (fornecedores, prestadores, investidores).
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Dados de contato comercial:</strong> nome, e-mail e
            telefone informados em solicitações de demonstração ou contato.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Cookies e tecnologias similares:</strong> conforme a
            seção 8 desta política.
          </li>
        </ul>
        <p>Não coletamos intencionalmente dados pessoais sensíveis nem dados de menores de idade.</p>
      </LegalSection>

      <LegalSection title="3. Finalidades e bases legais">
        <p>Tratamos dados pessoais com as seguintes finalidades e bases legais (art. 7º da LGPD):</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-semibold text-slate-900">Execução de contrato</strong> (art. 7º, V): criação e
            gestão de contas, autenticação, prestação das funcionalidades da plataforma e suporte.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Cumprimento de obrigação legal ou regulatória</strong>{' '}
            (art. 7º, II): guarda de registros de acesso (Marco Civil da Internet) e de documentos fiscais pelos
            prazos legais.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Legítimo interesse</strong> (art. 7º, IX): segurança da
            plataforma, prevenção a fraudes, auditoria de operações financeiras e melhoria do serviço.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Consentimento</strong> (art. 7º, I): comunicações de
            marketing e cookies não essenciais, quando aplicável. O consentimento pode ser revogado a qualquer
            momento.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Compartilhamento de dados">
        <p>
          Não vendemos dados pessoais. Compartilhamos dados apenas com operadores estritamente necessários à
          prestação do serviço, mediante contrato e com obrigações de segurança e confidencialidade:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Provedores de infraestrutura em nuvem (hospedagem da aplicação e do banco de dados);</li>
          <li>
            Provedores de inteligência artificial utilizados exclusivamente para extração e classificação de
            documentos enviados pelo cliente (notas fiscais, recibos), sempre sujeita a auditoria humana;
          </li>
          <li>Provedores de e-mail transacional e ferramentas de suporte;</li>
          <li>Autoridades públicas, quando houver obrigação legal ou ordem judicial.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Transferência internacional">
        <p>
          Alguns provedores listados acima podem armazenar ou processar dados fora do Brasil. Nesses casos, a
          transferência ocorre com base nas hipóteses do art. 33 da LGPD, exigindo dos provedores nível de proteção
          de dados compatível com a legislação brasileira.
        </p>
      </LegalSection>

      <LegalSection title="6. Retenção e eliminação">
        <p>
          Mantemos os dados pessoais pelo tempo necessário ao cumprimento das finalidades desta política, dos prazos
          legais aplicáveis (fiscais, contábeis e do Marco Civil da Internet) e do contrato com o cliente. Dados
          financeiros da plataforma seguem regime de exclusão lógica (soft delete) para preservar a integridade da
          trilha de auditoria; após os prazos de retenção, são eliminados ou anonimizados de forma segura.
        </p>
      </LegalSection>

      <LegalSection id="direitos-do-titular" title="7. Direitos do titular (art. 18 da LGPD)">
        <p>Você pode exercer, a qualquer momento e gratuitamente, os seguintes direitos:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Confirmação da existência de tratamento e acesso aos dados;</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;</li>
          <li>Portabilidade dos dados a outro fornecedor de serviço, observados os segredos comercial e industrial;</li>
          <li>Eliminação dos dados tratados com base no consentimento, ressalvadas as hipóteses legais de guarda;</li>
          <li>Informação sobre entidades públicas e privadas com as quais compartilhamos dados;</li>
          <li>Informação sobre a possibilidade de não fornecer consentimento e as consequências da negativa;</li>
          <li>Revogação do consentimento;</li>
          <li>Revisão de decisões tomadas unicamente com base em tratamento automatizado.</li>
        </ul>
        <p>
          As solicitações devem ser dirigidas ao encarregado indicado na seção 9 e serão respondidas nos prazos da
          LGPD. Quando atuarmos como operador, encaminharemos a solicitação ao controlador (a construtora cliente).
        </p>
      </LegalSection>

      <LegalSection title="8. Cookies">
        <p>Utilizamos cookies nas seguintes categorias:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-semibold text-slate-900">Essenciais:</strong> autenticação e manutenção da
            sessão. Sem eles a plataforma não funciona; não exigem consentimento.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Funcionais:</strong> preferências de interface (ex.:
            projeto selecionado, filtros).
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Analíticos:</strong> métricas agregadas de uso do site,
            quando habilitados, mediante consentimento.
          </li>
        </ul>
        <p>Você pode gerenciar ou bloquear cookies nas configurações do seu navegador.</p>
      </LegalSection>

      <LegalSection title="9. Segurança da informação">
        <p>Adotamos medidas técnicas e organizacionais compatíveis com o art. 46 da LGPD, incluindo:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Isolamento de dados por empresa e por projeto (multi-tenant com Row-Level Security);</li>
          <li>Criptografia de dados em trânsito (TLS) e de credenciais em repouso;</li>
          <li>Registro de auditoria (audit log) de toda ação financeira: quem alterou, quando e quais valores;</li>
          <li>Controle de acesso por papéis (sócio, financeiro, gestor de obra, investidor);</li>
          <li>Exclusão lógica de dados financeiros, evitando perda ou adulteração de registros.</li>
        </ul>
        <p>
          Em caso de incidente de segurança com risco ou dano relevante aos titulares, comunicaremos a ANPD e os
          titulares afetados, nos termos do art. 48 da LGPD.
        </p>
      </LegalSection>

      <LegalSection title="10. Encarregado pelo tratamento de dados (DPO)">
        <p>
          O encarregado pelo tratamento de dados pessoais do Build Fleury é{' '}
          <Preencher>nome do encarregado</Preencher>, que pode ser contatado pelo e-mail{' '}
          <Preencher>e-mail do encarregado</Preencher> para dúvidas, solicitações de titulares e comunicações com a
          Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </LegalSection>

      <LegalSection title="11. Alterações desta política">
        <p>
          Esta política pode ser atualizada para refletir mudanças legais ou do serviço. A versão vigente estará
          sempre disponível nesta página, com a data da última atualização. Alterações relevantes serão comunicadas
          aos usuários por e-mail ou aviso na plataforma.
        </p>
        <p>
          Os termos que regem o uso da plataforma estão disponíveis em{' '}
          <Link to="/termos" className="font-medium text-primary hover:underline">
            Termos de uso
          </Link>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
