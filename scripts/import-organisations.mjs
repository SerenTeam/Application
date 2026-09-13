#!/usr/bin/env node
// Import de l'annuaire des organismes (chantier 2a — envoi papier), Task 2 du plan
// docs/plan-chantier-2a-envoi-papier.md. Zéro dépendance (fetch natif Node ≥ 18).
//
// Source : Annuaire de l'administration (DILA / service-public.fr), licence ouverte.
// API réelle explorée le 2026-09-13 (lecture seule, aucune écriture) :
//   https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records
//
// ── Trouvailles de l'exploration (à relire avant de modifier ce script) ────────────
//
// Pagination : Opendatasoft Explore API v2.1. `limit` max = 100 par page (rejeté
// au-delà, HTTP 400 « -1 <= limit <= 100 »). Pagination par `offset`, jusqu'à
// `total_count` (aucune des 4 requêtes réseau ci-dessous ne dépasse ~750 lignes —
// largement sous la limite habituelle d'offset des API Opendatasoft).
//
// Champ de type d'organisme : PAS un champ dédié — c'est `pivot`, une chaîne JSON
// (à parser) de la forme `[{"type_service_local": "<code>", "code_insee_commune":
// ["<insee>"]}]`. Valeurs exactes trouvées par sondage (`where=pivot like "\"type_
// service_local\": \"<code>\""`, comparé à une recherche « loose » sans guillemets
// pour écarter tout faux-positif de sous-chaîne — les deux comptes concordent
// exactement pour les 4 réseaux, aucune collision) :
//   - CAF                              → "caf"     (466 fiches)
//   - CPAM                             → "cpam"    (740 fiches)
//   - Centres des impôts des particuliers (SIP) → "sip" (497 fiches)
//   - CARSAT / CGSS / CNAV IdF         → "carsat"  (20 fiches SEULEMENT — voir
//     § CARSAT ci-dessous, PAS un réseau départemental)
//
// Champ adresse : `adresse`, chaîne JSON (à parser) — liste d'objets typés par
// `type_adresse` ("Adresse" = accueil physique, "Adresse postale" = adresse de
// correspondance avec boîte Cedex/CS/BP le cas échéant). Champs par entrée :
// `complement1`, `complement2` (compléments d'identification — répètent quasi
// toujours le nom de l'organisme, cf. décision ci-dessous), `numero_voie`,
// `service_distribution` (mention spéciale de distribution : CS/BP/Cedex),
// `code_postal`, `nom_commune`. On privilégie "Adresse postale" (repli sur
// "Adresse" si absente) : c'est l'adresse de correspondance, celle qui doit
// recevoir un courrier papier.
//
// Champ département / pivot territorial : PAS de champ « département » direct.
// Dérivé de `code_insee_commune` (5 caractères) : Corse → 2 premiers caractères
// ("2A"/"2B" déjà en majuscules dans la donnée) ; DOM/COM (préfixe "97"/"98") →
// 3 premiers caractères (971, 972, 973, 974, 976, 978…) ; métropole → 2 premiers
// caractères. Vérifié empiriquement : CAF (100 départements distincts), CPAM (99),
// SIP (102) — tous largement au-dessus du garde-fou de 90. AUCUN champ ne donne
// directement la circonscription territoriale complète d'un organisme régional
// (cf. CARSAT).
//
// § CARSAT — écart au garde-fou générique, documenté comme demandé par le plan :
// l'API ne renvoie que 20 fiches pour "carsat" (15 Carsat régionales métropole +
// Île-de-France sous le nom "Cnav" + 4 CGSS ultramarines), CHACUNE couvrant
// PLUSIEURS départements (ex. Carsat Midi-Pyrénées : Ariège, Aveyron, Haute-Garonne,
// Gers, Lot, Hautes-Pyrénées, Tarn, Tarn-et-Garonne). Le champ `code_insee_commune`
// ne donne que la commune du SIÈGE régional, jamais la liste des départements
// couverts — aucun champ de l'API ne la fournit. Fabriquer cette liste à la main
// (mapping région → départements) introduirait une donnée NON sourcée par l'API
// dans un annuaire dont la fiabilité conditionne l'adressage de vrais courriers :
// risque explicitement exclu par la consigne « jamais inventer une adresse posale »
// (élargie ici à la donnée de routage territoriale). Décision actée pour ce script :
//   1. Garde-fou adapté pour ce réseau : ≥ 15 fiches attendues (constaté : 20),
//      au lieu de ≥ 90 départements pour les 3 autres réseaux.
//   2. `department` = NULL pour les fiches carsat (colonne nullable, cf. migration
//      Task 1 et docs/design-chantier-2a-envoi-papier.md §3.3).
//   3. `id` = `carsat-<slug-de-la-région>` (ex. `carsat-midi-pyrenees`,
//      `carsat-idf`, `carsat-cgss-la-reunion`) au lieu de `<network>-<department>` —
//      documenté ici plutôt que de forcer un slug départemental trompeur.
// ⚠️ Conséquence pour la suite (à signaler, hors périmètre Task 2) : la résolution
// « network + department » prévue en Task 9 pour le canal papier NE POURRA PAS
// retrouver un CARSAT via le département du défunt tant qu'un mapping région→
// départements vérifié (sourcé sur les sites officiels des Carsat, pas deviné)
// n'aura pas été ajouté séparément. Les 20 fiches sont seedées ici comme données
// de référence, mais restent injoignables par ce chemin de résolution en l'état.
//
// Décision de contenu des lignes d'adresse (address_line1/2) : les champs
// `complement1`/`complement2` de l'« Adresse postale » DILA répètent quasi
// systématiquement le nom de l'organisme (déjà stocké dans `name`) — les inclure
// systématiquement ferait dépasser la limite de 45 caractères pour de nombreuses
// entrées SANS ajouter d'information utile à la distribution (une adresse Cedex/CS
// se route sur la boîte, pas sur le nom du destinataire). On construit donc
// address_line1/2 EN PRIORITÉ à partir de `numero_voie` et `service_distribution`
// (les deux lignes réellement nécessaires à la distribution, norme AFNOR NF Z10-011
// lignes 3 et 4). Repli documenté : quand ces deux champs sont vides (cas réel et
// fréquent des grandes administrations à code Cedex dédié — ex. CPAM de Paris :
// "Adresse postale" = { code_postal: 75948, nom_commune: "Paris Cedex 19" }, AUCUN
// numero_voie ni service_distribution), on retombe sur `complement1`/`complement2`
// (le nom de l'organisme devient alors la seule ligne d'adresse disponible et
// nécessaire). Troisième repli, pour les organismes dont le nom légal complet
// dépasse À LUI SEUL 45 caractères (fréquent : « Caisse primaire d'assurance
// maladie de Gironde » = 47 car., « ... de la Seine-Saint-Denis », etc.) : forme
// courte à sigle `<SIGLE> <suffixe>` dérivée MÉCANIQUEMENT du sigle déjà présent
// entre parenthèses dans le nom source (ex. "(CPAM)", "(Caf)") — sourcé (c'est le
// sigle que l'organisme utilise lui-même dans son nom publié par la DILA), pas
// inventé. Rejet uniquement si aucun des trois n'entre sur 2×45 caractères (ex.
// caf-17 aurait été rejeté sur ce chemin si les accueils voisins n'avaient pas
// fourni une vraie "Adresse postale" plus courte — cf. décision suivante).
//
// Sélection d'une fiche par (réseau, département) : chaque réseau départemental a
// souvent plusieurs fiches par département (accueils, permanences, services
// internes — ex. CPAM Vendée : 6 fiches pour un seul département). Algorithme :
//   1. Sous-ensemble « adresse de correspondance authentique » = fiches ayant une
//      VRAIE entrée "Adresse postale" (pas seulement "Adresse", l'accueil physique)
//      — repli sur le groupe complet seulement si aucune fiche n'en a. Nécessaire
//      car une fiche "siège" peut avoir une donnée source de moins bonne qualité
//      qu'un accueil voisin : constaté sur caf-17, où le siège de La Rochelle n'a
//      qu'une "Adresse" au code postal fautif ("170000", 6 chiffres — coquille dans
//      la donnée DILA) alors que les 5 accueils du département portent la vraie
//      "Adresse postale" (17073 La Rochelle Cedex 9).
//   2. Sous-ensemble « préféré » = fiches dont le nom contient "siège" OU ne
//      contient aucun suffixe " - " (répertoire hétérogène : ce filtre ne matche
//      rien pour les SIP, dont le nom de base inclut toujours une ville — dans ce
//      cas on retombe directement sur l'étape 3, ce qui est le comportement voulu).
//   3. Parmi le sous-ensemble (préféré si non vide, sinon l'étape 1) : adresse
//      postale la plus fréquente (mode) — les accueils d'un même organisme
//      partagent presque toujours la même boîte Cedex départementale (vérifié sur
//      CPAM Vendée : 6/6 fiches, même adresse postale à la lettre près).
//   4. Départage déterministe : nom le plus court puis ordre alphabétique.
// Le nom canonique retenu = préfixe du nom de la fiche gagnante avant " - ".
//
// Filtre nom-attendu (avant tout regroupement) : une poignée de fiches « point
// d'accueil » sont enregistrées sous le nom de leur structure hôte plutôt que celui
// de l'organisme réseau (rencontré une fois : "Centre Social Croix-Rouge Château
// Gombert – Point d'accueil Caf – Marseille", dept. 13) — un nom pareil, retenu
// comme représentant du département, produirait un `name` et une adresse courte
// absurdes. Filtré par simple préfixe attendu par réseau ("Caisse" pour caf/cpam —
// couvre aussi les équivalents DOM légitimes CGSS/CSSM ; "Service des" pour les
// SIP), vérifié exhaustivement le 2026-09-13 : 1/466 fiches caf, 0/497 fiches sip
// concernées (les 44/740 fiches cpam qui ne commencent pas par le nom métropolitain
// standard sont TOUTES des CGSS/CSSM ultramarines légitimes, donc conservées par ce
// filtre volontairement large).
//
// § LIMITE CONNUE (impots/SIP), à signaler — hors périmètre de correction Task 2 :
// contrairement à caf/cpam (un seul organisme par département, plusieurs accueils
// qui partagent la même adresse postale départementale), un département peut avoir
// PLUSIEURS SIP distincts et non redondants (ex. Rhône/69 : 10 SIP, une adresse
// différente chacun — Lyon 1, Lyon 2, Villeurbanne, Caluire-et-Cuire...). Le
// questionnaire (Task 3) ne capture que le DÉPARTEMENT du défunt, jamais sa
// commune : il n'existe donc aucun moyen, avec cette seule granularité, de savoir
// QUEL SIP est le bon pour un contribuable donné. Ce script retient un seul SIP par
// département (déterministe : cf. algorithme de sélection ci-dessous), mais c'est
// une approximation VOLONTAIREMENT DOCUMENTÉE plutôt qu'une réponse correcte pour
// les départements multi-SIP — le nom complet retenu (avec la ville, jamais
// tronqué contrairement à caf/cpam) rend au moins cette approximation visible
// plutôt que de la maquiller derrière un nom générique. Une vraie correction
// demanderait une granularité plus fine (commune/code postal) dans le
// questionnaire ou à la résolution d'adresse (Task 9) — décision produit, pas
// technique, à trancher avant l'envoi réel de courriers destinés aux impôts.
//
// Garde-fous (Step 2.2 du plan) : ≥ 90 départements distincts par réseau
// départemental (caf/cpam/impots) après validation des CHECK, sinon exit 1 ;
// carsat : ≥ 15 fiches (cf. § CARSAT) ; regex CP (`^[0-9]{5}$`) et département
// (`^(2A|2B|[0-9]{2,3})$`) revalidées ici (miroir des CHECK de la migration Task 1,
// `20260914100000_sender_profiles_organisations.sql`) ; tri déterministe par slug
// pour des diffs propres à chaque régénération.
//
// Usage : node scripts/import-organisations.mjs
//   → régénère supabase/migrations/20260914110000_organisations_seed.sql

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API_BASE =
  'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records';
