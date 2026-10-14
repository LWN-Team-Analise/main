import outlookLogo from '@/assets/outlook.png'
import './SocialRow.css'

/**
 * A outra porta de entrada: a conta Microsoft da empresa.
 *
 * A logo entra como imagem, nas cores originais da Microsoft. Ela ja e
 * uma marca conhecida — pintada de azul do sistema virava so mais um
 * icone, e a pessoa deixava de reconhecer de imediato onde clicar.
 */
export default function SocialRow({ onSelect, ocupado = false, rotulo = 'Entrar com Outlook' }) {
  return (
    <div className="social">
      <div className="social__divider">
        <span>ou entre com</span>
      </div>
      <div className="social__list">
        <button
          type="button"
          className="social__btn"
          aria-label={rotulo}
          title={rotulo}
          disabled={ocupado}
          onClick={() => onSelect?.('outlook')}
        >
          <img className="social__logo" src={outlookLogo} alt="" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
