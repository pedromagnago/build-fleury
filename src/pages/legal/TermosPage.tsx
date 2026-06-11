import { Link } from 'react-router-dom'
import { LegalLayout, LegalSection, Preencher } from './LegalLayout'

export default function TermosPage() {
  return (
    <LegalLayout
      title="Termos de Uso"
      subtitle="Condições que regem o acesso e o uso da plataforma Build Fleury."
    >
      <p className="text-sm leading-relaxed text-slate-600">
        Última atualização: <Preencher>data de publicação</Preencher>
      </p>

      <LegalSection title="1. Objeto e aceitação">
        <p>
          Estes Termos de Uso regulam o acesso e a utilização da plataforma Build Fleury — software de gestão de
          obras com cronograma físico-financeiro integrado — disponibilizada por{' '}
          <Preencher>razão social</Preencher>, inscrita no CNPJ sob o nº <Preencher>CNPJ</Preencher> ("Build
          Fleury").
        </p>
        <p>
          Ao criar uma conta, acessar ou utilizar a plataforma, o usuário e a empresa que ele representa ("Cliente")
          declaram ter lido, compreendido e aceitado integralmente estes Termos e a{' '}
          <Link to="/privacidade" className="font-medium text-primary hover:underline">
            Política de Privacidade
          </Link>
          . Caso não concorde, não utilize a plataforma.
        </p>
        <p>
          As condições comerciais (planos, preços, número de obras ativas, prazo e forma de pagamento) são definidas
          em proposta ou contrato específico celebrado com o Cliente, que prevalece sobre estes Termos em caso de
          conflito.
        </p>
      </LegalSection>

      <LegalSection title="2. Conta, acesso e segurança">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            O acesso é individual, por usuário nomeado, mediante e-mail e senha. As credenciais são pessoais e
            intransferíveis; o Cliente responde pelos atos praticados com as contas de seus usuários.
          </li>
          <li>
            Cada usuário recebe um papel de acesso (ex.: sócio/diretor, financeiro, gestor de obra, investidor) que
            delimita as funcionalidades disponíveis. A gestão de papéis é responsabilidade do administrador da conta
            do Cliente.
          </li>
          <li>
            O usuário deve manter seus dados cadastrais atualizados e comunicar imediatamente o Build Fleury em caso
            de suspeita de uso não autorizado da conta.
          </li>
          <li>
            O Build Fleury pode suspender contas em caso de violação destes Termos, uso fraudulento, risco à
            segurança da plataforma ou inadimplência, conforme o contrato comercial.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Responsabilidades do Cliente">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Inserir informações verdadeiras e manter a exatidão dos dados de obras, cronogramas, pedidos, pagamentos
            e documentos cadastrados na plataforma.
          </li>
          <li>
            Garantir que possui base legal para inserir na plataforma dados pessoais de terceiros (fornecedores,
            prestadores, investidores), atuando como controlador desses dados nos termos da LGPD.
          </li>
          <li>
            Revisar e aprovar as classificações e extrações propostas pela inteligência artificial antes de
            torná-las definitivas. A IA é ferramenta de apoio; a decisão final é sempre do usuário.
          </li>
          <li>
            Não utilizar a plataforma para fins ilícitos, não tentar burlar controles de acesso, não realizar
            engenharia reversa nem sobrecarregar intencionalmente a infraestrutura.
          </li>
          <li>Manter sigilo sobre credenciais e informações confidenciais a que tiver acesso pela plataforma.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Responsabilidades do Build Fleury">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Disponibilizar a plataforma em regime de melhores esforços de disponibilidade, com manutenções
            programadas comunicadas com antecedência razoável.
          </li>
          <li>
            Adotar medidas de segurança técnicas e organizacionais adequadas, incluindo isolamento de dados por
            empresa e projeto, registro de auditoria das ações financeiras e exclusão lógica de dados financeiros.
          </li>
          <li>Prestar suporte conforme o plano contratado.</li>
          <li>
            Tratar dados pessoais conforme a{' '}
            <Link to="/privacidade" className="font-medium text-primary hover:underline">
              Política de Privacidade
            </Link>{' '}
            e a legislação aplicável.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Propriedade intelectual">
        <p>
          A plataforma, seu código-fonte, design, marcas, logotipos e documentação são de titularidade exclusiva do
          Build Fleury ou de seus licenciantes. A contratação confere ao Cliente apenas uma licença de uso pessoal,
          limitada, não exclusiva e intransferível, pelo prazo do contrato.
        </p>
        <p>
          Os dados inseridos pelo Cliente (cronogramas, documentos, lançamentos) permanecem de titularidade do
          Cliente. O Build Fleury poderá utilizá-los de forma agregada e anonimizada para melhoria do serviço e
          estatísticas, sem identificar o Cliente ou titulares de dados.
        </p>
      </LegalSection>

      <LegalSection title="6. Limitação de responsabilidade">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            A plataforma é ferramenta de gestão e apoio à decisão. Projeções de fluxo de caixa, orçamentos gerados
            por IA e indicadores dependem da qualidade dos dados inseridos pelo Cliente e não constituem
            aconselhamento financeiro, contábil ou de engenharia.
          </li>
          <li>
            O Build Fleury não responde por decisões comerciais, financeiras ou de execução de obra tomadas pelo
            Cliente com base nas informações da plataforma, nem por dados incorretos inseridos pelo Cliente ou por
            classificações de IA aprovadas pelo usuário.
          </li>
          <li>
            O Build Fleury não responde por indisponibilidades causadas por força maior, falhas de terceiros
            (provedores de internet, nuvem) ou uso indevido da plataforma.
          </li>
          <li>
            Na máxima extensão permitida em lei, a responsabilidade total do Build Fleury fica limitada ao valor
            efetivamente pago pelo Cliente nos 12 (doze) meses anteriores ao evento, excluídos danos indiretos e
            lucros cessantes.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Vigência, suspensão e rescisão">
        <p>
          Estes Termos vigoram enquanto houver conta ativa. O encerramento do contrato comercial implica o bloqueio
          do acesso; o Cliente poderá solicitar a exportação de seus dados no prazo previsto em contrato, após o
          qual os dados serão eliminados ou anonimizados, observados os prazos legais de guarda.
        </p>
      </LegalSection>

      <LegalSection title="8. Alterações destes Termos">
        <p>
          O Build Fleury pode alterar estes Termos a qualquer momento. Alterações relevantes serão comunicadas por
          e-mail ou aviso na plataforma com antecedência razoável. O uso continuado após a vigência da nova versão
          significa concordância. A versão vigente estará sempre disponível nesta página.
        </p>
      </LegalSection>

      <LegalSection title="9. Lei aplicável e foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de{' '}
          <Preencher>cidade/UF do foro</Preencher>, com renúncia a qualquer outro, por mais privilegiado que seja,
          para dirimir controvérsias decorrentes destes Termos, ressalvadas as hipóteses de competência legal
          diversa.
        </p>
        <p>
          Dúvidas sobre estes Termos podem ser encaminhadas para <Preencher>e-mail de contato</Preencher>.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
