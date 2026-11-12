# Branching strategy

Use Git Flow: `main` is the stable release line, `develop` integrates upcoming work, and `feature/*` branches isolate changes. The existing `foundation-v0.1` tag remains unchanged.

| Branch | Base | Merge destination | Lifetime |
| --- | --- | --- | --- |
| `main` | Existing history | — | Permanent; released, verified work only |
| `develop` | `main` | Via a release into `main` | Permanent; integration branch |
| `feature/<short-kebab-name>` | `develop` | `develop` | Delete after integration |
| `release/<version>` | `develop` | `main` and back into `develop` | Optional release stabilization |
| `hotfix/<version>` | `main` | `main` and back into `develop` | Urgent released-code fixes |

Do not work directly on `main` or `develop`, force-push shared branches, or merge unfinished features into `main`. Keep changes scoped; review the diff and run `npm test` and `npm run check` before integration. Browser-facing changes should also follow the browser checks in the README.

## Local setup

The repository now has GitHub origin `https://github.com/sinh-x/money-seasons.git`.
Both `main` (release) and `develop` (integration) exist. Preserve their histories;
feature PRs target `develop`, with reviewed release promotion to `main`. The
canonical checkout may be on `main` for the guarded production workflow, so inspect
its branch/status rather than assuming it is always on `develop`. Start new work
in an admitted feature checkout as described below.

Git Flow configuration lives in `.git/config`, **not in tracked files**, so repeat the following for each clone if using the optional `git-flow` CLI. Ordinary Git commands below do not require that tool.

```sh
# In a future clone, first check out the published integration branch:
git switch develop
# Only for initial setup when develop does not yet exist locally or remotely:
# git branch develop main

git config --local gitflow.branch.master main
git config --local gitflow.branch.develop develop
git config --local gitflow.prefix.feature feature/
git config --local gitflow.prefix.release release/
git config --local gitflow.prefix.hotfix hotfix/
git config --local gitflow.prefix.support support/
git config --local gitflow.prefix.versiontag v
```

`gitflow.branch.master` is the tool's configuration key; its value is `main`. No `master` branch is needed. New release tags use `v<version>`; do not rename historical tags.

## Everyday feature workflow

Start with a clean working tree. Replace `short-description` with a descriptive name (for example, `cross-year-planning`).

```sh
git switch develop
# Once origin exists, update before branching:
# git pull --ff-only origin develop
git switch -c feature/short-description

# Make changes, then:
npm test
npm run check
git add <changed-files>
git commit -m "feat: describe the change"
```

For a local-only repository, review and integrate the committed feature:

```sh
git diff develop...feature/short-description
git switch develop
git merge --no-ff feature/short-description
npm test
npm run check
# Delete only after the merge and checks succeed:
git branch -d feature/short-description
```

With a remote, instead push using `git push -u origin feature/short-description` and open a pull request **targeting `develop`**. Prefer merge commits to preserve branch history. After it merges, update local `develop` with `git pull --ff-only origin develop` before starting another feature.

With `git-flow` installed, `git flow feature start short-description` and `git flow feature finish short-description` are local equivalents for starting and integrating a feature. Finish commits the merge and deletes the feature branch; it does not run checks or provide review. Do not finish locally when the feature should go through a pull request.

## Releases and hotfixes

For a release, branch `release/<version>` from `develop`; allow only stabilization, version, and release-note changes there. Verify the candidate, merge it into `main` with `--no-ff`, and create an annotated `v<version>` tag on the release commit. Merge the release branch back into `develop` with `--no-ff`, verify the integrated result, then delete the release branch. Never move an existing release tag.

For an urgent fix, branch `hotfix/<version>` from `main`, verify the fix, merge it into `main` with `--no-ff`, and tag the new patch version. Merge the hotfix branch into `develop` as well (and any active release branch that needs it), verify, then delete it. Routine work still starts from `develop`.

The optional CLI supports `git flow release start <version>` / `git flow release finish <version>` and `git flow hotfix start <version>` / `git flow hotfix finish <version>`. Run checks before and after finishing. The configured tag prefix is `v`, so pass a version such as `0.2.0`, not `v0.2.0`. With a hosted review workflow, use pull requests for the same merge destinations instead of finishing locally.

## When a remote is added

Only after choosing the hosting repository:

```sh
git remote add origin <repository-url>
git push -u origin main
git push -u origin develop
# Push reviewed release tags explicitly when needed:
# git push origin v0.2.0
```

Set the host's default branch to `develop` so feature pull requests naturally target it; keep `main` as the release branch. Protect both permanent branches against deletion and force pushes, require pull requests and passing checks, and require review when another reviewer is available. Configure CI checks before making them required. These are hosting settings, **not enforced by this local setup**. No remote, CI workflow, or branch protection has been provisioned here.
