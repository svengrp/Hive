/* Pages légales : confidentialité (LPD art. 19 / RGPD art. 13), conditions d'utilisation
   et de vente, mentions légales (LCD art. 3 al. 1 let. s).
   Rédigées d'après le fonctionnement réel de Hive. Toute modification de ces textes :
   changer LAST_UPDATE ici et TERMS_VERSION dans backend/utils/legal.js. */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSeo } from "../lib/seo";
import classes from "./Legal.module.css";

const LAST_UPDATE = "6 octobre 2026";
const CONTACT = "contact@hive-app.ch";
const OPERATOR = "Sven Greppin";
const ADDRESS = "Chemin Doctoresse-Champendal 10, 1206 Genève, Suisse";

const Mail = () => <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

function LegalLayout({ title, description, path, children }) {
  const { t, i18n } = useTranslation();
  useSeo({ title, description, path });
  return (
    <article className={classes.page}>
      <header className={classes.header}>
        <h1 className={classes.title}>{title}</h1>
        <p className={classes.updated}>{t("legal.lastUpdate")} : {LAST_UPDATE}</p>
        {!i18n.language?.startsWith("fr") && <p className={classes.notice}>{t("legal.frenchPrevails")}</p>}
      </header>
      <div className={classes.body}>{children}</div>
      <nav className={classes.related} aria-label={t("legal.related")}>
        <Link to="/confidentialite">{t("legal.privacyTitle")}</Link>
        <Link to="/conditions">{t("legal.termsTitle")}</Link>
        <Link to="/mentions-legales">{t("legal.imprintTitle")}</Link>
      </nav>
    </article>
  );
}

