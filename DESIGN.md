---
name: Hive
description: Réunir les bonnes personnes autour de n'importe quel projet.
colors:
  honey: "#f0a93b"
  honey-hover: "#f6bc5e"
  caramel: "#a0560d"
  caramel-hover: "#8a4a0b"
  honey-ink: "#2a1805"
  honey-bright: "#f08c1e"
  honey-bright-hover: "#f5a040"
  amber: "#b45309"
  amber-hover: "#92400e"
  lavender: "#6d4fc0"
  lavender-soft: "#efe9fb"
  lavender-ink: "#4a2f96"
  lavender-dark-theme: "#b79be3"
  terracotta: "#e8876b"
  terracotta-deep: "#b4472f"
  wax-bg: "#faf6f0"
  wax-surface: "#ffffff"
  wax-card: "#ffffff"
  wax-card-soft: "#f4eee5"
  wax-border: "#e8dccb"
  wax-text: "#2b2016"
  wax-text-muted: "#6f5f4c"
  propolis-bg: "#16120e"
  propolis-surface: "#1c1713"
  propolis-card: "#231d17"
  propolis-card-soft: "#2c251e"
  propolis-border: "#3a3128"
  propolis-text: "#f5ecdf"
  propolis-text-muted: "#a89885"
  danger: "#c9353a"
  danger-dark-theme: "#e5484d"
typography:
  display:
    fontFamily: "Satoshi, sans-serif"
    fontSize: "38px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.5px"
  body:
    fontFamily: "Satoshi, sans-serif"
    fontSize: "16px"
    lineHeight: 1.6
  label:
    fontFamily: "Satoshi, sans-serif"
    fontSize: "15px"
    fontWeight: 600
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  full: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
components:
  button-primary-light:
    backgroundColor: "{colors.honey-bright}"
    textColor: "{colors.honey-ink}"
    rounded: "{rounded.full}"
    padding: "12px 22px"
  button-primary-light-hover:
    backgroundColor: "{colors.honey-bright-hover}"
  button-secondary-light:
    backgroundColor: "{colors.lavender-soft}"
    textColor: "{colors.lavender-ink}"
    rounded: "{rounded.full}"
  button-primary-dark:
    backgroundColor: "{colors.honey}"
    textColor: "{colors.honey-ink}"
    rounded: "{rounded.full}"
    padding: "12px 22px"
  button-primary-dark-hover:
    backgroundColor: "{colors.honey-hover}"
  badge-unread-light:
    backgroundColor: "{colors.terracotta-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
  badge-unread-dark:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.honey-ink}"
    rounded: "{rounded.full}"
---

# Design System: Hive

## Overview

**Creative North Star: "La ruche au soleil"**

