import { Link } from 'react-router-dom'
import ThemeToggle from '@/components/ThemeToggle/ThemeToggle'
import './Privacy.css'

/* o mesmo contato da politica do site (src/data/site.js) */
const EMAIL = 'contato@lwnengenharia.com.br'
const TELEFONE = '+55 11 4116-9210'
const TELEFONE_LINK = 'tel:+551141169210'

/**
 * Politica de privacidade do Atmosfera LWN, a plataforma interna.
 *
 * Escrita para a LGPD (Lei 13.709/2018) e fiel ao que o sistema faz:
 * a sessao fica no armazenamento local do navegador (nao em cookie),
 * nao ha ferramenta de analise ligada, o clima e o transito sao
 * consultas sem dado pessoal. Mudou o que o sistema coleta? Mude aqui
 * e a data de atualizacao.
 */
export default function Privacy() {
  return (
    <main className="privacy">
      <ThemeToggle />
      <div className="privacy__inner">
        <Link className="privacy__back" to="/login">
          ← Voltar para o login
        </Link>

        <h1 className="privacy__title">Política de privacidade</h1>
        <p className="privacy__updated">Última atualização: 23 de outubro de 2026</p>

        <section>
          <p>
            O Atmosfera LWN é a plataforma interna de gestão do Grupo LWN Engenharia (LWN Engenharia / LWN Team
            Análise), de uso restrito a colaboradores e pessoas autorizadas pela empresa. Esta política explica quais
            dados pessoais são tratados na plataforma, para quais finalidades, com quem podem ser compartilhados e
            quais são os seus direitos, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº
            13.709/2018 — LGPD).
          </p>
        </section>

        <section>
          <h2>1. Quem é o controlador</h2>
          <p>
            O Grupo LWN Engenharia é o controlador dos dados pessoais tratados no Atmosfera LWN e responde pelas
            decisões sobre esse tratamento. Os canais de contato estão no item 11.
          </p>
        </section>

        <section>
          <h2>2. Dados que tratamos</h2>
          <ul>
            <li>
              <strong>Cadastro e conta:</strong> nome, e-mail, CPF, data de nascimento, telefone, foto de perfil,
              setor e cargo. A senha é guardada de forma criptografada e nunca em texto legível.
            </li>
            <li>
              <strong>Acesso e segurança:</strong> registros de entrada no sistema e de tentativas de acesso, com
              data, hora e dados técnicos da conexão (como endereço IP e navegador), e o histórico de atividades —
              quem fez cada alteração e quando.
            </li>
            <li>
              <strong>Trabalho nas obras:</strong> checks marcados, prazos, observações, mensagens de chat, anexos,
              participação nas obras e as avaliações das obras em que você participou.
            </li>
            <li>
              <strong>Presença:</strong> se o sistema está aberto, em segundo plano ou fechado no seu dispositivo,
              exibido para a equipe na tela de Usuários.
            </li>
            <li>
              <strong>Reembolso:</strong> despesas, refeições e bônus enviados, com data, cliente, valores e os
              comprovantes anexados.
            </li>
            <li>
              <strong>Frotas:</strong> saídas e devoluções de veículos, com condutor, quilometragem, data, horário,
              destino, respostas do checklist e fotos do veículo.
            </li>
            <li>
              <strong>Comercial:</strong> dados de contatos de clientes (nome, e-mail, telefone e empresa) e os
              e-mails enviados pela plataforma.
            </li>
            <li>
              <strong>Conta Microsoft:</strong> ao entrar com a conta Microsoft (Outlook), recebemos os dados básicos
              de identificação da conta. No Comercial, quando autorizado, o sistema envia e-mails pela sua caixa e
              verifica as respostas dos contatos dos negócios.
            </li>
            <li>
              <strong>Notificações no celular:</strong> se você ativá-las, guardamos os dados técnicos necessários para
              entregá-las no seu dispositivo.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Para que usamos os dados</h2>
          <ul>
            <li>criar e manter a sua conta e controlar o acesso conforme as permissões do seu setor;</li>
            <li>organizar e registrar o trabalho nas obras, os prazos e a comunicação da equipe;</li>
            <li>processar reembolsos, refeições e bônus;</li>
            <li>gerir a frota e manter a rastreabilidade do uso dos veículos;</li>
            <li>conduzir o relacionamento comercial com clientes;</li>
            <li>avaliar a qualidade dos serviços prestados nas obras;</li>
            <li>garantir a segurança da plataforma, prevenir fraudes e manter registros de auditoria;</li>
            <li>cumprir obrigações legais, trabalhistas, fiscais e regulatórias.</li>
          </ul>
        </section>

        <section>
          <h2>4. Bases legais</h2>
          <p>
            Tratamos os dados com base no art. 7º da LGPD: execução do contrato de trabalho ou de prestação de
            serviços; cumprimento de obrigação legal ou regulatória; legítimo interesse do Grupo LWN Engenharia na
            organização, segurança e auditoria das suas atividades, sempre respeitando os seus direitos; exercício
            regular de direitos; e consentimento, quando exigido — por exemplo, para notificações no celular —, que
            pode ser revogado a qualquer momento.
          </p>
        </section>

        <section>
          <h2>5. Armazenamento no navegador e cookies</h2>
          <p>
            A sua sessão fica guardada no armazenamento local do navegador, para que você continue conectado quando
            escolher &ldquo;Manter conectado&rdquo;. Também guardamos ali preferências como tema, filtros e a sua
            escolha no aviso de cookies. Esses dados ficam só no seu dispositivo: a sessão é apagada quando você sai
            do sistema, e todo o resto pode ser apagado limpando os dados do site no navegador.
          </p>
          <p>
            Atualmente a plataforma não utiliza ferramentas de análise, publicidade ou rastreamento. Se passar a
            utilizá-las, isso só acontecerá com o seu consentimento, dado no aviso exibido no primeiro acesso.
          </p>
          <p>
            Algumas funcionalidades usam serviços de terceiros que não recebem dados pessoais seus: as fontes
            tipográficas (Google Fonts), a previsão do tempo e as condições de trânsito exibidas no sistema.
          </p>
        </section>

        <section>
          <h2>6. Quem tem acesso e compartilhamento</h2>
          <p>
            Dentro da empresa, cada pessoa vê apenas o que as permissões do seu setor permitem. Não vendemos nem
            alugamos dados pessoais. Eles podem ser compartilhados somente quando necessário:
          </p>
          <ul>
            <li>
              com fornecedores que mantêm a plataforma funcionando — hospedagem, banco de dados, e-mail e
              autenticação (como a Microsoft) —, que tratam os dados conforme as nossas instruções e com obrigações de
              confidencialidade e segurança;
            </li>
            <li>com autoridades públicas, por obrigação legal, ordem judicial ou requisição de autoridade competente;</li>
            <li>na defesa de direitos em processos judiciais, administrativos ou arbitrais.</li>
          </ul>
        </section>

        <section>
          <h2>7. Transferência internacional</h2>
          <p>
            Alguns fornecedores de tecnologia armazenam ou processam dados fora do Brasil. Nesses casos, a
            transferência ocorre apenas nas hipóteses permitidas pela LGPD e com salvaguardas adequadas de proteção.
          </p>
        </section>

        <section>
          <h2>8. Segurança</h2>
          <p>
            Adotamos medidas técnicas e administrativas para proteger os dados, como conexão criptografada, senhas
            armazenadas de forma criptografada, controle de acesso por permissões e registro das atividades realizadas
            na plataforma. Se ocorrer um incidente de segurança que possa trazer risco ou dano relevante aos
            titulares, adotaremos as providências previstas na LGPD, incluindo as comunicações cabíveis.
          </p>
        </section>

        <section>
          <h2>9. Por quanto tempo guardamos os dados</h2>
          <p>
            Mantemos os dados enquanto durar o vínculo com a empresa e, depois disso, pelos prazos exigidos em lei e
            em normas regulatórias ou pelo tempo necessário ao exercício regular de direitos. Os registros das obras,
            reembolsos e da frota podem ser mantidos como histórico da empresa. Encerrados esses prazos, os dados são
            eliminados ou anonimizados.
          </p>
        </section>

        <section>
          <h2>10. Os seus direitos</h2>
          <p>Nos termos do art. 18 da LGPD, você pode solicitar a qualquer momento:</p>
          <ul>
            <li>a confirmação de que tratamos os seus dados e o acesso a eles;</li>
            <li>a correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>
              a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em
              desconformidade com a LGPD;
            </li>
            <li>a portabilidade dos dados, observadas as normas aplicáveis;</li>
            <li>informações sobre com quem os seus dados são compartilhados;</li>
            <li>a revogação do consentimento e a eliminação dos dados tratados com base nele.</li>
          </ul>
          <p>
            Parte dos seus dados de cadastro pode ser atualizada por você mesmo em Configurações. Você também pode
            apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
          </p>
        </section>

        <section>
          <h2>11. Como falar conosco</h2>
          <p>
            Para exercer os seus direitos ou tirar dúvidas sobre esta política, entre em contato pelo e-mail{' '}
            <a href={`mailto:${EMAIL}`}>{EMAIL}</a> ou pelo telefone <a href={TELEFONE_LINK}>{TELEFONE}</a>. Esse é
            também o canal do encarregado pelo tratamento de dados pessoais. Para a sua segurança, poderemos confirmar
            a sua identidade antes de atender ao pedido, e responderemos nos prazos previstos na legislação.
          </p>
        </section>

        <section>
          <h2>12. Alterações desta política</h2>
          <p>
            Esta política pode ser atualizada para refletir mudanças na plataforma ou na legislação. A data da última
            atualização fica sempre no topo desta página.
          </p>
        </section>
      </div>
    </main>
  )
}
