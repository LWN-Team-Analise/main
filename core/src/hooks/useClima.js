import { useEffect, useState } from 'react'

/**
 * O tempo agora, em Santana (zona norte de Sao Paulo).
 *
 * A faixa da pagina inicial mostrava um sol desenhado, fixo. Num dia de
 * chuva ele mentia — e um enfeite que mente e pior que enfeite nenhum.
 * Agora o icone e a temperatura vem do tempo de verdade.
 *
 * A fonte e a Open-Meteo. Ela foi escolhida por dois motivos praticos:
 * nao pede chave de API (nada a cadastrar, nada a vencer, nada a
 * esconder no .env) e responde direto ao navegador, com CORS liberado.
 * Nao vai dado nenhum do usuario na chamada — so as coordenadas fixas
 * daqui de baixo.
 *
 * Quando a chamada falha (sem internet, servico fora), o hook devolve
 * `null` e a faixa volta a mostrar so o desenho neutro. O dia da pessoa
 * nao pode depender de um servico de previsao do tempo.
 */

/* Santana, Sao Paulo - SP. Trocar de bairro e trocar estes dois
   numeros — a API resolve o resto (ela devolve o ponto de grade mais
   proximo, por isso a resposta vem com coordenadas um pouco diferentes). */
const LATITUDE = -23.5015
const LONGITUDE = -46.625

const ENDERECO =
  `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
  '&current=temperature_2m,weather_code,is_day' +
  '&daily=temperature_2m_max,temperature_2m_min' +
  '&timezone=America%2FSao_Paulo&forecast_days=1'

/* A previsao nao muda de minuto em minuto, e a faixa remonta a cada
   troca de aba. Guardar por 15 minutos evita repetir a chamada sem
   necessidade — e a promessa e que fica guardada, para duas montagens
   no mesmo instante nao dispararem dois pedidos. */
const VALIDADE = 15 * 60 * 1000
let cache = { quando: 0, promessa: null }

function buscar() {
  const agora = Date.now()
  if (cache.promessa && agora - cache.quando < VALIDADE) return cache.promessa

  cache = {
    quando: agora,
    promessa: fetch(ENDERECO)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('sem resposta'))))
      .then((d) => ({
        temperatura: Math.round(d.current.temperature_2m),
        maxima: Math.round(d.daily.temperature_2m_max[0]),
        minima: Math.round(d.daily.temperature_2m_min[0]),
        codigo: d.current.weather_code,
        dia: d.current.is_day === 1,
      }))
      .catch(() => {
        /* falhou: limpa o cache para a proxima montagem tentar de novo,
           em vez de herdar o erro pelos proximos 15 minutos */
        cache = { quando: 0, promessa: null }
        return null
      }),
  }
  return cache.promessa
}

export default function useClima() {
  const [clima, setClima] = useState(null)

  useEffect(() => {
    let vivo = true
    buscar().then((d) => vivo && setClima(d))
    return () => {
      vivo = false
    }
  }, [])

  return clima
}

/**
 * O codigo WMO vira um dos nossos desenhos.
 *
 * A tabela da Organizacao Meteorologica Mundial tem umas trinta
 * situacoes, e desenhar trinta icones seria trocar clareza por
 * variedade: "garoa leve" e "garoa moderada" pedem a mesma figura.
 * Aqui elas caem em nove familias, que e o que se distingue de relance
 * num icone de 46 pixels.
 */
export function familiaDoTempo(codigo, dia = true) {
  if (codigo === 0) return dia ? 'sol' : 'lua'
  if (codigo === 1 || codigo === 2) return dia ? 'sol-nuvem' : 'lua-nuvem'
  if (codigo === 3) return 'nuvem'
  if (codigo === 45 || codigo === 48) return 'neblina'
  if (codigo >= 51 && codigo <= 57) return 'garoa'
  if ((codigo >= 61 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) return 'chuva'
  if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return 'neve'
  if (codigo >= 95) return 'tempestade'
  return dia ? 'sol' : 'lua'
}

/** O nome da situacao, para a dica do icone e para quem usa leitor de tela. */
export function nomeDoTempo(codigo) {
  const mapa = {
    0: 'Céu limpo',
    1: 'Predominantemente limpo',
    2: 'Parcialmente nublado',
    3: 'Encoberto',
    45: 'Névoa',
    48: 'Névoa com geada',
    51: 'Garoa fraca',
    53: 'Garoa',
    55: 'Garoa forte',
    56: 'Garoa congelante',
    57: 'Garoa congelante forte',
    61: 'Chuva fraca',
    63: 'Chuva',
    65: 'Chuva forte',
    66: 'Chuva congelante',
    67: 'Chuva congelante forte',
    71: 'Neve fraca',
    73: 'Neve',
    75: 'Neve forte',
    77: 'Grãos de neve',
    80: 'Pancadas de chuva',
    81: 'Pancadas de chuva',
    82: 'Pancadas fortes de chuva',
    85: 'Pancadas de neve',
    86: 'Pancadas fortes de neve',
    95: 'Tempestade',
    96: 'Tempestade com granizo',
    99: 'Tempestade com granizo',
  }
  return mapa[codigo] ?? 'Tempo'
}
