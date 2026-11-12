# NTW inventory QA verification — 2026-11-12

This branch is for a Vercel Preview deployment only. Application code starts from production commit df6d32a20aba1320365b9b431f97649acc5a9dab.

- Use the rotated NTW credentials stored as Vercel Preview secrets.
- Verify the configured QA InventoryService endpoint and existing Ship-to account.
- Perform inventory lookups only; do not place orders, take payments, or send customer messages.
- Do not promote this deployment to Production.
- A successful deployment alone does not establish successful NTW connectivity; confirm actual inventory responses and runtime logs.

Verification is pending. No credentials are stored in this file.
