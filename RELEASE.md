# CoreNote Release Flow

1. Bump the version in `package.json`.
2. Commit the release change.
3. Create and push a matching tag:

```powershell
git tag v0.1.1
git push origin main --tags
```

The GitHub Actions release workflow builds the Windows installer and publishes a draft GitHub Release.

Before publishing the draft release, install it on Windows and verify:

- CoreNote launches normally.
- Notes load and save.
- `latest.yml` and the setup `.exe` are attached to the release.

After publishing the draft release, installed CoreNote builds can find it through the in-app updater.
