# Main branch CI and production ownership

Every push and pull request to main installs the locked dependencies, runs lint and TypeScript, and builds on Linux with Node 24.

This repository remains the unimplemented Payments scaffold. The live payments.axxes.club alias is served by Tollbooth on Google Cloud Run. Tollbooth main owns its continuous deployment and verified immutable image release. Deploying this scaffold over the alias would replace the working payment product with the starter page. A dedicated Payments runtime requires an implemented application and an explicit routing migration.

Inherited Stripe route drafts referenced absent Prisma, Clerk, mail, ticket, and wallet modules. Their exact source is retained in docs/legacy-payments with .txt suffixes, outside the executable app, until a dedicated application is implemented. The live Tollbooth payment routes continue to own the production alias.
