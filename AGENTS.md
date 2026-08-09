# CanWin CRM Agent rules

1. Agent 0 owns integration, architecture, acceptance and user synchronization.
2. Agent 1 owns backend, data and security; Agent 2 owns frontend experience;
   Agent 3 owns AI, notifications, analytics and quality evidence.
3. One WBS item has one accountable owner. Agents must not overwrite another
   agent's files without an Agent 0 integration decision.
4. Do not write secrets, production identifiers, customer data or document
   contents to the repository, fixtures, logs or evidence.
5. Do not modify Team OS 3.0 while building the independent CRM.
6. Do not push directly to `main` or `develop`; use `agent/<description>` and a
   reviewed pull request after the repository has an approved default branch.
7. External accounts, ports, credentials, production resources and destructive
   actions require user cooperation or approval.
8. For the same error, attempt once, preserve evidence and pause. Do not loop or
   silently switch tools to bypass the failure.
9. Agent 0 reports after every completed WBS item and creates a memory checkpoint
   after every two completed items.
