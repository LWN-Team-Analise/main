// States where LWN provides services, in the order the Clientes globe visits
// them. In São Paulo and Goiás the marker is the LWN office itself (the same
// pins as "Onde encontrar"); elsewhere the state capital.
// `zoom` is how close the camera gets to the state.
export const ROUTE = [
  { uf: 'SP', name: 'São Paulo', lat: -23.5146589, lon: -46.6260394, zoom: 3.7 },
  { uf: 'GO', name: 'Goiás', lat: -16.3346432, lon: -48.9493138, zoom: 3.3 },
  { uf: 'RJ', name: 'Rio de Janeiro', lat: -22.91, lon: -43.2, zoom: 3.9 },
  { uf: 'MG', name: 'Minas Gerais', lat: -19.92, lon: -43.94, zoom: 3.2 },
  { uf: 'PR', name: 'Paraná', lat: -25.43, lon: -49.27, zoom: 3.5 },
  { uf: 'PE', name: 'Pernambuco', lat: -8.05, lon: -34.9, zoom: 3.3 },
];