/* ───────────────────────── Politique de confidentialité ───────────────────────── */
export function PrivacyPolicy() {
  const { t } = useTranslation();
  return (
    <LegalLayout title={t("legal.privacyTitle")} description="Quelles données Hive traite, pourquoi, chez qui, combien de temps, et comment exercer tes droits (LPD et RGPD)." path="/confidentialite">
      <p>
        Hive est une plateforme qui aide à réunir des personnes autour de projets. Cette politique explique
        quelles données personnelles nous traitons, pourquoi, avec qui elles sont partagées et quels sont tes droits.
        Elle s'applique au site hive-app.ch et respecte la loi fédérale suisse sur la protection des données (LPD)
        et, pour les personnes situées dans l'Union européenne, le règlement général sur la protection des données (RGPD).
      </p>

      <h2>1. Responsable du traitement</h2>
      <p>
        {OPERATOR}, {ADDRESS}. Contact pour toute question sur tes données : <Mail />.
      </p>

      <h2>2. Données que nous traitons</h2>
      <h3>Compte</h3>
      <ul>
        <li>Adresse email et mot de passe (le mot de passe est stocké uniquement sous forme chiffrée irréversible).</li>
        <li>Si tu te connectes avec Google ou GitHub : ton identifiant chez ce service, ton nom et ta photo de profil transmis par celui-ci.</li>
        <li>Date et version des conditions acceptées à l'inscription.</li>
      </ul>
      <h3>Profil (renseigné librement par toi)</h3>
      <ul>
        <li>Prénom, nom, nom d'affichage, photo, biographie, âge, langues, formation, compétences, téléphone, adresse.</li>
        <li>
          <strong>Ce qui est public :</strong> nom d'affichage, prénom et nom, photo, biographie, âge, langues, formation,
          compétences, <strong>ville et pays uniquement</strong>, réputation et date d'inscription.
          Ta rue, ton code postal, ton email et ton téléphone ne sont jamais affichés publiquement.
        </li>
      </ul>
      <h3>Projets et activité</h3>
      <ul>
        <li>Projets que tu crées : titre, description, thèmes, compétences recherchées, dates, image de couverture et <strong>emplacement sur la carte</strong>.</li>
        <li>Candidatures envoyées, participations, notes données et reçues, messages, tâches et rendez-vous dans les espaces projet.</li>
        <li>Projets que tu consultes en étant connecté (pour te recommander des projets proches de tes intérêts).</li>
      </ul>
      <h3>Paiements (Hive+ et Boost)</h3>
      <ul>
        <li>
          Les paiements sont traités par Stripe. Hive ne voit ni ne stocke jamais ton numéro de carte.
          Nous conservons seulement ton identifiant client Stripe, l'état de ton abonnement et tes crédits de Boost.
        </li>
      </ul>
      <h3>Données techniques</h3>
      <ul>
        <li>Adresse IP, type de navigateur et pages demandées, dans les journaux techniques de nos serveurs (sécurité et diagnostic).</li>
        <li>Compteurs anonymes de fonctionnement (nombre d'inscriptions, de projets créés), sans donnée personnelle.</li>
      </ul>

      <h2>3. Ta position géographique</h2>
      <p>
        <strong>Sur la carte :</strong> si tu cliques sur « Autour de moi », ton navigateur te demande l'autorisation
        de partager ta position. Elle sert uniquement à centrer la carte sur les projets proches de toi.
        Elle reste dans ton navigateur : <strong>elle n'est ni envoyée à nos serveurs ni enregistrée</strong>.
        Tu peux refuser sans aucune conséquence, la carte fonctionne normalement.
      </p>
      <p>
        <strong>Pour un projet :</strong> l'emplacement que tu choisis en créant un projet est enregistré et
        <strong> affiché publiquement sur la carte</strong>, afin que les personnes proches puissent le trouver.
        Indique un lieu public ou approximatif (quartier, ville), jamais ton domicile.
        Pour retrouver une adresse, le texte que tu tapes est envoyé au service de recherche d'adresses
        Nominatim (OpenStreetMap).
      </p>

      <h2>4. Pourquoi nous utilisons tes données (finalités et bases légales)</h2>
      <ul>
        <li><strong>Faire fonctionner Hive</strong> (compte, projets, candidatures, messagerie, carte) : exécution du contrat que tu acceptes en t'inscrivant (RGPD art. 6 al. 1 let. b).</li>
        <li><strong>Encaisser les paiements et tenir la comptabilité</strong> : exécution du contrat et obligation légale (RGPD art. 6 al. 1 let. b et c ; CO art. 958f).</li>
        <li><strong>Sécurité</strong> (prévention des abus, blocage après trop de tentatives de connexion, modération) : intérêt légitime (RGPD art. 6 al. 1 let. f).</li>
        <li><strong>Recommandations de projets</strong> selon les projets consultés : intérêt légitime à te proposer des projets pertinents. Aucune décision automatisée produisant des effets juridiques n'est prise.</li>
        <li><strong>Emails</strong> : codes de vérification, réinitialisation du mot de passe, et notifications de nouveaux messages (désactivables dans ton profil).</li>
      </ul>
      <p>Nous ne vendons pas tes données et n'utilisons aucun cookie publicitaire ni outil de suivi publicitaire.</p>

      <h2>5. Prestataires et pays de traitement</h2>
      <p>Nous faisons appel aux prestataires suivants, qui traitent des données pour notre compte ou pour fournir leur service :</p>
      <div className={classes.tableWrap}>
        <table>
          <thead><tr><th>Prestataire</th><th>Rôle</th><th>Pays</th></tr></thead>
          <tbody>
            <tr><td>Render Services, Inc.</td><td>Hébergement du site et de l'API</td><td>États-Unis / UE selon la région du serveur</td></tr>
            <tr><td>MongoDB, Inc. (Atlas)</td><td>Base de données</td><td>États-Unis / UE selon la région du serveur</td></tr>
            <tr><td>Stripe Payments Europe, Ltd.</td><td>Paiements</td><td>Irlande, États-Unis</td></tr>
            <tr><td>Zoho Corporation (zoho.eu)</td><td>Envoi des emails</td><td>Union européenne</td></tr>
            <tr><td>Google LLC, GitHub, Inc.</td><td>Connexion via ces comptes (si tu la choisis)</td><td>États-Unis</td></tr>
            <tr><td>OpenStreetMap Foundation (Nominatim)</td><td>Recherche d'adresses à la création d'un projet</td><td>Royaume-Uni, UE</td></tr>
            <tr><td>OpenFreeMap, Esri, Inc.</td><td>Affichage des fonds de carte (reçoivent ton adresse IP)</td><td>UE, États-Unis</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Le Royaume-Uni et l'Union européenne offrent un niveau de protection reconnu adéquat par la Suisse.
        Pour les États-Unis, les transferts reposent sur la certification des prestataires au Data Privacy Framework
        (Suisse–États-Unis et UE–États-Unis) ou, à défaut, sur les clauses contractuelles types de la Commission européenne
        reconnues par le Préposé fédéral à la protection des données (PFPDT).
      </p>

      <h2>6. Durée de conservation</h2>
      <ul>
        <li>Compte, profil, projets et messages : jusqu'à la suppression de ton compte.</li>
        <li>Quand tu supprimes ton compte : tes données sont effacées immédiatement. Tes projets sont supprimés ; dans les projets d'autres personnes, tes messages sont remplacés par « [supprimé] » pour que la discussion reste lisible.</li>
        <li>Factures et données de paiement : conservées 10 ans par Stripe et dans notre comptabilité (obligation légale, CO art. 958f).</li>
        <li>Journaux techniques : quelques semaines au maximum.</li>
        <li>Codes de vérification et de réinitialisation : quelques minutes, jusqu'à leur expiration.</li>
      </ul>

      <h2>7. Stockage dans ton navigateur (cookies)</h2>
      <p>
        Hive n'utilise <strong>aucun cookie de suivi ni de publicité</strong>. Ton navigateur conserve uniquement
        ce qui est strictement nécessaire au fonctionnement du site : ton jeton de connexion, les informations de
        ton compte pour l'affichage, ton thème (clair ou sombre) et ton dernier email de connexion.
        Ces éléments ne servent à rien d'autre et disparaissent quand tu te déconnectes ou vides les données du site.
        Lors d'un paiement, Stripe peut déposer ses propres cookies, nécessaires à la sécurité du paiement.
      </p>

      <h2>8. Sécurité</h2>
      <p>
        Connexions chiffrées (HTTPS), mots de passe et codes stockés sous forme chiffrée irréversible,
        double authentification disponible, verrouillage après plusieurs tentatives de connexion échouées,
        accès administrateur limité. Aucun système n'est infaillible : en cas de violation présentant un risque
        pour toi, nous informerons les autorités compétentes et, si nécessaire, les personnes concernées.
      </p>

      <h2>9. Tes droits</h2>
      <p>Tu peux à tout moment :</p>
      <ul>
        <li><strong>Accéder à tes données et les récupérer</strong> : bouton « Télécharger mes données » dans ton profil (fichier JSON).</li>
        <li><strong>Les corriger</strong> : directement dans ton profil.</li>
        <li><strong>Supprimer ton compte et tes données</strong> : bouton « Supprimer mon compte » dans ton profil.</li>
        <li><strong>T'opposer</strong> à un traitement fondé sur notre intérêt légitime, ou en demander la limitation.</li>
        <li><strong>Désactiver les emails</strong> de notification dans ton profil.</li>
      </ul>
      <p>
        Pour toute autre demande, écris-nous à <Mail />. Nous répondons dans un délai de 30 jours.
        Tu peux aussi déposer une plainte auprès du Préposé fédéral à la protection des données et à la
        transparence (PFPDT, edoeb.admin.ch) ou, si tu résides dans l'Union européenne, auprès de l'autorité
        de protection des données de ton pays.
      </p>

      <h2>10. Âge minimum</h2>
      <p>Hive est réservé aux personnes de 16 ans ou plus. Si nous apprenons qu'un compte appartient à une personne plus jeune, nous le supprimons.</p>

      <h2>11. Modifications</h2>
      <p>
        Nous pouvons mettre à jour cette politique, par exemple si Hive évolue. La date de mise à jour figure en haut
        de la page. En cas de changement important, nous t'en informerons par email ou sur le site.
      </p>
    </LegalLayout>
  );
}

/* ─────────────────────── Conditions d'utilisation et de vente ─────────────────────── */
export function Terms() {
  const { t } = useTranslation();
  return (
    <LegalLayout title={t("legal.termsTitle")} description="Règles d'utilisation de Hive, abonnement Hive+ et Boost : prix, renouvellement, résiliation et remboursement." path="/conditions">
      <p>
        Ces conditions régissent l'utilisation de Hive (hive-app.ch), exploité par {OPERATOR}, {ADDRESS} (« Hive », « nous »).
        En créant un compte, tu les acceptes, ainsi que la <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>1. Le service</h2>
      <p>
        Hive permet de publier des projets (associatifs, sportifs, culturels, professionnels…), de trouver des
        personnes pour y participer, de candidater, d'échanger par messagerie et d'organiser le projet en équipe.
        La création et la participation aux projets sont gratuites. Des options payantes (Hive+ et Boost) sont proposées.
      </p>

      <h2>2. Ton compte</h2>
      <ul>
        <li>Tu dois avoir <strong>16 ans ou plus</strong> pour créer un compte.</li>
        <li>Tu fournis des informations exactes et tu gardes ton mot de passe confidentiel. Tu es responsable de l'activité de ton compte.</li>
        <li>Un compte est personnel et ne peut pas être cédé.</li>
        <li>Tu peux supprimer ton compte à tout moment depuis ton profil.</li>
      </ul>

      <h2>3. Règles de la communauté</h2>
      <p>Il est interdit d'utiliser Hive pour :</p>
      <ul>
        <li>publier des contenus illicites, haineux, discriminatoires, violents, pornographiques ou trompeurs ;</li>
        <li>harceler, menacer ou importuner d'autres membres ;</li>
        <li>envoyer de la publicité non sollicitée, du spam ou des arnaques ;</li>
        <li>publier les données personnelles d'autrui sans son accord ;</li>
        <li>proposer des projets illégaux, ou des emplois rémunérés déguisés contraires au droit du travail ;</li>
        <li>porter atteinte au fonctionnement ou à la sécurité du site.</li>
      </ul>
      <p>
        Nous pouvons retirer un contenu, suspendre ou supprimer un compte qui ne respecte pas ces règles,
        après avertissement sauf en cas de manquement grave. Tu peux signaler un contenu ou un membre à <Mail />.
      </p>

      <h2>4. Tes contenus</h2>
      <p>
        Tu restes propriétaire de ce que tu publies (textes, images, projets). Tu autorises Hive à les afficher,
        les héberger et les adapter techniquement (par exemple redimensionner une image) dans le seul but de faire
        fonctionner le service, pour la durée de leur publication. Tu garantis disposer des droits sur ce que tu publies.
      </p>

      <h2>5. Rôle de Hive</h2>
      <p>
        Hive met des personnes en relation. Nous ne sommes pas partie aux accords conclus entre membres et ne
        garantissons ni la réalisation des projets, ni le comportement des participants. Fais preuve de prudence,
        notamment lors de rencontres en personne ou d'échanges d'argent entre membres. Les notes et la réputation
        reflètent l'avis des membres, pas celui de Hive.
      </p>

      <h2>6. Offres payantes : Hive+ et Boost</h2>
      <h3>Prix et paiement</h3>
      <p>
        Les prix sont indiqués en francs suisses (CHF) sur la page <Link to="/abonnement">Abonnement</Link> au moment
        de l'achat. Le paiement est traité de façon sécurisée par Stripe (carte bancaire et autres moyens proposés).
      </p>
      <h3>Hive+ (abonnement)</h3>
      <ul>
        <li>Hive+ est un abonnement mensuel ou annuel donnant accès aux avantages décrits sur la page Abonnement, dont des crédits de Boost.</li>
        <li><strong>Renouvellement automatique</strong> à la fin de chaque période, au prix en vigueur, jusqu'à résiliation.</li>
        <li><strong>Résiliation</strong> à tout moment depuis la section Abonnement de ton profil. Elle prend effet à la fin de la période déjà payée ; tu gardes Hive+ jusque-là. La période en cours n'est pas remboursée, sauf droit de rétractation ci-dessous.</li>
        <li>En cas de changement de prix, nous t'en informons au moins 30 jours avant ton prochain renouvellement ; tu peux résilier avant.</li>
        <li>Si un paiement échoue, l'abonnement peut être suspendu jusqu'à régularisation.</li>
      </ul>
      <h3>Boost</h3>
      <p>
        Un Boost met un projet en avant pendant la durée indiquée lors de l'achat (actuellement 48 heures).
        Il démarre immédiatement après le paiement ou l'utilisation d'un crédit.
      </p>
      <h3>Droit de rétractation (consommateurs résidant dans l'Union européenne)</h3>
      <p>
        Si tu es un consommateur résidant dans l'UE, tu disposes d'un délai de 14 jours à compter de l'achat pour
        te rétracter, en nous écrivant à <Mail />. En demandant l'activation immédiate de Hive+ ou d'un Boost, tu
        acceptes que le service commence avant la fin de ce délai : en cas de rétractation, le montant correspondant
        à la période déjà fournie reste dû, et un Boost entièrement exécuté n'est plus rétractable.
      </p>
      <h3>TVA</h3>
      <p>Hive n'est actuellement pas assujetti à la TVA ; les prix affichés sont des prix finaux.</p>

      <h2>7. Disponibilité</h2>
      <p>
        Nous faisons notre possible pour que Hive soit accessible en permanence, sans pouvoir le garantir
        (maintenance, pannes de prestataires). Nous pouvons faire évoluer les fonctionnalités ; une fonctionnalité
        payante ne sera pas retirée pendant une période déjà payée sans remboursement proportionnel.
      </p>

      <h2>8. Responsabilité</h2>
      <p>
        Dans les limites autorisées par la loi, Hive n'est pas responsable des dommages indirects ni des contenus
        publiés par les membres, ni des relations entre membres. Notre responsabilité pour faute intentionnelle ou
        grave négligence, ainsi que les droits impératifs des consommateurs, restent réservés.
      </p>

      <h2>9. Modification des conditions</h2>
      <p>
        Nous pouvons modifier ces conditions. Nous t'informerons des changements importants au moins 30 jours à
        l'avance par email ou sur le site. Si tu n'es pas d'accord, tu peux supprimer ton compte et résilier ton
        abonnement avant leur entrée en vigueur.
      </p>

      <h2>10. Droit applicable et for</h2>
      <p>
        Ces conditions sont soumises au droit suisse. Le for est à Genève, sous réserve des fors impératifs
        prévus par la loi, notamment en faveur des consommateurs (qui peuvent agir devant les tribunaux de leur domicile).
        Avant toute procédure, écris-nous à <Mail /> : nous chercherons une solution à l'amiable.
      </p>
    </LegalLayout>
  );
}

/* ───────────────────────────── Mentions légales ───────────────────────────── */
export function Imprint() {
  const { t } = useTranslation();
  return (
    <LegalLayout title={t("legal.imprintTitle")} description="Éditeur et contact du site Hive (hive-app.ch)." path="/mentions-legales">
      <h2>Éditeur du site</h2>
      <p>
        Hive — exploité par {OPERATOR} (entreprise individuelle)<br />
        {ADDRESS}<br />
        Email : <Mail />
      </p>

      <h2>Hébergement</h2>
      <p>
        Site et API : Render Services, Inc., San Francisco, États-Unis (render.com).<br />
        Base de données : MongoDB, Inc., New York, États-Unis (mongodb.com).
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Le nom Hive, le logo, le design et le code du site sont protégés. Les contenus publiés par les membres
        restent la propriété de leurs auteurs. Fonds de carte © contributeurs OpenStreetMap, OpenFreeMap, Esri.
        Police Satoshi © Indian Type Foundry.
      </p>

      <h2>Données personnelles</h2>
      <p>Voir la <Link to="/confidentialite">politique de confidentialité</Link>.</p>
    </LegalLayout>
  );
}