const PAGE_LIMIT = 100;
const MIN_DEPARTMENTS_DEFAULT = 90;
const MIN_RECORDS_CARSAT = 15;
const MAX_LINE_LENGTH = 45;
const POSTAL_CODE_RE = /^[0-9]{5}$/;
const DEPARTMENT_RE = /^(2A|2B|[0-9]{2,3})$/;

// Réseaux départementaux « classiques » : network Seren -> code pivot DILA. Le
// `namePrefixRoot` filtre les fiches dont le nom ne commence pas par le mot-racine
// attendu — nécessaire car quelques points d'accueil (rares, cf. § filtre plus
// bas) sont enregistrés sous le nom de leur STRUCTURE HÔTE (une association, un
// centre social...) plutôt que celui de l'organisme du réseau, ce qui les rend
// impropres à représenter tout un département. "Caisse" couvre aussi bien "Caisse
// d'allocations familiales (Caf)"/"Caisse primaire d'assurance maladie (CPAM)" que
// les variantes légitimes des DOM ("Caisse générale de sécurité sociale (CGSS)",
// "Caisse de sécurité sociale (CSSM) de Mayotte" — équivalents ultramarins du
// réseau, à ne pas exclure).
// `stripBranchSuffix` : pour caf/cpam, le suffixe " - X" d'une fiche désigne un
// ACCUEIL/UNE BRANCHE d'un même organisme départemental (ex. "... de Vendée -
// Challans") — on le retire pour obtenir le nom canonique du département. Pour les
// SIP (impots), ce même " - X" est au contraire L'IDENTITÉ PROPRE de l'office (ex.
// "SIP - Caluire-et-Cuire" ≠ "SIP - Lyon 1" : ce sont deux services distincts, pas
// deux accueils du même service) — le retirer produirait un nom générique et
// trompeur ("Service des impôts des particuliers (SIP)" tout court). Cf. §
// « limite connue » dans le header pour la conséquence produit de cette différence
// structurelle (plusieurs SIP par département, un seul retenu par département).
const DEPARTMENTAL_NETWORKS = [
  { network: 'caf', pivotCode: 'caf', namePrefixRoot: /^Caisse/i, stripBranchSuffix: true },
  { network: 'cpam', pivotCode: 'cpam', namePrefixRoot: /^Caisse/i, stripBranchSuffix: true },
  { network: 'impots', pivotCode: 'sip', namePrefixRoot: /^Service des/i, stripBranchSuffix: false },
];

