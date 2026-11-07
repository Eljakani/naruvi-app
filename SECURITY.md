# Security

Naruvi handles personal career data, mailbox access, and model credentials. Run it in a trusted environment. The default Docker configuration binds application and database ports to localhost; do not expose them publicly without appropriate access controls.

Keep the database, uploaded assets, and encryption key backed up. Store the key separately from database backups. Use dedicated service credentials where possible and revoke credentials if an instance is compromised.

## Reporting a vulnerability

Do not post secrets, private data, or exploit details in a public issue. If GitHub private vulnerability reporting is enabled for this repository, use **Security → Report a vulnerability**. Otherwise, open an issue asking the maintainer for a private reporting channel, without disclosing the vulnerability details.

Include affected versions or commit IDs, reproduction steps using synthetic data, and the potential impact in the private report. There is currently no guaranteed response-time or supported-release policy.