Hive réunit des gens pour n'importe quel projet, du club de foot du dimanche au site web. L'interface doit donner l'impression d'une grande table partagée un après-midi d'été, pas celle d'un outil de développeur. La chaleur vient des neutres (cire d'abeille en clair, propolis en sombre), jamais d'un gris froid ni d'un noir pur.

Deux couleurs seulement portent l'identité. Le **miel** dit « agis ici », la **terracotta** (la brique chaude de la ruche) dit « quelque chose t'attend ». Tout le reste est neutre et chaud. Le thème **clair est le thème par défaut** ; le sombre est une option mémorisée.

Anti-référence confirmée : l'ancienne palette vert émeraude sur graphite, jugée « trop technologique / informatique ».

**Key Characteristics:**
- Neutres chauds teintés miel, dans les deux thèmes.
- Une couleur d'action (miel/caramel), une couleur d'attention (terracotta).
- Formes arrondies et généreuses, boutons en pilule.
- Clair par défaut, sombre composé à part (pas une inversion).

## Colors

Une palette chaude et restreinte : miel pour agir, terracotta pour signaler, cire et propolis pour tout le reste. Les valeurs vivent dans `frontend/src/App.css` (`:root` = sombre, `body.light` = clair) ; aucun composant ne code une couleur de thème en dur.

### Primary
- **Miel** (honey) : couleur d'action du thème sombre (boutons, liens, focus, logo, pins de la carte), avec un texte **encre de miel** (honey-ink) sur les boutons.
- **Caramel** (caramel) : le même rôle en clair. Le miel vif manque de contraste sur crème ; le caramel passe AA en texte sur crème et sous un texte blanc.

### Secondary
- **Terracotta** (terracotta en sombre, terracotta-deep en clair) : badges non lus, notifications, pastilles « nouveau », tags de compétences, étoiles de réputation, une étape sur deux des illustrations, un nœud sur quatre du réseau animé du hero.

### Neutral
- **Cire** (wax-*) : fonds et bordures du thème clair. La page est crème ; tout ce qui porte du contenu (cartes, en-tête, fil de discussion, formulaires, modales) est **blanc**. Le beige (`wax-card-soft`) est réservé aux petits éléments : tags, puces, fonds d'avatar, compteurs. Jamais de beige sur beige.
- **Propolis** (propolis-*) : les mêmes rôles en sombre. Brun très profond, jamais `#000`.

### Couleurs secondaires fonctionnelles
- **Couleurs par personne** (`--person-1..5`) : miel, lavande, bleuet, corail, trèfle, pour les avatars et les noms dans les groupes. Variantes foncées en clair pour rester AA.
- **Accents de projet** (`PROJECT_ACCENTS`, `frontend/src/lib/projectCover.js`) : trèfle, framboise, ardoise, argile, prune. Aucun n'est miel, pour ne pas se confondre avec les actions.
- **Succès** : un vert doux (`#5FA86A`), réservé aux états de réussite (statut ouvert, mot de passe fort).

### Named Rules
**The Honey Means Act Rule.** Le miel/caramel est réservé à ce qui se clique : bouton principal, lien, focus, élément actif. On ne l'utilise jamais pour de la décoration pure ou un tag informatif.

**The Terracotta Means News Rule.** La terracotta signale ce qui attend l'utilisateur (non lu, nouveau, mis en avant). Elle ne sert jamais de bouton.

**The Two-Voice Rule.** Chaque écran doit laisser apparaître les deux couleurs quand le contenu s'y prête. Un écran uniquement miel sur brun retombe dans « orange et noir ».

## Typography

**Body Font:** Satoshi (avec sans-serif en repli)

**Character:** une grotesque géométrique ronde et amicale, qui garde de la personnalité aux gros corps sans devenir froide.

### Hierarchy
- **Display** (700, 38px, 1.15, -0.5px) : titre du hero ; 28px sur mobile.
- **Body** (400, 16px, 1.6) : textes courants et sous-titres.
- **Label** (600, 15px) : boutons et actions.

## Layout

Échelle d'espacement en multiples de 4px (`--space-1` à `--space-8`). Header de 64px (57px sous 600px), barre de navigation basse de 64px sous 900px. Sections de la page d'accueil centrées, avec des grilles de trois colonnes qui passent à une seule colonne sur mobile.

## Elevation & Depth

Hybride : les surfaces se distinguent d'abord par la teinte (fond → surface → carte → carte douce), les ombres ne viennent qu'en appui. En sombre, les ombres sont noires ; en clair, elles sont teintées brun chaud et allégées (`--shadow-rgb: 60, 40, 20`, `--shadow-k: 0.45`). Les ombres ont toujours un décalage vertical et un flou doux.

## Shapes

Arrondis généreux : cartes à `{rounded.xl}`, champs à `{rounded.md}`, boutons et tags en pilule (`{rounded.full}`). Les illustrations des étapes sont des galets organiques (border-radius asymétriques) de couleur franche. L'hexagone de la ruche ne sert que pour le logo.

## Components

### Buttons
- **Shape :** pilule (999px), padding 12px 22px.
- **Primaire :** caramel avec texte blanc en clair, miel avec texte encre de miel en sombre (`--cta`, `--cta-text`).
- **Survol :** caramel plus foncé en clair, miel plus lumineux en sombre, avec une ombre teintée de la couleur d'action.
- **Secondaire :** fond transparent, bordure neutre (`--border-soft`), texte principal.

### Chips / Tags
- **Tags de projet :** fond de l'accent du projet à 12 %, bordure à 35 %, texte dans l'accent.
- **Tags de compétence :** même recette, en terracotta.

### Badges
- **Non lu / nouveau :** pastille terracotta (`--highlight`), texte `--cta-text`.

### Cards
- **Background :** `--bg-card` sur `--bg-main`, bordure `--border-soft`, arrondi `{rounded.xl}`.

## Do's and Don'ts

### Do:
- **Do** passer par les variables de `App.css` (`--accent`, `--cta`, `--highlight`, `--bg-*`, `--text-*`) pour toute couleur de thème.
- **Do** vérifier les deux thèmes : le sombre se compose séparément, il n'est pas l'inverse du clair.
- **Do** garder le texte courant à 4,5:1 minimum, et les contrôles à 3:1 minimum.

### Don't:
- **Don't** réintroduire de vert émeraude ou de graphite froid comme couleur d'identité (anti-référence confirmée).
- **Don't** utiliser `#000` ou un gris neutre comme fond ; les neutres restent chauds.
- **Don't** mélanger miel et terracotta dans un dégradé : deux couleurs franches valent mieux que leur mélange.
- **Don't** ajouter d'étiquette « eyebrow » au-dessus des titres ni de numéros de section décoratifs (01 / 02 / 03).
