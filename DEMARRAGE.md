# Démarrage sur vps-andiam

## 1. Préparer (5 minutes, une seule fois)
```bash
ssh vps-andiam
free -h && df -h            # MySQL + build Vite + entraînement : prévoir 3 Go de RAM libres
mkdir -p ~/reparu && cd ~/reparu && git init

# décompresser le kit ici (CLAUDE.md, PLAN.md, .claude/, docs/ avec cahier des charges et maquette)
```

## 2. Lancer Claude Code dans tmux (pas dans le terminal de VS Code)
Si la connexion SSH ou VS Code se ferme, la session tmux continue.
```bash
tmux new -s reparu
cd ~/reparu
claude --permission-mode acceptEdits
```
Détacher : `Ctrl+b` puis `d`. Revenir : `tmux attach -t reparu`.

## 3. Premier message (plan d'abord)
> Lis CLAUDE.md, PLAN.md, docs/cahier_des_charges.md et la maquette dans docs/maquette/. Passe en mode plan : signale les incohérences du cahier des charges, propose le schéma de BDD et la liste des écrans, puis attends ma validation.

Relire le plan (10 minutes), corriger, valider.

## 4. Message d'exécution autonome
> Exécute PLAN.md de M0 à M10 sans me poser de questions, en respectant CLAUDE.md : décisions dans DECISIONS.md, tests verts avant chaque commit, on enchaîne. Arrête-toi uniquement si un jalon entier est impossible.

## 5. Contrôle (2 fois par jour, 5 minutes)
```bash
git log --oneline | head
cat docs/JOURNAL.md docs/BLOCKERS.md docs/DECISIONS.md
```
Si le contexte sature, relancer avec `claude --continue`, ou une nouvelle session : « Reprends PLAN.md au premier jalon non coché. »
