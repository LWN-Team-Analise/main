/* Os dados da empresa no cabecalho da folha. Saem do que o site ja
   publica (src/data): a razao social e o CNPJ de src/data/legal.js,
   quando preenchidos, e o endereco do escritorio de Sao Paulo. O CNPJ
   que vem no arquivo do ponto tem a preferencia: e o da empresa que
   registrou as marcacoes. */
import { legal } from '../../../../src/data/legal'
import { company, offices } from '../../../../src/data/site'

const saoPaulo = offices.find((o) => o.id === 'saoPaulo') ?? offices[0]

export function empresaDaFolha(funcionario) {
  return {
    nome: legal.razaoSocial || company.name,
    cnpj: funcionario?.cnpj || legal.cnpj || '',
    cep: saoPaulo?.zip ?? '',
    endereco: saoPaulo ? `${saoPaulo.street} - ${saoPaulo.region}` : '',
  }
}