const OUTPUT_MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../supabase/migrations/20260914110000_organisations_seed.sql',
);

/** GET une page de l'API DILA, avec un unique retry sur erreur réseau/HTTP. */
async function fetchPage(where, offset, attempt = 0) {
  const url = `${API_BASE}?${new URLSearchParams({
    where,
    limit: String(PAGE_LIMIT),
    offset: String(offset),
  })}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    if (attempt >= 1) throw err;
    await new Promise((r) => setTimeout(r, 500));
    return fetchPage(where, offset, attempt + 1);
  }
  if (!res.ok) {
    if (attempt >= 1) {
      throw new Error(`DILA API HTTP ${res.status} pour ${url} : ${await res.text()}`);
    }
    await new Promise((r) => setTimeout(r, 500));
    return fetchPage(where, offset, attempt + 1);
  }
  return res.json();
}

/** Récupère toutes les fiches dont pivot.type_service_local === pivotCode. */
async function fetchAllByPivotCode(pivotCode) {
  // Recherche stricte sur la sous-chaîne JSON exacte (évite tout faux-positif de
  // sous-chaîne, cf. vérification "loose vs strict" dans le header ci-dessus).
  const where = `pivot like "\\"type_service_local\\": \\"${pivotCode}\\""`;
  let offset = 0;
  let all = [];
  let total = Infinity;
  while (offset < total) {
    const page = await fetchPage(where, offset);
    total = page.total_count;
    all = all.concat(page.results);
    offset += PAGE_LIMIT;
    if (offset < total) await new Promise((r) => setTimeout(r, 150)); // poli envers l'API publique
  }
  if (all.length !== total) {
    throw new Error(`Pagination incomplète pour pivot "${pivotCode}" : ${all.length}/${total} récupérées`);
  }
  return all;
}

function deptFromInsee(insee) {
  if (!insee) return null;
  if (insee.startsWith('2A') || insee.startsWith('2B')) return insee.slice(0, 2);
  if (insee.startsWith('97') || insee.startsWith('98')) return insee.slice(0, 3);
  return insee.slice(0, 2);
}

/** Empaquette des segments non vides sur au plus `maxLines` lignes de `maxLen`
 * caractères, sans jamais couper un segment en son milieu (jamais de troncature
 * de donnée réelle). Retourne `null` si ça ne tient pas (rejet, jamais de coupe
 * brutale) ou si un segment dépasse `maxLen` à lui seul. */
function packLines(parts, maxLen = MAX_LINE_LENGTH, maxLines = 2) {
  const nonEmpty = parts.map((p) => (p || '').trim()).filter(Boolean);
  if (nonEmpty.length === 0) return null;
  const lines = [];
  let current = '';
  for (const part of nonEmpty) {
    if (part.length > maxLen) return null; // segment isolé trop long : pas de coupe, rejet
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length <= maxLen) {
      current = candidate;
    } else {
      lines.push(current);
      current = part;
      if (lines.length >= maxLines) return null; // débordement au-delà des lignes disponibles
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0 || lines.length > maxLines) return null;
  return lines;
}

function parseJsonField(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function pickPostalAddress(record) {
  const addresses = parseJsonField(record.adresse);
  return (
    addresses.find((a) => a.type_adresse === 'Adresse postale') ||
    addresses.find((a) => a.type_adresse === 'Adresse') ||
    null
  );
}

/** true si la fiche a une VRAIE adresse de correspondance ("Adresse postale"),
 * pas seulement une adresse d'accueil physique. cf. bug constaté sur caf-17 : le
 * siège de La Rochelle n'a qu'une "Adresse" (avec un code postal fautif "170000"
 * dans la donnée source), alors que les 5 accueils du même département ont tous
 * la vraie "Adresse postale" (17073 La Rochelle Cedex 9) — sans cette distinction,
 * l'algorithme aurait pu retenir la fiche "siège" malgré sa donnée de moins bonne
 * qualité, au seul motif qu'elle "a l'air" canonique. */
function hasGenuinePostalAddress(record) {
  return parseJsonField(record.adresse).some((a) => a.type_adresse === 'Adresse postale');
}

function baseName(nom) {
  const idx = nom.indexOf(' - ');
  return (idx === -1 ? nom : nom.slice(0, idx)).trim();
}

function looksPreferred(nom) {
  // Détecte un suffixe de branche/accueil séparé par un tiret cadratin (-), demi-
  // cadratin (–) ou tiret du 6 (—), pas seulement le tiret ASCII " - " : repéré sur
  // une fiche caf ("Centre Social ... – Point d'accueil ... – Marseille") qui
  // utilise des tirets typographiques et échappait donc à la détection ASCII pure.
  return /si[eè]ge/i.test(nom) || !/ [-–—] /.test(nom);
}

function addressTupleKey(addr) {
  return JSON.stringify([addr.numero_voie || '', addr.service_distribution || '', addr.code_postal || '', addr.nom_commune || '']);
}

/** Sélectionne LA fiche représentative d'un groupe (réseau, département) — cf.
 * l'algorithme documenté dans le header du fichier. */
function pickRepresentative(records) {
  const withPostal = records
    .map((r) => ({ record: r, addr: pickPostalAddress(r) }))
    .filter((x) => x.addr);
  if (withPostal.length === 0) return { warning: 'aucune adresse exploitable dans le groupe' };

  // Priorité aux fiches ayant une VRAIE "Adresse postale" (cf. hasGenuinePostalAddress) :
  // une fiche "Adresse" seule (accueil physique, parfois de moins bonne qualité —
  // ex. code postal fautif observé sur caf-17) n'est utilisée qu'à défaut, quand
  // AUCUNE fiche du groupe n'a d'adresse de correspondance déclarée.
  const genuinePostal = withPostal.filter((x) => hasGenuinePostalAddress(x.record));
  const postalPool = genuinePostal.length > 0 ? genuinePostal : withPostal;

  const preferred = postalPool.filter((x) => looksPreferred(x.record.nom));
  const pool = preferred.length > 0 ? preferred : postalPool;

  const freq = new Map();
  for (const x of pool) {
    const key = addressTupleKey(x.addr);
    if (!freq.has(key)) freq.set(key, []);
    freq.get(key).push(x);
  }
  let bestGroup = null;
  for (const [, group] of [...freq.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (!bestGroup || group.length > bestGroup.length) {
      bestGroup = group;
    }
  }
  bestGroup.sort((a, b) => {
    const nameA = a.record.nom;
    const nameB = b.record.nom;
    if (nameA.length !== nameB.length) return nameA.length - nameB.length;
    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
  });
  const winner = bestGroup[0];
  return { record: winner.record, addr: winner.addr };
}

function slugifyRegion(nom) {
  // Nom typique : "Caisse d'assurance retraite et de la santé au travail (Carsat)
  // - Midi-Pyrénées" ou "Caisse générale de sécurité sociale (CGSS) - Guadeloupe"
  // ou "Caisse nationale d'assurance vieillesse (Cnav) Assurance retraite Île-de-France".
  let label = nom.includes(' - ') ? nom.slice(nom.indexOf(' - ') + 3) : nom;
  if (/île-de-france/i.test(label) || /ile-de-france/i.test(nom)) label = 'idf';
  if (/cgss/i.test(nom)) label = `cgss-${label}`;
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Repli de dernier recours pour les Cedex dédiés d'une grande administration dont
 * le nom légal complet dépasse 45 caractères (ex. "Caisse primaire d'assurance
 * maladie de Gironde" = 47 car., seule ligne disponible dans l'adresse postale
 * source). On dérive une forme courte `<SIGLE> <suffixe>` à partir du sigle DÉJÀ
 * présent entre parenthèses dans le nom source (ex. "(CPAM)", "(Caf)") — donnée
 * sourcée, pas inventée : c'est l'abréviation que l'organisme lui-même utilise
 * dans son propre nom officiel publié par la DILA, appliquée mécaniquement.
 * Retourne `null` si le nom ne suit pas ce format « ... (SIGLE) <suffixe> ». */
function deriveAcronymLine(canonicalName) {
  const match = canonicalName.match(/\(([^)]+)\)\s*(.+)$/);
  if (!match) return null;
  const acronym = match[1].trim();
  const suffix = match[2].trim().replace(/^[-–—]\s*/, '');
  if (!acronym || !suffix) return null;
  return `${acronym} ${suffix}`;
}

function buildOrganisationRow({ id, name, network, department, addr, sourceUrl, verifiedAt, warnings }) {
  const numeroVoie = (addr.numero_voie || '').trim();
  const serviceDistribution = (addr.service_distribution || '').trim();
  const complement1 = (addr.complement1 || '').trim();
  const complement2 = (addr.complement2 || '').trim();
  const postalCode = (addr.code_postal || '').trim();
  const city = (addr.nom_commune || '').trim();

  // Tentative principale : voie + mention spéciale de distribution (les lignes
  // réellement nécessaires à la distribution, cf. header). Repli sur les
  // compléments d'identification (souvent redondants avec `name`, cf. header)
  // UNIQUEMENT quand la tentative principale échoue — cas réel rencontré : grandes
  // administrations (ex. CPAM de Paris) dont l'adresse postale est un code Cedex
  // dédié sans numéro de voie ni boîte CS/BP ; le nom de l'organisme est alors la
  // seule ligne d'adresse disponible. Dernier repli : forme courte à sigle
  // (cf. deriveAcronymLine) quand même le nom complet dépasse 45 caractères.
  const lines =
    packLines([numeroVoie, serviceDistribution]) ||
    packLines([complement1, complement2, numeroVoie, serviceDistribution]) ||
    packLines([deriveAcronymLine(name)]);
  if (!lines) {
    warnings.push(`REJET ${id} : adresse "${[complement1, complement2, numeroVoie, serviceDistribution].filter(Boolean).join(' / ')}" ne tient pas sur ${MAX_LINE_LENGTH}x2 caractères (repli sigle "${deriveAcronymLine(name) || 'n/a'}" non plus)`);
    return null;
  }
  if (!POSTAL_CODE_RE.test(postalCode)) {
    warnings.push(`REJET ${id} : code postal invalide "${postalCode}"`);
    return null;
  }
  if (city.length === 0 || city.length > MAX_LINE_LENGTH) {
    warnings.push(`REJET ${id} : ville invalide ou trop longue "${city}"`);
    return null;
  }
  if (department !== null && !DEPARTMENT_RE.test(department)) {
    warnings.push(`REJET ${id} : département invalide "${department}"`);
    return null;
  }

  return {
    id,
    name,
    kind: 'caisse_locale',
    network,
    department,
    address_line1: lines[0],
    address_line2: lines[1] || null,
    postal_code: postalCode,
    city,
    verified_at: verifiedAt,
    source_url: sourceUrl,
  };
}

function sqlString(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const verifiedAt = new Date().toISOString().slice(0, 10);
  const warnings = [];
  const rows = [];
  const countsByNetwork = {};

  for (const { network, pivotCode, namePrefixRoot, stripBranchSuffix } of DEPARTMENTAL_NETWORKS) {
    const allRecords = await fetchAllByPivotCode(pivotCode);
    const records = allRecords.filter((r) => {
      const ok = namePrefixRoot.test(r.nom);
      if (!ok) warnings.push(`IGNORÉ (${network}) : fiche hors-nom-attendu "${r.nom}" (hébergée par une structure tierce ?)`);
      return ok;
    });
    const byDept = new Map();
    for (const r of records) {
      const pivot = parseJsonField(r.pivot)[0];
      const insee = pivot?.code_insee_commune?.[0];
      const dept = deptFromInsee(insee);
      if (!dept) {
        warnings.push(`IGNORÉ (${network}) : fiche "${r.nom}" sans code_insee_commune exploitable`);
        continue;
      }
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept).push(r);
    }

    let acceptedDepartments = 0;
    for (const [dept, group] of byDept.entries()) {
      const picked = pickRepresentative(group);
      if (!picked.record) {
        warnings.push(`REJET ${network}-${dept} : ${picked.warning}`);
        continue;
      }
      const id = `${network}-${dept.toLowerCase()}`;
      const row = buildOrganisationRow({
        id,
        name: stripBranchSuffix ? baseName(picked.record.nom) : picked.record.nom,
        network,
        department: dept,
        addr: picked.addr,
        sourceUrl: picked.record.url_service_public || null,
        verifiedAt,
        warnings,
      });
      if (row) {
        rows.push(row);
        acceptedDepartments += 1;
      }
    }

    countsByNetwork[network] = acceptedDepartments;
    if (acceptedDepartments < MIN_DEPARTMENTS_DEFAULT) {
      console.error(
        `ERREUR garde-fou : réseau "${network}" n'a que ${acceptedDepartments} départements valides (attendu >= ${MIN_DEPARTMENTS_DEFAULT}).`,
      );
      for (const w of warnings) console.error(`  - ${w}`);
      process.exit(1);
    }
  }

  // CARSAT : réseau régional, PAS départemental — garde-fou adapté, cf. § CARSAT
  // du header. Aucune fan-out par département (department = null).
  {
    const records = await fetchAllByPivotCode('carsat');
    let accepted = 0;
    const seenIds = new Set();
    for (const r of records) {
      const addr = pickPostalAddress(r);
      if (!addr) {
        warnings.push(`REJET carsat "${r.nom}" : aucune adresse exploitable`);
        continue;
      }
      const id = `carsat-${slugifyRegion(r.nom)}`;
      if (seenIds.has(id)) {
        warnings.push(`REJET carsat "${r.nom}" : slug "${id}" en collision (déduplication manuelle nécessaire)`);
        continue;
      }
      const row = buildOrganisationRow({
        id,
        // Nom complet conservé tel quel : pour carsat, le suffixe " - <région>" fait
        // partie de l'identité de la caisse (pas un accueil/branche à retirer comme
        // pour caf/cpam/impots) — baseName() le tronquerait à tort en "(Carsat)" nu.
        name: r.nom,
        network: 'carsat',
        department: null,
        addr,
        sourceUrl: r.url_service_public || null,
        verifiedAt,
        warnings,
      });
      if (row) {
        seenIds.add(id);
        rows.push(row);
        accepted += 1;
      }
    }
    countsByNetwork.carsat = accepted;
    if (accepted < MIN_RECORDS_CARSAT) {
      console.error(
        `ERREUR garde-fou (adapté) : réseau "carsat" n'a que ${accepted} fiches valides (attendu >= ${MIN_RECORDS_CARSAT}, cf. § CARSAT du header).`,
      );
      for (const w of warnings) console.error(`  - ${w}`);
      process.exit(1);
    }
  }

  if (rows.length === 0) {
    console.error('ERREUR : aucune ligne générée — API vide ou schéma incompatible. STOP (voir warnings ci-dessus).');
    process.exit(1);
  }

  // Tri déterministe par slug pour des diffs propres à chaque régénération.
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const columns = [
    'id',
    'name',
    'kind',
    'network',
    'department',
    'address_line1',
    'address_line2',
    'postal_code',
    'city',
    'verified_at',
    'source_url',
  ];
  const valuesSql = rows
    .map((row) => {
      const values = columns.map((col) => {
        if (col === 'verified_at') return `date ${sqlString(row[col])}`;
        return sqlString(row[col]);
      });
      return `  (${values.join(', ')})`;
    })
    .join(',\n');

  const countsLines = Object.entries(countsByNetwork)
    .map(([network, count]) => `--   - ${network} : ${count}`)
    .join('\n');

  const migrationSql = `-- Seed de l'annuaire des organismes (chantier 2a, Task 2) — GÉNÉRÉ, ne pas éditer à la
-- main : régénérer via \`node scripts/import-organisations.mjs\` (voir l'en-tête de ce
-- script pour les détails de l'algorithme et les décisions de conception).
--
-- Source : Annuaire de l'administration (DILA / service-public.fr), licence ouverte
-- (https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration).
-- Date d'import : ${verifiedAt} (colonne verified_at). ${rows.length} organismes.
--
-- Comptes par réseau :
${countsLines}
--
-- CARSAT : réseau régional (15 caisses métropole + Île-de-France + 4 CGSS DOM),
-- PAS départemental — department = null pour ces lignes, id slugifié par région
-- (ex. 'carsat-midi-pyrenees'). Cf. § CARSAT dans scripts/import-organisations.mjs :
-- la résolution "network + department" (Task 9) ne pourra pas atteindre une CARSAT
-- via le département du défunt tant qu'un mapping région -> départements vérifié
-- (sourcé, pas deviné) n'aura pas été ajouté séparément.
--
-- on conflict (id) do nothing : migration rejouable, jamais d'écrasement d'une
-- éventuelle correction manuelle ultérieure (aucune policy d'écriture applicative,
-- cf. migration Task 1 — seule une migration versionnée peut modifier cette table).
insert into organisations (${columns.join(', ')}) values
${valuesSql}
on conflict (id) do nothing;
`;

  await writeFile(OUTPUT_MIGRATION, migrationSql, 'utf8');

  console.log(`OK : ${rows.length} organismes écrits dans ${path.relative(process.cwd(), OUTPUT_MIGRATION)}`);
  console.log('Comptes par réseau :', countsByNetwork);
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} avertissement(s) (entrées rejetées ou ignorées) :`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error('ÉCHEC import-organisations :', err);
  process.exit(1);
});
