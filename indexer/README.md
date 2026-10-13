# Dareful indexer (Envio HyperIndex)

Reads every event `DarefulLedger` and `DarefulDares` emit on Monad testnet, 13 kinds, into the records (with what remains open on each), sets, people, units, questions and calls, plus one entity per event, and serves them over GraphQL, including the `OpenBetween` query from PLANNING.md section 10. The app reads the chain's history only through it and never scans a log; the few values it reads straight from the contracts over the RPC are listed in the README's "How it works".

It syncs through HyperSync (`ENVIO_API_TOKEN` in `indexer/.env`), with no RPC in `config.yaml`. Production reads its deployment on Envio Cloud, built from the `envio` branch with `indexer` as its root directory and deployed by the runbook in `docs/decisions.md`: since October 11, the 81dc636 deployment, which caught up on October 10 and which the free plan keeps to about November 9.

From the repository root (each script loads `.env.local`):

```bash
npm run indexer:codegen   # after any change to config.yaml or schema.graphql
npm run indexer:dev       # local Postgres and Hasura in Docker, GraphQL at http://127.0.0.1:8080/v1/graphql
npm run indexer:test      # the seven handler tests, against a simulated chain
npm run indexer:stop      # stops the indexer and its containers and drops the local database
```

`indexer:dev` runs `scripts/dev/indexer-on-loopback.mjs`, which needs Docker or a runtime like Colima (its socket is found on its own) and keeps every port it opens on 127.0.0.1, since Envio publishes its containers on every interface by default. Stop it with Ctrl-C in the terminal that started it, or `npm run indexer:stop`.
