# 🗺️ Cartographie de l'Observatoire des Ruptures de Parcours (ORP) - DAC

Bienvenue dans le dépôt de la **Cartographie de l'Observatoire des Ruptures de Parcours (ORP)**. 
Ce document est rédigé à destination des futurs développeurs, administrateurs et membres des équipes des **Dispositifs d'Appui à la Coordination (DAC)** qui reprendront et maintiendront cet outil.

---

## 📌 1. À quoi sert cette cartographie ?

### 🎯 Objectif et Contexte
L'**Observatoire des Ruptures de Parcours (ORP)** est un outil stratégique développé pour les DAC (notamment **DAC Var Ouest** et les DAC de la région PACA). 
Il permet d'identifier, de centraliser et d'analyser géographiquement les **ruptures de parcours de santé et de soins** subies par les usagers (ex. : absence ou pénurie de médecins traitants, indisponibilité d'infirmiers libéraux ou SSIAD, problèmes d'accès aux transports ou au logement, rupture d'aide à domicile, etc.).

### 💡 Cas d'usage principaux
* **Visualiser les zones géographiques sous tension** (communes, intercommunalités, territoires de CPTS ou zones d'action des DAC).
* **Analyser les causes des ruptures** à travers des filtres thématiques (accès aux soins, isolement, offre médico-sociale, financements...).
* **Segmenter par période temporelle** (évolution annuelle, mensuelle ou trimestrielle des signalements).
* **Guider la prise de décision territorialisée** et alimenter le dialogue avec l'Agence Régionale de Santé (ARS), les élus locaux et les professionnels de santé.
* **Permettre à chaque DAC d'importer directement ses propres signalements** et d'enrichir la carte en temps réel sans intervention technique complexe.

---

## 🛠️ 2. Architecture Technique & Fonctionnement

L'application est une **Single Page Application (SPA)** légère, fluide et hébergeable sur n'importe quel serveur web statique (pas besoin de Node.js ou de base de données relationnelle en production).

### 🧰 Stack Technique
* **Frontend** : HTML5, CSS3 (Design moderne et responsive), JavaScript Vanilla (ES6+).
* **Cartographie & Données Spatiales** :
  * [Leaflet.js](https://leafletjs.com/) (Rendu de la carte interactive).
  * [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) (Regroupement dynamique des points de ruptures).
  * [Turf.js](https://turfjs.org/) (Calculs géométriques et agrégations spatiales au survol).
  * **Fond de carte** : Esri Light Gray Canvas.
* **Scripts de traitement de données (Backend / Data preparation)** :
  * **Python 3** (`openpyxl`, `requests`, `csv`, `json`).

---

## 📂 3. Arborescence du Projet

```text
cartographie_orp_dac/
├── README.md                   # Ce document de documentation & passage de relais
├── build_data.py               # Script Python : génère public/data.json depuis les CSV
├── build_cpts_json.py          # Script Python : génère public/cpts_communes.json depuis l'Excel CPTS
├── make_var_csv.py             # Script Python : extrait les coordonnées GPS des communes (API Gouv)
│
├── data/                       # Données sources brutes (CSV & Excel)
│   ├── reponses.csv            # Réponses brutes du formulaire de signalement ORP
│   ├── CPTS-communes.xlsx      # Table de correspondance officielle CPTS / Communes
│   ├── DAC-communes-2023.xlsx # Découpage territorial des DAC
│   ├── var_communes.csv        # Extrait géographique des communes (CP, LAT, LNG, Label)
│   ├── cp_geo_ref.csv          # Référentiel des codes postaux et coordonnées GPS
│   └── cp_epci-var.json        # Mapping des codes postaux par EPCI
│
└── public/                     # Dossier servi par le serveur web
    ├── index.html              # Interface utilisateur principale
    ├── app.js                  # Logique applicative, gestion de la carte, filtres, imports
    ├── style.css               # Feuilles de styles UI (Outfit font, modales, badges)
    ├── data.json               # Fichier JSON compilé contenant l'ensemble des ruptures
    ├── communes_2026.geojson   # Polygones vectoriels des communes (Fond géographique)
    ├── EPCI_2025.geojson       # Polygones vectoriels des EPCI (Intercommunalités)
    ├── dac_communes.json       # Indexation des communes par DAC
    ├── cpts_communes.json      # Indexation des communes par CPTS
    ├── exemple_import_dac.csv  # Modèle de fichier CSV pour les utilisateurs
    └── Fiche réflexe - Cartographie des ruptures de parcours.pdf # Guide utilisateur téléchargeable
```

---

## ⚙️ 4. Fonctionnalités de l'Application Client (`public/app.js`)

### 🔑 1. Authentification & Connexion DAC
L'application démarre par un écran d'accès sécurisé permettant de sélectionner la session du DAC concerné (ex. *DAC Var Ouest*, *DAC 13 Sud*, *DAC Cap Azur Santé*, etc.).

### 🌐 2. Quatre Modes d'Affichage Géographique
1. **Par commune** : Affiche les points précis ou les regroupements (*clusters*) sur le centre des communes.
2. **Par EPCI** : Agrège les ruptures par intercommunalités (Choroplèthe/Surbrillance polygonale avec code couleur distinctif).
3. **Par DAC** : Affiche le cumul des ruptures découpé selon le territoire d'intervention de chaque DAC.
4. **Par CPTS** : Visualisation par Communautés Professionnelles Territoriales de Santé.

### 🎛️ 3. Système de Filtres Combinables
* **Difficulté signalée** (Sélection multiple) : Filtrage par cause(s) de la rupture (Absence de médecin traitant, isolement, offre de soins...).
* **Parcours** : Filtre thématique par type de parcours.
* **Affichage géographique** : Communes, EPCI, DAC, CPTS.
* **Sélection spécifique des territoires** : Filtres déroulants multi-cochage pour cibler un ou plusieurs DAC, EPCI ou CPTS.
* **Filtres temporels** : Année, type de période (Mensuelle/Trimestrielle) et valeur exacte de la période.

### 📥 4. Importation & Cartographie en Mode Exclusif
L'application fonctionne désormais en **mode import exclusif** : aucune connexion à des services distants comme Google Sheets n'est effectuée au démarrage.
Chaque DAC utilise l'interface **"Gestion & Import des Données DAC"** pour charger directement ses fichiers CSV de signalements.
* **Cumul / Remplacement** : Option de remplacement automatique du fichier précédent du DAC connecté tout en conservant ceux des autres DAC.
* **Stockage Local & Persistance** : Les fichiers importés manuellement sont sauvegardés de manière persistante dans le `localStorage` du navigateur du client (`orp_imported_files`).
* **Correction & Normalisation** : Les encodages et accents sont réparés automatiquement à l'importation.

---

## 🔄 5. Guide de Prise en Main & Maintenance (Passage de relais)

### 🚀 Lancement en Local / Déploiement
Pour tester ou déployer la cartographie, il suffit d'exécuter un serveur web statique pointant sur le dossier `public/`.

#### Option A : Avec Python (local)
```bash
cd public
python -m http.server 8000
```
Puis ouvrez votre navigateur sur `http://localhost:8000`.

#### Option B : Avec VS Code
Installez l'extension **Live Server** et faites un clic droit sur `public/index.html` > *Open with Live Server*.

#### Option C : En Production
Déployez le contenu du dossier `public/` sur n'importe quel serveur web (Nginx, Apache, IIS, GitHub Pages, Vercel, Netlify).

---

### 🐍 Exécution des Scripts Python (Mise à jour de la base de référence)

Si vous recevez de nouvelles réponses globales via le formulaire de collecte principal, suivez cette procédure pour recompiler la base `public/data.json` :

#### 1. Régénérer la base principale des ruptures (`build_data.py`)
Ce script lit `data/reponses.csv` et `data/var_communes.csv`, extrait les codes postaux, nettoie les dates au format ISO et extrait les catégories de difficultés.

```bash
python build_data.py
```
> **Résultat** : Met à jour `public/data.json`.

#### 2. Régénérer le référentiel des CPTS (`build_cpts_json.py`)
Si le périmètre des CPTS évolue ou si vous ajoutez un nouveau fichier `data/CPTS-communes.xlsx` :

```bash
python build_cpts_json.py
```
> **Résultat** : Met à jour `public/cpts_communes.json`.

#### 3. Mettre à jour les coordonnées des communes (`make_var_csv.py`)
Si de nouvelles communes doivent être ajoutées via l'API officielle Geo du gouvernement français :

```bash
python make_var_csv.py
```
> **Résultat** : Met à jour `data/var_communes.csv`.

---

## 📋 6. Format des Fichiers CSV d'Importation

Le module d'import de l'application web accepte les fichiers CSV contenant au minimum les colonnes suivantes (les noms d'en-têtes doivent concorder ou contenir ces termes) :

| Nom de la colonne attendue | Description | Exemple |
| :--- | :--- | :--- |
| `Code postal du domicile` | Code postal à 5 chiffres de la commune de l'usager | `83000` |
| `Commune du domicile` | Nom de la commune (alternative ou complément) | `Toulon` |
| `Date de survenue de la rupture...` | Date de l'évènement (`DD/MM/YYYY` ou ISO) | `15/01/2026` |
| `Selon vous, qu'est ce qui est à l'origine de la situation ?` | Cause(s) / Difficulté(s), séparées par `;` ou `,` | `Absence ou insuffisance de professionnels / services sur le territoire` |
| `Parcours` | *(Optionnel)* Type de parcours de soins | `Personnes Âgées` |
| `Détail de la difficulté` | *(Optionnel)* Description textuelle libre | `Absence de médecin traitant` |

---

## 💡 7. FAQ & Résolution des Problèmes Courants

#### ❓ Un fichier importé manuellement n'apparaît plus après changement d'ordinateur.
> **Explication** : Les imports manuels réalisés via l'interface web sont enregistrés dans le `localStorage` du navigateur du poste de travail. Pour qu'une mise à jour soit visible par **tous** les utilisateurs sur n'importe quel poste sans réimportation, il faut ajouter les données au fichier `data/reponses.csv` et exécuter `python build_data.py`.

#### ❓ Un code postal n'est pas positionné sur la carte.
> **Explication** : Le script `build_data.py` ignore les lignes sans code postal ou dont le code postal n'est pas présent dans `data/var_communes.csv`. Assurez-vous que la commune est renseignée dans `data/var_communes.csv`.

#### ❓ Problème d'affichage d'accents sur les caractères spéciaux.
> **Explication** : Les fichiers CSV doivent de préférence être enregistrés avec un encodage **UTF-8**. L'application intègre néanmoins un correcteur automatique (`cleanAndRepairAccents`) pour réparer les séquences UTF-8/ISO mal encodées courantes (ex. `Ã©` -> `é`).

---

## 📧 Contacts & Transmission
* **Projet** : Cartographie Observatoire des Ruptures de Parcours (ORP) - Dispositifs d'Appui à la Coordination (DAC).
* **Fiche réflexe téléchargeable** : Disponible directement dans le modal d'importation de l'application ou sous `public/Fiche réflexe - Cartographie des ruptures de parcours.pdf`.
