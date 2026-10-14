/**
 * Cargos e usuarios (server/routes/equipe.js).
 *
 * Colaborador novo entra com uma senha temporária gerada automaticamente
 * e com senha_temporaria ligado: o sistema cobra a troca no primeiro acesso.
 *
 * A senha temporária é gerada pelo servidor e devolvida na resposta do
 * cadastro para ser mostrada ao administrador.
 */

import { del, get, patch, post } from './api'

/* ---------------- Cargos ---------------- */

export async function carregarCargos() {
  const { cargos } = await get('/equipe/cargos')
  return cargos ?? []
}

export async function criarCargo(campos) {
  const { cargo } = await post('/equipe/cargos', campos)
  return cargo
}

export async function editarCargo(id, campos) {
  const { cargo } = await patch(`/equipe/cargos/${id}`, campos)
  return cargo
}

export const apagarCargo = (id) => del(`/equipe/cargos/${id}`)

/* ---------------- Cargos ----------------

   Aqui e o CARGO da pessoa ("Analista de Qualidade") — o cadastro
   proprio dele, sem cor e sem permissao. Nao confundir com as funcoes
   acima, que sao o SETOR (tabela `cargo` no banco). */

export async function carregarTitulos() {
  const { titulos } = await get('/equipe/titulos')
  return titulos ?? []
}

export async function criarTitulo(campos) {
  const { titulo } = await post('/equipe/titulos', campos)
  return titulo
}

export async function editarTitulo(id, campos) {
  const { titulo } = await patch(`/equipe/titulos/${id}`, campos)
  return titulo
}

export const apagarTitulo = (id) => del(`/equipe/titulos/${id}`)

/* ---------------- Usuarios ---------------- */

export async function carregarUsuarios() {
  const { usuarios } = await get('/equipe/usuarios')
  return usuarios ?? []
}

/** Setores + cargos + usuarios de uma vez, para a carga inicial. */
export async function carregarEquipe() {
  const [cargos, titulos, usuarios] = await Promise.all([
    carregarCargos(),
    /* cadastro novo: num banco sem a atualizacao-4 ele volta vazio e o
       resto da carga segue normalmente */
    carregarTitulos().catch(() => []),
    carregarUsuarios(),
  ])
  return { cargos, titulos, usuarios }
}

export async function criarUsuario(campos) {
  const resposta = await post('/equipe/usuarios', campos)
  return resposta
}

/**
 * Edita o cadastro. O CPF de OUTRA pessoa so passa se quem esta logado
 * for da diretoria — a API recusa para todo o resto. O proprio, cada um
 * preenche e corrige.
 */
export async function editarUsuario(id, campos) {
  const { usuario } = await patch(`/equipe/usuarios/${id}`, campos)
  return usuario
}

export const apagarUsuario = (id) => del(`/equipe/usuarios/${id}`)

/**
 * A foto INTEIRA da pessoa — a que o editor de enquadramento usa para
 * reenquadrar sem recortar o recorte anterior.
 *
 * Ela nao vem na carga da equipe de proposito: e pesada e serve a um
 * clique so.
 */
export async function carregarFotoOriginal(id) {
  const { fotoOriginal } = await get(`/equipe/usuarios/${id}/foto`)
  return fotoOriginal ?? null
}

/* ---------------- Senha ---------------- */

export const trocarSenha = (atual, nova) => post('/auth/senha', { atual, nova })
