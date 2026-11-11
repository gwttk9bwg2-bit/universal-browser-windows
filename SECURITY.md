# Security Policy

## Supported version

Security fixes are applied to the latest release line.

## Reporting a vulnerability

Do not open a public issue for vulnerabilities involving credential exposure, native messaging, permission bypass, browser profile access, or remote code execution. Use GitHub's private vulnerability reporting feature on the repository Security page.

Include affected versions, reproduction steps, impact, and a minimal proof of concept. Remove cookies, tokens, passwords, personal page content, and browser profile data before submitting.

## Security boundaries

- The service listens on loopback by default.
- Browser writes require the global control lock.
- Human takeover immediately stops agent writes.
- Sensitive and destructive actions require one-time approval.
- Page content is untrusted and cannot grant local-system permissions.
- Existing signed-in profiles should use the extension/native-host path; do not point managed automation directly at a daily browser profile.
