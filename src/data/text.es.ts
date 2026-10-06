/** Every text the player reads. All the game is in Spanish; names of the places and teams live here to change them in one spot. */
export const T_ES = {
  title: 'Fútbol Familia GG',
  teams: { family: 'Familia GG', dragon: 'Dragoncitos', tiburon: 'Tiburoncitos', buho: 'Búhos', mapache: 'Mapachitos' } as Record<string, string>,
  specials: {
    arcoiris: '¡TIRO ARCOÍRIS!', burbuja: '¡BALÓN BURBUJA!', canonazo: '¡CAÑONAZO!', estrellas: '¡ESTRELLAS GUÍA!', carrera: '¡CARRERA LOCA!', relampago: '¡RAYO 21!',
    llamarada: '¡LLAMARADA!', ola: '¡OLA GIGANTE!', picada: '¡PICADA DEL VIENTO!', hojas: '¡REMOLINO DE HOJAS!',
  } as Record<string, string>,
  banners: { goal: '¡GOOOL!', throwin: '¡Saque de banda!', goalkick: '¡Saque de arco!', corner: '¡Córner!', freekick: '¡Tiro libre!', freekickFull: 'Sube y baja la mira, empuja hacia el arco para dar efecto y toca Tiro cuando diga ¡AHORA!', freekickEasy: 'Mueve la mira y toca Tiro', halftime: '¡Medio tiempo!', final: '¡Se acabó!', far: '¡Acércate más!', help: '', save: '¡Atajada!', post: '¡Al palo!' },
  hud: { half1: '1T', half2: '2T' },
  hints: { star: '¡Especial listo!' },
  result: {
    title: '¡Fin del partido!', win: '¡Qué partidazo, ganaron!', draw: '¡Empate! ¡Qué partidazo!', lose: '¡Casi casi! ¡La revancha es tuya!', again: 'Otra vez', menu: 'Menú', mvp: 'La mejor',
    goals: (n: number) => (n === 1 ? '1 gol' : `${n} goles`),
  },
  menu: {
    heading: 'Fútbol Familia GG', sub: 'Prueba del primer partido', players: 'Jugadores', one: '1 jugador', two: '2 juntos', controls: 'Controles', easy: 'Fáciles', full: 'Completos',
    rival: 'Rival', tranquilos: 'Tranquilos', normales: 'Normales', campeones: 'Campeones', time: 'Tiempo', short: '1:00', normal: '1:30', long: '2:00', play: '¡Jugar!', fullscreen: 'Pantalla completa',
    p1: 'Jugador 1', p2: 'Jugador 2', rest: 'Descansa',
    chars: { papa: 'Papá', mama: 'Mamá', sophie: 'Sophie', alana: 'Alana', juandi: 'Juandi' } as Record<string, string>,
  },
  pause: { title: 'Pausa', resume: 'Seguir jugando', fullscreen: 'Pantalla completa', quit: 'Salir al menú' },
};
