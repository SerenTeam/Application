// Serveurs éphémères de supertest liés à 127.0.0.1 — corrige les « expected 404 to be … » aléatoires
// de la suite complète sur macOS (garde-fou : tests/supertest-loopback.test.ts).
//
// Pour chaque requête, supertest crée un serveur, l'écoute avec listen(0) — donc sur `::`, en double
// pile — puis l'appelle sur http://127.0.0.1:<port>. Or macOS attribue les ports éphémères dans
// l'ordre (net.inet.tcp.randomize_ports=0) et, pour un bind `::`, n'écarte pas un port déjà tenu en
// IPv4 (127.0.0.1 ou 0.0.0.0) par un autre socket — en pratique un autre process de la machine. Notre
// serveur reçoit alors ce même port, et le noyau livre la connexion vers 127.0.0.1 au listener IPv4,
// plus spécifique : la requête part chez un inconnu (serveur de dev, endpoint de debug…) qui répond
// 404. Plus la suite balaie de ports (≈ 1 600 par passe), plus le risque monte — d'où un échec qui
// n'apparaît qu'en suite complète. Le keep-alive n'y est pour rien : superagent crée un agent
// jetable par requête (agent: false).
//
// Correctif : écouter sur 127.0.0.1 exactement — le noyau n'y attribue plus un port déjà tenu, et un
// listener 127.0.0.1 est de toute façon le plus spécifique pour une connexion vers 127.0.0.1. Seul
// changement visible par l'app testée : l'adresse du client devient 127.0.0.1 (et non
// ::ffff:127.0.0.1). Le bind doit rester SYNCHRONE, car supertest lit le port dès son constructeur :
// listen(0, '127.0.0.1') ne se lie qu'au tick suivant (résolution de l'hôte), on appelle donc
// _listen2, ce que listen() exécute après cette résolution. Alias interne que Node conserve exprès
// (« to avoid breaking code that wraps this method ») ; s'il disparaît, ce setup échoue bruyamment.
// Tout le reste du cycle supertest (envoi, redirections, erreurs, fermeture) est inchangé.
import type { Server } from 'node:http'
import request from 'supertest'

type TestInternals = InstanceType<typeof request.Test> & { _server?: Server }
type Listen2 = (address: string, port: number, addressType: 4 | 6) => void

const PATCHED = Symbol.for('seren.supertest-loopback')
const proto = request.Test.prototype as TestInternals & { [PATCHED]?: true }

function listenOnLoopback(server: Server) {
  const listen2 = (server as unknown as { _listen2?: Listen2 })._listen2
  if (typeof listen2 !== 'function') {
    throw new Error(
      `tests/setup/supertest-loopback.ts : net.Server#_listen2 absent de Node ${process.version} — ` +
        'retrouver un bind synchrone sur 127.0.0.1 avant de réactiver les tests supertest',
    )
  }
  listen2.call(server, '127.0.0.1', 0, 4)
}

if (!proto[PATCHED]) {
  proto[PATCHED] = true
  const originalServerAddress = proto.serverAddress

  proto.serverAddress = function (this: TestInternals, app: Server, path: string) {
    if (!app.address()) {
      listenOnLoopback(app)
      this._server = app // comme supertest : le serveur qu'il a ouvert est refermé après la réponse
    }
    return originalServerAddress.call(this, app, path)
  }
}
